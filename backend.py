"""
========================================================================================
AI TRAVEL PLANNER - MULTI-AGENT BACKEND PIPELINE
========================================================================================

Architecture Overview:
----------------------
This module implements an enterprise-grade multi-agent travel concierge application
using a hybrid AI architecture:

1. System One Decision Model (TypeSafe Jev):
   - Fast, calibrated probabilistic decision engine (System 1 "thinking fast").
   - Replaces traditional, brittle LLM "prompt-and-parse" JSON loops.
   - Evaluates input guardrails (Noul), dynamic multi-agent specialist routing
     (parallel Nouls), travel style classification (Choice), and budget feasibility
     scoring (Score) in milliseconds with typed guarantees.

2. System Two Generative Model (Groq LLM):
   - High-throughput reasoning and prose generation (System 2 "thinking slow").
   - Synthesizes specialist findings into rich, structured day-by-day itineraries,
     flight logistics advice, accommodation summaries, and comprehensive travel guides.

3. Model Context Protocol (MCP v2) Specialist Tools:
   - Aviation Tool: Global airport and airline routing databases.
   - Search Tool (Tavily): Live web intelligence for hotels, resorts, and boutique stays.
   - Weather Tool (Open-Meteo): Live current conditions and 7-day extended forecasts.

4. LangGraph StateGraph & Persistence Checkpointing:
   - Orchestrates multi-agent state flow with dynamic conditional branching.
   - Human-in-the-Loop (HITL) pause/resume capability using `interrupt()` and `Command(resume=...)`.
   - PostgreSQL (PostgresSaver) persistence with automatic fallback to InMemorySaver.

========================================================================================
WHAT IS TYPESAFE JEV DOING IN THIS BACKEND? (DEEP DIVE)
========================================================================================
Traditional LLM multi-agent systems use an LLM prompt like:
    "Respond in JSON with fields {is_travel: bool, needs_flights: bool...}"
Problems with that traditional approach:
    1. High latency (1-3 seconds per classification).
    2. Expensive token consumption.
    3. Brittle output (LLMs frequently hallucinate invalid JSON or uncalibrated confidence).
    4. Rate limiting / TPM throttling during peak loads.

How TypeSafe Jev Solves This:
TypeSafe Jev is a System One decision model trained specifically to produce typed,
calibrated probability judgments without prompt parsing.

In this pipeline, Jev is used in two key agents:

A. SUPERVISOR AGENT (Input Guardrail & Dynamic Routing):
   - Noul("is_travel"): Calibrated probability [0.0 - 1.0] indicating whether the prompt
     is actually about travel. If < 0.35, the request is immediately rejected at the
     guardrail without wasting expensive LLM tokens.
   - Parallel Nouls ("needs_flights", "needs_hotels", "needs_weather", "needs_budget"):
     Assesses in parallel which specialist agents are genuinely needed for the user's
     specific query. For example, if a user asks "Suggest hotels in Tokyo", Jev assigns
     high probability to `needs_hotels` and low probability to `needs_flights`, skipping
     unnecessary agent steps dynamically.
   - Choice("trip_style"): Classifies the travel category into mutually exclusive options:
     ['budget', 'cultural', 'luxury', 'family', 'adventure', 'general'].
   - Score("destination_clarity"): Probability-weighted expected level (0 to 2) on how
     clearly the user specified their destination.

B. BUDGET AGENT (Financial Intelligence & Risk Assessment):
   - Score("feasibility"): Probability-weighted expected score on a 3-level rubric
     (0: Tight budget risk -> 1: Feasible mid-range -> 2: Generous budget).
   - Choice("pricing_tier"): Classifies budget into ['budget', 'moderate', 'luxury'].
   - Noul("peak_risk"): Evaluates the binary risk of unexpected expenses or peak season
     surge pricing.
========================================================================================
"""

import os
import certifi
from dotenv import load_dotenv

# --------------------------------------------------------------------------------------
# 1. Environment & SSL Certificate Configuration
# --------------------------------------------------------------------------------------
# Load environment variables from .env file (API keys, database URLs, model configs)
load_dotenv()

# Configure certifi CA certificates for secure HTTPS API calls across tools & SDKs
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

from typing import Any, TypedDict, Annotated, Optional, Dict, List
import operator
import uuid
import asyncio
import json
import time
import psycopg
from psycopg.rows import dict_row

# LangGraph & LangChain Core Imports
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command, interrupt
from langchain_core.messages import (
    AnyMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
)
from langchain_groq import ChatGroq

# --------------------------------------------------------------------------------------
# TypeSafe Jev System One SDK
# --------------------------------------------------------------------------------------
# Jev primitives:
# - Noul: Evaluates a binary proposition, returning a calibrated probability (float 0.0 to 1.0).
# - Choice: Selects from a set of mutually exclusive categorical options with probability distribution.
# - Score: Computes an expected value score over an ordered rubric of criteria.
from typesafe_sdk import TypeSafeClient, Noul, Choice, Score

# Model Context Protocol (MCP) Tool Wrappers
# Interfaces to live external APIs (AviationStack, Tavily Search, Open-Meteo Weather)
from mcp_client import (
    tavily_mcp_search,
    aviation_mcp_call,
    extract_destination,
    forecast_mcp_search,
    weather_mcp_search,
)


# --------------------------------------------------------------------------------------
# 2. Database Connection Sanitization
# --------------------------------------------------------------------------------------
def get_database_url() -> Optional[str]:
    """
    Retrieve and sanitize PostgreSQL connection string with graceful fallback.
    
    Checks if DATABASE_URL is set in environment and ensures compatibility with psycopg3:
    - Normalizes driver prefix 'postgresql+psycopg://' to standard 'postgresql://'.
    - Automatically appends 'sslmode=require' for remote cloud databases (Neon, Render, Supabase).
    
    Returns:
        Sanitized PostgreSQL URL string, or None if unconfigured or placeholder.
    """
    database_url = os.getenv("DATABASE_URL")
    if not database_url or "user:password" in database_url:
        return None

    # Standardize psycopg3 connection scheme
    if database_url.startswith("postgresql+psycopg://"):
        database_url = database_url.replace("postgresql+psycopg://", "postgresql://", 1)

    # Require SSL for cloud PostgreSQL instances (e.g. Neon / Render)
    if "sslmode=" not in database_url and "localhost" not in database_url and "127.0.0.1" not in database_url:
        separator = "&" if "?" in database_url else "?"
        database_url = f"{database_url}{separator}sslmode=require"

    return database_url


# --------------------------------------------------------------------------------------
# 3. Model Initializations (Groq Generative LLM & TypeSafe Jev System One)
# --------------------------------------------------------------------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing. Please add it to your .env file.")

# Groq model selection (fast inference with high token throughput)
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

# System Two Generative Model
llm = ChatGroq(
    model=GROQ_MODEL,
    api_key=GROQ_API_KEY,
    temperature=0.3,
)

# System One Decision Model: TypeSafe Jev
# Used for sub-second calibrated judgments (guardrails, routing, classification, scoring)
TYPESAFE_API_KEY = os.getenv("TYPESAFE_API_KEY")
jev_client: Optional[TypeSafeClient] = (
    TypeSafeClient(api_key=TYPESAFE_API_KEY) if TYPESAFE_API_KEY else None
)


# --------------------------------------------------------------------------------------
# 4. State Schema Definition (LangGraph State)
# --------------------------------------------------------------------------------------
class TravelState(TypedDict, total=False):
    """
    Shared state schema passed across all nodes in the StateGraph.
    
    Fields:
        messages: Conversation history accumulated using operator.add.
        user_query: The raw user travel request string.
        
        guardrail_allowed: Boolean decision from TypeSafe Jev (True = allowed, False = blocked).
        guardrail_reason: Explanation if the guardrail rejected an off-topic request.
        selected_agents: Dynamic list of specialist agents chosen by Jev based on user needs.
        trip_constraints: Structured parameters (destination, style, budget tier, origin).
        supervisor_reasoning: Formatted audit trail of routing decisions.
        
        flight_results: Structured findings from Flight Specialist (airports, airlines, fares).
        hotel_results: Live search results from Hotel Specialist (neighborhoods, top stays).
        weather_results: Current conditions and forecasts from Weather Specialist.
        budget_results: Jev feasibility scores and detailed financial breakdown.
        itinerary: Day-by-day travel plan draft synthesized by Itinerary Specialist.
        
        approval_request: Prompt presented to the user during human review (HITL).
        approved: User approval status (True = confirmed, False = revision requested).
        human_feedback: User revision feedback if changes are requested.
        final_response: Complete polished travel guide produced by Final Concierge.
        
        raw_data: Dictionary copy of state without message objects for API serialization.
        llm_calls: Counter tracking the total number of generative LLM calls made.
    """
    messages: Annotated[list[AnyMessage], operator.add]
    user_query: str

    # Supervisor & Guardrail state (powered by Jev System One)
    guardrail_allowed: bool
    guardrail_reason: str
    selected_agents: list[str]
    trip_constraints: dict[str, Any]
    supervisor_reasoning: str

    # Specialist outputs
    flight_results: str
    hotel_results: str
    weather_results: str
    budget_results: str
    itinerary: str

    # Human-in-the-loop (HITL) review fields
    approval_request: str
    approved: bool
    human_feedback: str
    final_response: str

    # Execution telemetry
    raw_data: dict[str, Any]
    execution_times: dict[str, Any]
    llm_calls: int


# Known specialist agent registry
KNOWN_AGENTS = {
    "flight_agent",
    "hotel_agent",
    "weather_agent",
    "budget_agent",
    "itinerary_agent",
}

# Standard sequential pipeline order when full execution is required
AGENT_ORDER = [
    "flight_agent",
    "hotel_agent",
    "weather_agent",
    "budget_agent",
    "itinerary_agent",
]


def _empty_constraints() -> dict[str, Any]:
    """Helper returning default empty trip constraint dictionary."""
    return {
        "destination": "",
        "origin": "",
        "duration": "",
        "budget": "",
        "travel_style": "general",
        "special_preferences": [],
    }


# --------------------------------------------------------------------------------------
# 5. Supervisor Agent & Input Guardrail (Powered by TypeSafe Jev)
# --------------------------------------------------------------------------------------
def supervisor_agent(state: TravelState) -> Dict[str, Any]:
    """
    Supervisor Node:
    ----------------
    Acts as the entrypoint router, safety guardrail, and planning coordinator.
    
    FLOW OF EXECUTION:
    1. Reads `user_query` from the current TravelState.
    2. Sends a single parallel request to TypeSafe Jev System One containing:
       - Input Guardrail (Noul): Is this query about travel?
       - Routing Questions (4 Nouls): Does the query need flights, hotels, weather, budget?
       - Travel Style (Choice): Classify trip intent ('budget', 'cultural', 'luxury', etc.).
       - Destination Clarity (Score): Rate destination specificity on a 0-2 rubric.
    3. Evaluates Guardrail:
       - If `is_travel` probability < 0.35: Immediately route to `guardrail_blocked` node.
       - If >= 0.35: Proceed with dynamically selected specialist agents.
    4. Evaluates Specialist Activation:
       - Checks each Jev probability threshold (flight >= 0.20, hotel >= 0.30, etc.).
       - Only activates agents relevant to the user's specific request.
       - Always includes `itinerary_agent` to synthesize final outputs.
    5. Returns updated state with selected agents and structured trip constraints.
    """
    query = state["user_query"]
    llm_calls = state.get("llm_calls", 0)

    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})

    # Check if TypeSafe Jev client is initialized with a valid API key
    if jev_client:
        try:
            print("[INFO] Invoking TypeSafe Jev for typed supervisor guardrail and routing...")
            t_jev_start = time.perf_counter()
            
            # Execute all routing, guardrail, and categorization questions in ONE parallel Jev System One call
            jev_res = jev_client.system_one(
                state={"user_query": query},
                questions={
                    # Binary Guardrail: Is this a travel-related query?
                    "is_travel": Noul(
                        instructions="Is this user request related to travel, vacation, flights, hotels, weather, itineraries, destinations, sightseeing, or trip planning?"
                    ),
                    # Specialist activation decisions (parallel probabilities)
                    "needs_flights": Noul(
                        instructions="Does this trip request benefit from flight recommendations, airport routing, or airline options?"
                    ),
                    "needs_hotels": Noul(
                        instructions="Does this trip request benefit from hotel, resort, hostel, or accommodation recommendations?"
                    ),
                    "needs_weather": Noul(
                        instructions="Does this trip request benefit from weather forecasts, seasonal climate conditions, or packing advice?"
                    ),
                    "needs_budget": Noul(
                        instructions="Does this trip request specifically ask for budget analysis, cost estimation, price breakdown, or financial feasibility?"
                    ),
                    # Discrete travel style categorization
                    "trip_style": Choice(
                        instructions="What is the primary travel style or purpose?",
                        criteria={
                            "budget": "Cost-conscious, backpacking, budget-friendly",
                            "cultural": "Historical shrines, museums, cultural sights, local cuisine",
                            "luxury": "High-end luxury, 5-star hotels, fine dining",
                            "family": "Family-friendly, kid activities, relaxed pace",
                            "adventure": "Outdoor adventures, hiking, nature",
                            "general": "General leisure vacation or sightseeing"
                        }
                    ),
                    # Graded destination clarity evaluation
                    "destination_clarity": Score(
                        instructions="How clear and specific is the travel destination in this request?",
                        criteria=[
                            "No clear destination mentioned",
                            "Vague or broad region",
                            "Specific city or country clearly identified"
                        ]
                    )
                }
            )
            jev_latency_ms = round((time.perf_counter() - t_jev_start) * 1000, 1)
            times["supervisor_jev_ms"] = jev_latency_ms

            # Extract calibrated answers from TypeSafe Jev response
            is_travel_prob = float(jev_res.nouls["is_travel"].noul)
            flight_prob = float(jev_res.nouls["needs_flights"].noul)
            hotel_prob = float(jev_res.nouls["needs_hotels"].noul)
            weather_prob = float(jev_res.nouls["needs_weather"].noul)
            budget_prob = float(jev_res.nouls["needs_budget"].noul)
            trip_style = str(jev_res.choices["trip_style"].choice)
            dest_score = float(jev_res.scores["destination_clarity"].score)

            print(
                f"[Jev Decision] ({jev_latency_ms}ms) is_travel={is_travel_prob:.2f}, "
                f"flights={flight_prob:.2f}, hotels={hotel_prob:.2f}, "
                f"weather={weather_prob:.2f}, budget={budget_prob:.2f}, style='{trip_style}'"
            )

            times["supervisor_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)

            # --- STEP 1: Guardrail Enforcement ---
            # If the user asks something off-topic (e.g. "Write Python code for quicksort"), Jev flags it here
            if is_travel_prob < 0.35:
                reason = "TripMate AI can only help with travel-planning requests (flights, hotels, weather, destinations, budgets, or itineraries)."
                return {
                    "guardrail_allowed": False,
                    "guardrail_reason": reason,
                    "selected_agents": [],
                    "trip_constraints": _empty_constraints(),
                    "supervisor_reasoning": f"Jev input guardrail rejected with travel probability {is_travel_prob:.2f} (evaluated in {jev_latency_ms}ms)",
                    "final_response": reason,
                    "messages": [AIMessage(content=f"Guardrail blocked request: {reason}")],
                    "execution_times": times,
                    "llm_calls": llm_calls,
                }

            # --- STEP 2: Dynamic Agent Selection based on Jev Probabilities ---
            # Select only the specialist agents that add value to this specific request
            selected_agents = []
            if flight_prob >= 0.20 or any(w in query.lower() for w in ["flight", "fly", "airport", "airline"]):
                selected_agents.append("flight_agent")
            if hotel_prob >= 0.30 or any(w in query.lower() for w in ["hotel", "stay", "resort", "hostel", "accommodation", "airbnb"]):
                selected_agents.append("hotel_agent")
            if weather_prob >= 0.30 or any(w in query.lower() for w in ["weather", "forecast", "climate", "pack", "rain", "temperature", "season"]):
                selected_agents.append("weather_agent")
            if budget_prob >= 0.35 or any(w in query.lower() for w in ["budget", "cheap", "cost", "price", "affordable", "expensive", "$"]):
                selected_agents.append("budget_agent")

            # Always include the Itinerary Agent to synthesize all specialist outputs
            if "itinerary_agent" not in selected_agents:
                selected_agents.append("itinerary_agent")

            destination = extract_destination(query)
            constraints = {
                "destination": destination,
                "origin": os.getenv("DEFAULT_ORIGIN_IATA", "DAC"),
                "duration": "3-5 days",
                "budget": "budget-friendly" if trip_style == "budget" else "standard",
                "travel_style": trip_style,
                "destination_clarity_score": dest_score,
                "special_preferences": [trip_style],
            }

            reasoning = (
                f"TypeSafe Jev routed query in {jev_latency_ms}ms to {len(selected_agents)} agents: "
                f"{', '.join(selected_agents)} (Travel Prob: {is_travel_prob:.2f}, Style: {trip_style})."
            )

            return {
                "guardrail_allowed": True,
                "guardrail_reason": "",
                "selected_agents": selected_agents,
                "trip_constraints": constraints,
                "supervisor_reasoning": reasoning,
                "execution_times": times,
                "messages": [AIMessage(content="Supervisor created execution plan via TypeSafe Jev.")],
                "llm_calls": llm_calls,
            }

        except Exception as exc:
            print(f"[WARN] TypeSafe Jev evaluation notice ({exc}). Falling back to standard pipeline...")

    # --- Resilient Fallback Pipeline (if Jev offline or unconfigured) ---
    times["supervisor_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)
    selected_agents = AGENT_ORDER.copy()
    destination = extract_destination(query)
    constraints = {
        "destination": destination,
        "origin": os.getenv("DEFAULT_ORIGIN_IATA", "DAC"),
        "duration": "flexible",
        "budget": "standard",
        "travel_style": "general",
        "special_preferences": [],
    }
    return {
        "guardrail_allowed": True,
        "guardrail_reason": "",
        "selected_agents": selected_agents,
        "trip_constraints": constraints,
        "supervisor_reasoning": "Standard multi-agent full routing pipeline.",
        "execution_times": times,
        "messages": [AIMessage(content="Supervisor initialized travel specialists.")],
        "llm_calls": llm_calls,
    }


# --------------------------------------------------------------------------------------
# 6. Guardrail Blocked Handler
# --------------------------------------------------------------------------------------
def guardrail_blocked_agent(state: TravelState) -> Dict[str, Any]:
    """
    Terminal Node for Blocked Requests:
    -----------------------------------
    Invoked when TypeSafe Jev determines that the user query is not a travel-related
    request (e.g., general coding help, random chit-chat, math homework).
    
    FLOW:
    1. Reads the polite refusal explanation from state.
    2. Packages it into `final_response` and appends an AIMessage to message history.
    3. The graph routes directly to END, terminating execution safely without incurring
       generative LLM costs or hitting specialist external tools.
    """
    reason = state.get("final_response") or state.get("guardrail_reason") or (
        "This request was blocked by the travel input guardrail."
    )
    return {
        "final_response": reason,
        "messages": [AIMessage(content=reason)],
    }


# --------------------------------------------------------------------------------------
# 7. Specialist Agent: Flight Agent (Aviation MCP Tool + Groq LLM)
# --------------------------------------------------------------------------------------
FLIGHT_AGENT_PROMPT = """
You are an expert travel flight planner.

User Travel Request:
{query}

Available Airport Data:
{airport_data}

Available Airline Data:
{airline_data}

Please generate:
1. Recommended Departure and Arrival Airports (with IATA codes)
2. Primary Airlines serving this route
3. Estimated flight duration and typical layover scenarios
4. Estimated economy and business class airfare ranges
5. Peak travel season pricing warnings
6. Practical booking tips and best time to book

Provide concise, structured, and highly practical flight advice.
"""

def flight_agent(state: TravelState) -> Dict[str, Any]:
    """
    Flight Specialist Node:
    -----------------------
    Gathers airport data and airline routes to advise the traveler on flights.
    """
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})
    query = state["user_query"]
    try:
        # Call Aviation MCP tool asynchronously
        t_mcp = time.perf_counter()
        airports = asyncio.run(aviation_mcp_call("list_airports"))
        airlines = asyncio.run(aviation_mcp_call("list_airlines"))
        times["flight_mcp_ms"] = round((time.perf_counter() - t_mcp) * 1000, 1)

        prompt = FLIGHT_AGENT_PROMPT.format(
            query=query,
            airport_data=str(airports)[:600],
            airline_data=str(airlines)[:600],
        )

        t_llm = time.perf_counter()
        response = llm.invoke(
            [
                SystemMessage(content="You are an expert travel flight planner."),
                HumanMessage(content=prompt),
            ]
        )
        times["flight_llm_ms"] = round((time.perf_counter() - t_llm) * 1000, 1)
        flight_data = response.content
    except Exception as exc:
        flight_data = f"Flight information compiled with estimated routing. (Notice: {exc})"

    times["flight_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)

    return {
        "flight_results": flight_data,
        "execution_times": times,
        "messages": [AIMessage(content="Flight recommendations generated.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# --------------------------------------------------------------------------------------
# 8. Specialist Agent: Hotel Agent (Tavily Web Search MCP Tool)
# --------------------------------------------------------------------------------------
def hotel_agent(state: TravelState) -> Dict[str, Any]:
    """
    Hotel Specialist Node:
    ----------------------
    Discovers accommodations using live real-time web intelligence.
    """
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})
    query = f"Best hotels and places to stay for {state['user_query']}"
    try:
        t_mcp = time.perf_counter()
        hotel_results = asyncio.run(tavily_mcp_search(query))
        times["hotel_mcp_ms"] = round((time.perf_counter() - t_mcp) * 1000, 1)
    except Exception as exc:
        hotel_results = f"Accommodation suggestions generated with neighborhood guidance. (Notice: {exc})"

    times["hotel_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)

    return {
        "hotel_results": hotel_results,
        "execution_times": times,
        "messages": [AIMessage(content="Hotel accommodations processed.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# --------------------------------------------------------------------------------------
# 9. Specialist Agent: Weather Agent (Open-Meteo Weather MCP Tool)
# --------------------------------------------------------------------------------------
def weather_agent(state: TravelState) -> Dict[str, Any]:
    """
    Weather Specialist Node:
    ------------------------
    Fetches real-time weather and 7-day meteorological forecasts to enable weather-adaptive plans.
    """
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})
    city = extract_destination(state["user_query"])
    try:
        t_mcp = time.perf_counter()
        weather_data = asyncio.run(weather_mcp_search(city))
        forecast_data = asyncio.run(forecast_mcp_search(city))
        times["weather_mcp_ms"] = round((time.perf_counter() - t_mcp) * 1000, 1)
        weather_results = f"Current Weather in {city}:\n{weather_data}\n\nExtended Forecast:\n{forecast_data}"
    except Exception as exc:
        weather_results = f"Seasonal weather guidance provided for {city}. (Notice: {exc})"

    times["weather_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)

    return {
        "weather_results": weather_results,
        "execution_times": times,
        "messages": [AIMessage(content="Weather data analyzed.")],
    }


# --------------------------------------------------------------------------------------
# 10. Specialist Agent: Budget Agent (TypeSafe Jev System One + Groq LLM)
# --------------------------------------------------------------------------------------
def budget_agent(state: TravelState) -> Dict[str, Any]:
    """
    Budget Specialist Node:
    -----------------------
    Combines TypeSafe Jev's calibrated mathematical models with Groq's generative prose.
    """
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})
    query = state["user_query"]
    constraints = state.get("trip_constraints", {})
    style = constraints.get("travel_style", "general")

    # 1. TypeSafe Jev Calibrated Budget Assessment
    jev_budget_summary = ""
    if jev_client:
        try:
            t_jev = time.perf_counter()
            b_eval = jev_client.system_one(
                state={
                    "user_query": query,
                    "travel_style": style,
                },
                questions={
                    # Expected value score on budget feasibility
                    "feasibility": Score(
                        instructions="Rate the budget feasibility of this trip against typical travel costs.",
                        criteria=[
                            "Tight budget / high financial risk of overrun",
                            "Feasible with reasonable spending and mid-range choices",
                            "Comfortable budget / generous spending room"
                        ]
                    ),
                    # Categorical pricing tier
                    "pricing_tier": Choice(
                        instructions="What is the expected budget tier?",
                        criteria={
                            "budget": "Economy/budget ($50-$100/day)",
                            "moderate": "Mid-range ($100-$250/day)",
                            "luxury": "Luxury ($250+/day)"
                        }
                    ),
                    # Binary risk of unexpected price spikes
                    "peak_risk": Noul(
                        instructions="Is there significant risk of unexpected expenses or peak season price surges?"
                    )
                }
            )
            times["budget_jev_ms"] = round((time.perf_counter() - t_jev) * 1000, 1)

            score_val = float(b_eval.scores["feasibility"].score)
            tier_val = str(b_eval.choices["pricing_tier"].choice)
            risk_val = float(b_eval.nouls["peak_risk"].noul)

            jev_budget_summary = (
                f"### 📊 TypeSafe Jev Budget Intelligence\n"
                f"- **Feasibility Score:** {score_val:.2f} / 2.00 ({'High Feasibility' if score_val > 1.0 else 'Moderate Feasibility'})\n"
                f"- **Recommended Pricing Tier:** {tier_val.capitalize()}\n"
                f"- **Peak Price Spike Risk:** {risk_val * 100:.1f}%\n\n"
            )
        except Exception as e:
            print(f"[DEBUG] Notice on Jev budget evaluation: {e}")

    # 2. Generative Detailed Cost Breakdown via Groq LLM
    prompt = f"""
Analyze the travel budget and cost breakdown for this trip.

User Request: {query}
Travel Style: {style}
Flight Info: {state.get('flight_results', 'Standard routes')[:400]}
Hotel Info: {state.get('hotel_results', 'Standard lodging')[:400]}

Provide:
1. Daily Estimated Spending (Accommodation, Food, Transport, Activities)
2. Total Estimated Trip Cost Range
3. Practical Money-Saving Tips
4. Budget Risk Warnings
"""

    t_llm = time.perf_counter()
    response = llm.invoke(
        [
            SystemMessage(content="You are a professional travel budget analyst."),
            HumanMessage(content=prompt),
        ]
    )
    times["budget_llm_ms"] = round((time.perf_counter() - t_llm) * 1000, 1)
    times["budget_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)

    budget_content = f"{jev_budget_summary}{response.content}"

    return {
        "budget_results": budget_content,
        "execution_times": times,
        "messages": [AIMessage(content="Budget feasibility analysis completed.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# --------------------------------------------------------------------------------------
# 11. Itinerary Specialist Agent
# --------------------------------------------------------------------------------------
ITINERARY_PROMPT = """
Create a comprehensive, day-by-day travel itinerary.

User Query: {user_query}
Flight Context: {flight_results}
Hotel Context: {hotel_results}
Weather Context: {weather_results}
Budget Context: {budget_results}

Requirements:
- Realistic schedules (Morning, Afternoon, Evening).
- Weather-adapted recommendations.
- Cultural highlights, dining spots, and local experiences.
- Keep the plan practical, logical, and budget-conscious.
"""

def itinerary_agent(state: TravelState) -> Dict[str, Any]:
    """
    Itinerary Specialist Node:
    --------------------------
    Synthesizes the findings of all upstream specialists into a coherent day-by-day schedule.
    """
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})

    prompt = ITINERARY_PROMPT.format(
        user_query=state["user_query"],
        flight_results=state.get("flight_results", "")[:800],
        hotel_results=state.get("hotel_results", "")[:800],
        weather_results=state.get("weather_results", "")[:800],
        budget_results=state.get("budget_results", "")[:800],
    )

    t_llm = time.perf_counter()
    response = llm.invoke(
        [
            SystemMessage(content="You are a professional travel itinerary creator."),
            HumanMessage(content=prompt),
        ]
    )
    times["itinerary_llm_ms"] = round((time.perf_counter() - t_llm) * 1000, 1)
    times["itinerary_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)

    approval_request = (
        "Please review the generated draft itinerary. Approve it to finalize the trip plan, "
        "or provide feedback for revision."
    )

    return {
        "itinerary": response.content,
        "approval_request": approval_request,
        "execution_times": times,
        "messages": [AIMessage(content="Draft itinerary generated for human review.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# --------------------------------------------------------------------------------------
# 12. Human-in-the-Loop (HITL) Review Step
# --------------------------------------------------------------------------------------
def human_approval_agent(state: TravelState) -> Dict[str, Any]:
    """
    Human-in-the-Loop (HITL) Node:
    ------------------------------
    Pauses graph execution using LangGraph's native `interrupt()` function.
    """
    review = interrupt(
        {
            "question": "Do you approve this itinerary?",
            "draft_itinerary": state.get("itinerary", ""),
            "approval_request": state.get("approval_request", ""),
            "selected_agents": state.get("selected_agents", []),
            "supervisor_reasoning": state.get("supervisor_reasoning", ""),
            "expected_response": {
                "approved": True,
                "feedback": "Optional revision feedback",
            },
        }
    )

    approved = bool(review.get("approved", False))
    human_feedback = str(review.get("feedback", "")).strip()

    return {
        "approved": approved,
        "human_feedback": human_feedback,
        "messages": [AIMessage(content="Human approval step completed.")],
    }


# --------------------------------------------------------------------------------------
# 13. Final Concierge Agent
# --------------------------------------------------------------------------------------
FINAL_PROMPT = """
Generate the complete final travel proposal for the user based on multi-agent findings.

User Request: {user_query}
Flight Details: {flight_results}
Hotel Suggestions: {hotel_results}
Weather Report: {weather_results}
Budget Analysis: {budget_results}
Detailed Itinerary: {itinerary}
Human Review Feedback: {human_feedback}

Format the response beautifully in clean Markdown with these sections:
# Custom Travel Itinerary & Guide

## 1. Trip Summary
## 2. Flight Recommendations & Logistics
## 3. Curated Hotel & Accommodation Options
## 4. Weather Forecast & Packing Advice
## 5. Day-by-Day Detailed Itinerary
## 6. Estimated Budget Breakdown
## 7. Essential Local Tips & Recommendations

Ensure the response is detailed, professional, and directly useful for immediate trip planning.
"""

def final_agent(state: TravelState) -> Dict[str, Any]:
    """
    Final Concierge Node:
    ---------------------
    Produces the complete travel guide by synthesizing all specialist outputs.
    """
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})

    prompt = FINAL_PROMPT.format(
        user_query=state["user_query"],
        flight_results=state.get("flight_results", ""),
        hotel_results=state.get("hotel_results", ""),
        weather_results=state.get("weather_results", ""),
        budget_results=state.get("budget_results", ""),
        itinerary=state.get("itinerary", ""),
        human_feedback=state.get("human_feedback", "Draft approved as submitted."),
    )

    t_llm = time.perf_counter()
    response = llm.invoke(
        [
            SystemMessage(content="You are an elite AI Travel Concierge."),
            HumanMessage(content=prompt),
        ]
    )
    times["final_llm_ms"] = round((time.perf_counter() - t_llm) * 1000, 1)
    times["final_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)

    return {
        "final_response": response.content,
        "execution_times": times,
        "messages": [response],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# --------------------------------------------------------------------------------------
# 14. Dynamic Conditional Routing Logic
# --------------------------------------------------------------------------------------
# Map of routing keys to graph node names
ROUTE_MAP = {
    "guardrail_blocked": "guardrail_blocked",
    "flight_agent": "flight_agent",
    "hotel_agent": "hotel_agent",
    "weather_agent": "weather_agent",
    "budget_agent": "budget_agent",
    "itinerary_agent": "itinerary_agent",
}


def _selected_agents(state: TravelState) -> list[str]:
    """Helper returning an ordered list of specialist agents selected by TypeSafe Jev."""
    selected = state.get("selected_agents", [])
    return [agent for agent in AGENT_ORDER if agent in selected]


def route_from_supervisor(state: TravelState) -> str:
    """
    Conditional Edge from Supervisor:
    ---------------------------------
    - If `guardrail_allowed` is False -> Routes immediately to `guardrail_blocked`.
    - If True -> Routes to the first active specialist agent chosen by Jev.
    - If no specialist was chosen -> Defaults directly to `itinerary_agent`.
    """
    if not state.get("guardrail_allowed", True):
        return "guardrail_blocked"

    selected = _selected_agents(state)
    return selected[0] if selected else "itinerary_agent"


def route_after_agent(current_agent: str):
    """
    Conditional Edge Factory:
    -------------------------
    Creates a dynamic routing function for each specialist node.
    After `current_agent` finishes, this inspects `selected_agents` and routes
    to the next active specialist in the pipeline sequence.
    When all active specialists have completed, it automatically routes to `itinerary_agent`.
    """
    def route(state: TravelState) -> str:
        selected = _selected_agents(state)
        current_index = AGENT_ORDER.index(current_agent)

        for next_agent in AGENT_ORDER[current_index + 1:]:
            if next_agent in selected:
                return next_agent

        return "itinerary_agent"

    return route


# --------------------------------------------------------------------------------------
# 15. LangGraph StateGraph Construction
# --------------------------------------------------------------------------------------
def build_travel_graph() -> StateGraph:
    """
    Constructs and wires the full LangGraph StateGraph:
    
    Graph Topology:
    [START] -> [supervisor] --(guardrail blocked)--> [guardrail_blocked] -> [END]
                     |
            (dynamic specialist routing via Jev)
                     v
             [flight_agent] -> [hotel_agent] -> [weather_agent] -> [budget_agent]
                     |               |                 |                 |
                     +---------------+-----------------+-----------------+
                                             |
                                             v
                                     [itinerary_agent]
                                             |
                                             v
                                      [final_agent]
                                             |
                                             v
                                           [END]
    """
    builder = StateGraph(TravelState)

    # Register all processing nodes
    builder.add_node("supervisor", supervisor_agent)
    builder.add_node("guardrail_blocked", guardrail_blocked_agent)
    builder.add_node("flight_agent", flight_agent)
    builder.add_node("hotel_agent", hotel_agent)
    builder.add_node("weather_agent", weather_agent)
    builder.add_node("budget_agent", budget_agent)
    builder.add_node("itinerary_agent", itinerary_agent)
    builder.add_node("human_approval", human_approval_agent)
    builder.add_node("final_agent", final_agent)

    # 1. Entry Edge: Graph begins at supervisor
    builder.add_edge(START, "supervisor")
    
    # 2. Supervisor Conditional Edge: Routes to first specialist or guardrail block
    builder.add_conditional_edges("supervisor", route_from_supervisor, ROUTE_MAP)

    # 3. Dynamic Specialist Pipeline Edges (skip inactive specialists on the fly)
    builder.add_conditional_edges("flight_agent", route_after_agent("flight_agent"), ROUTE_MAP)
    builder.add_conditional_edges("hotel_agent", route_after_agent("hotel_agent"), ROUTE_MAP)
    builder.add_conditional_edges("weather_agent", route_after_agent("weather_agent"), ROUTE_MAP)
    builder.add_conditional_edges("budget_agent", route_after_agent("budget_agent"), ROUTE_MAP)

    # 4. Terminal Synthesis Edges
    builder.add_edge("itinerary_agent", "final_agent")
    builder.add_edge("final_agent", END)
    builder.add_edge("guardrail_blocked", END)

    return builder


# --------------------------------------------------------------------------------------
# 16. State Persistence Checkpointer & Graph Compilation
# --------------------------------------------------------------------------------------
# Attempts to connect to PostgreSQL for persistent checkpointer state (for session recovery and HITL).
# If PostgreSQL is offline or unconfigured, falls back cleanly to InMemorySaver.
DATABASE_URL = get_database_url()

if DATABASE_URL:
    try:
        _conn = psycopg.connect(
            DATABASE_URL,
            autocommit=True,
            row_factory=dict_row,
            connect_timeout=3
        )
        checkpointer = PostgresSaver(_conn)
        checkpointer.setup()
        travel_graph = build_travel_graph().compile(checkpointer=checkpointer)
        print("[INFO] PostgreSQL checkpointer connected.")
    except Exception as e:
        print(f"[WARN] PostgreSQL checkpointer unavailable ({e}). Using InMemorySaver for state persistence.")
        checkpointer = InMemorySaver()
        travel_graph = build_travel_graph().compile(checkpointer=checkpointer)
else:
    checkpointer = InMemorySaver()
    travel_graph = build_travel_graph().compile(checkpointer=checkpointer)
    print("[INFO] Using InMemorySaver for state persistence.")


# --------------------------------------------------------------------------------------
# 17. Execution & Serialization Helpers
# --------------------------------------------------------------------------------------
def _interrupt_payload(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Helper to extract the interrupt payload from a LangGraph execution result."""
    interrupts = result.get("__interrupt__", [])
    if not interrupts:
        return None

    first_interrupt = interrupts[0]
    payload = getattr(first_interrupt, "value", first_interrupt)
    return payload if isinstance(payload, dict) else {"value": payload}


def _serialize_result(result: Dict[str, Any], thread_id: str) -> Dict[str, Any]:
    """
    Serializes LangGraph internal state into a clean dictionary for FastAPI responses.
    Extracts all specialist outputs, constraints, Jev reasoning, and approval flags.
    """
    messages = result.get("messages", [])
    last_message = messages[-1].content if messages else ""
    final_response = result.get("final_response") or result.get("final_answer") or last_message
    interrupt_payload = _interrupt_payload(result)

    if interrupt_payload:
        final_response = interrupt_payload.get("draft_itinerary") or result.get("itinerary", "")

    return {
        "thread_id": thread_id,
        "answer": final_response,
        "final_answer": final_response,
        "final_response": final_response,
        "requires_approval": interrupt_payload is not None,
        "approval_request": (
            interrupt_payload.get("approval_request", "")
            if interrupt_payload
            else result.get("approval_request", "")
        ),
        "flight_results": result.get("flight_results", ""),
        "hotel_results": result.get("hotel_results", ""),
        "weather_results": result.get("weather_results", ""),
        "budget_results": result.get("budget_results", ""),
        "itinerary": (
            interrupt_payload.get("draft_itinerary", "")
            if interrupt_payload
            else result.get("itinerary", "")
        ),
        "selected_agents": result.get("selected_agents", []),
        "trip_constraints": result.get("trip_constraints", {}),
        "supervisor_reasoning": result.get("supervisor_reasoning", ""),
        "guardrail_allowed": result.get("guardrail_allowed", True),
        "guardrail_reason": result.get("guardrail_reason", ""),
        "approved": result.get("approved"),
        "human_feedback": result.get("human_feedback", ""),
        "execution_times": result.get("execution_times", {}),
        "raw_data": {k: v for k, v in result.items() if k != "messages"},
        "llm_calls": result.get("llm_calls", 0),
    }


def run_travel_agent(user_input: str, thread_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Primary API Entrypoint:
    -----------------------
    Executes a new travel planning request through the StateGraph.
    """
    if not thread_id:
        thread_id = f"trip_{uuid.uuid4().hex[:12]}"

    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    t_overall_start = time.perf_counter()

    result = travel_graph.invoke(
        {
            "messages": [
                HumanMessage(content=user_input)
            ],
            "user_query": user_input,
            "guardrail_allowed": True,
            "guardrail_reason": "",
            "selected_agents": [],
            "trip_constraints": _empty_constraints(),
            "supervisor_reasoning": "",
            "flight_results": "",
            "hotel_results": "",
            "weather_results": "",
            "budget_results": "",
            "itinerary": "",
            "approval_request": "",
            "approved": False,
            "human_feedback": "",
            "final_response": "",
            "execution_times": {},
            "llm_calls": 0,
        },
        config=config
    )

    times = dict(result.get("execution_times") or {})
    times["total_pipeline_ms"] = round((time.perf_counter() - t_overall_start) * 1000, 1)
    result["execution_times"] = times

    return _serialize_result(result, thread_id)


def resume_travel_agent(
    thread_id: str,
    approved: bool,
    feedback: str = "",
) -> Dict[str, Any]:
    """
    Human-in-the-Loop Resume Entrypoint:
    ------------------------------------
    Resumes a paused LangGraph thread following human review.
    """
    if not thread_id:
        raise ValueError("thread_id is required to resume a travel plan.")

    config = {"configurable": {"thread_id": thread_id}}
    t_resume_start = time.perf_counter()
    result = travel_graph.invoke(
        Command(
            resume={
                "approved": approved,
                "feedback": feedback.strip(),
            }
        ),
        config=config,
    )

    times = dict(result.get("execution_times") or {})
    times["resume_pipeline_ms"] = round((time.perf_counter() - t_resume_start) * 1000, 1)
    result["execution_times"] = times

    return _serialize_result(result, thread_id)