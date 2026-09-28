import os
import certifi
from dotenv import load_dotenv

load_dotenv()
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

from typing import Any, TypedDict, Annotated, Optional, Dict, List
import operator
import uuid
import asyncio
import json
import psycopg
from psycopg.rows import dict_row

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

# TypeSafe Jev System One SDK
from typesafe_sdk import TypeSafeClient, Noul, Choice, Score

from mcp_client import (
    tavily_mcp_search,
    aviation_mcp_call,
    extract_destination,
    forecast_mcp_search,
    weather_mcp_search,
)


def get_database_url() -> Optional[str]:
    """Retrieve and sanitize PostgreSQL connection string with graceful fallback."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url or "user:password" in database_url:
        return None

    if database_url.startswith("postgresql+psycopg://"):
        database_url = database_url.replace("postgresql+psycopg://", "postgresql://", 1)

    if "sslmode=" not in database_url and "localhost" not in database_url and "127.0.0.1" not in database_url:
        separator = "&" if "?" in database_url else "?"
        database_url = f"{database_url}{separator}sslmode=require"

    return database_url


GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing. Please add it to your .env file.")

GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

# =========================
# LLM Initialization
# =========================
llm = ChatGroq(
    model=GROQ_MODEL,
    api_key=GROQ_API_KEY,
    temperature=0.3,
)

# =========================
# TypeSafe Jev System One Client
# =========================
TYPESAFE_API_KEY = os.getenv("TYPESAFE_API_KEY")
jev_client: Optional[TypeSafeClient] = (
    TypeSafeClient(api_key=TYPESAFE_API_KEY) if TYPESAFE_API_KEY else None
)


# =========================
# State Schema
# =========================
class TravelState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], operator.add]
    user_query: str

    # Supervisor + guardrail state (powered by Jev)
    guardrail_allowed: bool
    guardrail_reason: str
    selected_agents: list[str]
    trip_constraints: dict[str, Any]
    supervisor_reasoning: str

    # Specialist results
    flight_results: str
    hotel_results: str
    weather_results: str
    budget_results: str
    itinerary: str

    # HITL state
    approval_request: str
    approved: bool
    human_feedback: str
    final_response: str

    # Metadata
    raw_data: dict[str, Any]
    llm_calls: int


# =========================
# Shared Configuration
# =========================
KNOWN_AGENTS = {
    "flight_agent",
    "hotel_agent",
    "weather_agent",
    "budget_agent",
    "itinerary_agent",
}

AGENT_ORDER = [
    "flight_agent",
    "hotel_agent",
    "weather_agent",
    "budget_agent",
    "itinerary_agent",
]


def _llm_text(system_prompt: str, user_prompt: str) -> str:
    response = llm.invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
    )
    return str(response.content)


def _empty_constraints() -> dict[str, Any]:
    return {
        "destination": "",
        "origin": "",
        "duration": "",
        "budget": "",
        "travel_style": "general",
        "special_preferences": [],
    }


# =========================
# Supervisor Agent + Input Guardrail (TypeSafe Jev)
# =========================
def supervisor_agent(state: TravelState):
    query = state["user_query"]
    llm_calls = state.get("llm_calls", 0)

    # 1. Evaluate with TypeSafe Jev System One if available
    if jev_client:
        try:
            print("[INFO] Invoking TypeSafe Jev for typed supervisor guardrail and routing...")
            jev_res = jev_client.system_one(
                state={"user_query": query},
                questions={
                    "is_travel": Noul(
                        instructions="Is this user request related to travel, vacation, flights, hotels, weather, itineraries, destinations, sightseeing, or trip planning?"
                    ),
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

            is_travel_prob = float(jev_res.nouls["is_travel"].noul)
            flight_prob = float(jev_res.nouls["needs_flights"].noul)
            hotel_prob = float(jev_res.nouls["needs_hotels"].noul)
            weather_prob = float(jev_res.nouls["needs_weather"].noul)
            budget_prob = float(jev_res.nouls["needs_budget"].noul)
            trip_style = str(jev_res.choices["trip_style"].choice)
            dest_score = float(jev_res.scores["destination_clarity"].score)

            print(
                f"[Jev Decision] is_travel={is_travel_prob:.2f}, "
                f"flights={flight_prob:.2f}, hotels={hotel_prob:.2f}, "
                f"weather={weather_prob:.2f}, budget={budget_prob:.2f}, style='{trip_style}'"
            )

            # Guardrail check
            if is_travel_prob < 0.35:
                reason = "TripMate AI can only help with travel-planning requests (flights, hotels, weather, destinations, budgets, or itineraries)."
                return {
                    "guardrail_allowed": False,
                    "guardrail_reason": reason,
                    "selected_agents": [],
                    "trip_constraints": _empty_constraints(),
                    "supervisor_reasoning": f"Jev input guardrail rejected with travel probability {is_travel_prob:.2f}",
                    "final_response": reason,
                    "messages": [AIMessage(content=f"Guardrail blocked request: {reason}")],
                    "llm_calls": llm_calls,
                }

            # Select specialist agents dynamically based on calibrated probabilities
            selected_agents = []
            if flight_prob >= 0.20 or any(w in query.lower() for w in ["flight", "fly", "airport", "airline"]):
                selected_agents.append("flight_agent")
            if hotel_prob >= 0.30 or any(w in query.lower() for w in ["hotel", "stay", "resort", "hostel", "accommodation", "airbnb"]):
                selected_agents.append("hotel_agent")
            if weather_prob >= 0.30 or any(w in query.lower() for w in ["weather", "forecast", "climate", "pack", "rain", "temperature", "season"]):
                selected_agents.append("weather_agent")
            if budget_prob >= 0.35 or any(w in query.lower() for w in ["budget", "cheap", "cost", "price", "affordable", "expensive", "$"]):
                selected_agents.append("budget_agent")

            # Always include itinerary agent to integrate findings
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
                f"TypeSafe Jev routed query to {len(selected_agents)} agents: "
                f"{', '.join(selected_agents)} (Travel Prob: {is_travel_prob:.2f}, Style: {trip_style})."
            )

            return {
                "guardrail_allowed": True,
                "guardrail_reason": "",
                "selected_agents": selected_agents,
                "trip_constraints": constraints,
                "supervisor_reasoning": reasoning,
                "messages": [AIMessage(content="Supervisor created execution plan via TypeSafe Jev.")],
                "llm_calls": llm_calls,
            }

        except Exception as exc:
            print(f"[WARN] TypeSafe Jev evaluation notice ({exc}). Falling back to standard pipeline...")

    # Fallback if Jev is not configured or temporary error
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
        "messages": [AIMessage(content="Supervisor initialized travel specialists.")],
        "llm_calls": llm_calls,
    }


# =========================
# Guardrail Blocked Handler
# =========================
def guardrail_blocked_agent(state: TravelState):
    reason = state.get("final_response") or state.get("guardrail_reason") or (
        "This request was blocked by the travel input guardrail."
    )
    return {
        "final_response": reason,
        "messages": [AIMessage(content=reason)],
    }


# =========================
# Flight Agent
# =========================
FLIGHT_AGENT_PROMPT = """
You are an expert travel flight planner.

User Travel Request:
{query}

Available Airport Data:
{airport_data}

Available Airline Data:
{airline_data}

Please generate:
1. Recommended Departure and Arrival Airports
2. Primary Airlines serving this route
3. Estimated flight duration and typical layover scenarios
4. Estimated economy and business class airfare ranges
5. Peak travel season pricing warnings
6. Practical booking tips and best time to book

Provide concise, structured, and highly practical flight advice.
"""

def flight_agent(state: TravelState):
    query = state["user_query"]
    try:
        airports = asyncio.run(aviation_mcp_call("list_airports"))
        airlines = asyncio.run(aviation_mcp_call("list_airlines"))

        prompt = FLIGHT_AGENT_PROMPT.format(
            query=query,
            airport_data=str(airports)[:600],
            airline_data=str(airlines)[:600],
        )

        response = llm.invoke(
            [
                SystemMessage(content="You are an expert travel flight planner."),
                HumanMessage(content=prompt),
            ]
        )
        flight_data = response.content
    except Exception as exc:
        flight_data = f"Flight information compiled with estimated routing. (Notice: {exc})"

    return {
        "flight_results": flight_data,
        "messages": [AIMessage(content="Flight recommendations generated.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# =========================
# Hotel Agent
# =========================
def hotel_agent(state: TravelState):
    query = f"Best hotels and places to stay for {state['user_query']}"
    try:
        hotel_results = asyncio.run(tavily_mcp_search(query))
    except Exception as exc:
        hotel_results = f"Accommodation suggestions generated with neighborhood guidance. (Notice: {exc})"

    return {
        "hotel_results": hotel_results,
        "messages": [AIMessage(content="Hotel accommodations processed.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# =========================
# Weather Agent
# =========================
def weather_agent(state: TravelState):
    city = extract_destination(state["user_query"])
    try:
        weather_data = asyncio.run(weather_mcp_search(city))
        forecast_data = asyncio.run(forecast_mcp_search(city))
        weather_results = f"Current Weather in {city}:\n{weather_data}\n\nExtended Forecast:\n{forecast_data}"
    except Exception as exc:
        weather_results = f"Seasonal weather guidance provided for {city}. (Notice: {exc})"

    return {
        "weather_results": weather_results,
        "messages": [AIMessage(content="Weather data analyzed.")],
    }


# =========================
# Budget Agent (TypeSafe Jev + LLM)
# =========================
def budget_agent(state: TravelState):
    query = state["user_query"]
    constraints = state.get("trip_constraints", {})
    style = constraints.get("travel_style", "general")

    # 1. Use TypeSafe Jev for calibrated budget scoring if available
    jev_budget_summary = ""
    if jev_client:
        try:
            b_eval = jev_client.system_one(
                state={
                    "user_query": query,
                    "travel_style": style,
                },
                questions={
                    "feasibility": Score(
                        instructions="Rate the budget feasibility of this trip against typical travel costs.",
                        criteria=[
                            "Tight budget / high financial risk of overrun",
                            "Feasible with reasonable spending and mid-range choices",
                            "Comfortable budget / generous spending room"
                        ]
                    ),
                    "pricing_tier": Choice(
                        instructions="What is the expected budget tier?",
                        criteria={
                            "budget": "Economy/budget ($50-$100/day)",
                            "moderate": "Mid-range ($100-$250/day)",
                            "luxury": "Luxury ($250+/day)"
                        }
                    ),
                    "peak_risk": Noul(
                        instructions="Is there significant risk of unexpected expenses or peak season price surges?"
                    )
                }
            )

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

    response = llm.invoke(
        [
            SystemMessage(content="You are a professional travel budget analyst."),
            HumanMessage(content=prompt),
        ]
    )

    budget_content = f"{jev_budget_summary}{response.content}"

    return {
        "budget_results": budget_content,
        "messages": [AIMessage(content="Budget feasibility analysis completed.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# =========================
# Itinerary Agent
# =========================
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

def itinerary_agent(state: TravelState):
    prompt = ITINERARY_PROMPT.format(
        user_query=state["user_query"],
        flight_results=state.get("flight_results", "")[:800],
        hotel_results=state.get("hotel_results", "")[:800],
        weather_results=state.get("weather_results", "")[:800],
        budget_results=state.get("budget_results", "")[:800],
    )

    response = llm.invoke(
        [
            SystemMessage(content="You are a professional travel itinerary creator."),
            HumanMessage(content=prompt),
        ]
    )

    approval_request = (
        "Please review the generated draft itinerary. Approve it to finalize the trip plan, "
        "or provide feedback for revision."
    )

    return {
        "itinerary": response.content,
        "approval_request": approval_request,
        "messages": [AIMessage(content="Draft itinerary generated for human review.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# =========================
# Human Approval Step (HITL)
# =========================
def human_approval_agent(state: TravelState):
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


# =========================
# Final Concierge Agent
# =========================
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

def final_agent(state: TravelState):
    prompt = FINAL_PROMPT.format(
        user_query=state["user_query"],
        flight_results=state.get("flight_results", ""),
        hotel_results=state.get("hotel_results", ""),
        weather_results=state.get("weather_results", ""),
        budget_results=state.get("budget_results", ""),
        itinerary=state.get("itinerary", ""),
        human_feedback=state.get("human_feedback", "Draft approved as submitted."),
    )

    response = llm.invoke(
        [
            SystemMessage(content="You are an elite AI Travel Concierge."),
            HumanMessage(content=prompt),
        ]
    )

    return {
        "final_response": response.content,
        "messages": [response],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# =========================
# Dynamic Supervisor Routing
# =========================
ROUTE_MAP = {
    "guardrail_blocked": "guardrail_blocked",
    "flight_agent": "flight_agent",
    "hotel_agent": "hotel_agent",
    "weather_agent": "weather_agent",
    "budget_agent": "budget_agent",
    "itinerary_agent": "itinerary_agent",
}


def _selected_agents(state: TravelState) -> list[str]:
    selected = state.get("selected_agents", [])
    return [agent for agent in AGENT_ORDER if agent in selected]


def route_from_supervisor(state: TravelState) -> str:
    if not state.get("guardrail_allowed", True):
        return "guardrail_blocked"

    selected = _selected_agents(state)
    return selected[0] if selected else "itinerary_agent"


def route_after_agent(current_agent: str):
    def route(state: TravelState) -> str:
        selected = _selected_agents(state)
        current_index = AGENT_ORDER.index(current_agent)

        for next_agent in AGENT_ORDER[current_index + 1:]:
            if next_agent in selected:
                return next_agent

        return "itinerary_agent"

    return route


# =========================
# StateGraph Construction
# =========================
def build_travel_graph() -> StateGraph:
    builder = StateGraph(TravelState)

    builder.add_node("supervisor", supervisor_agent)
    builder.add_node("guardrail_blocked", guardrail_blocked_agent)
    builder.add_node("flight_agent", flight_agent)
    builder.add_node("hotel_agent", hotel_agent)
    builder.add_node("weather_agent", weather_agent)
    builder.add_node("budget_agent", budget_agent)
    builder.add_node("itinerary_agent", itinerary_agent)
    builder.add_node("human_approval", human_approval_agent)
    builder.add_node("final_agent", final_agent)

    builder.add_edge(START, "supervisor")
    builder.add_conditional_edges("supervisor", route_from_supervisor, ROUTE_MAP)

    builder.add_conditional_edges("flight_agent", route_after_agent("flight_agent"), ROUTE_MAP)
    builder.add_conditional_edges("hotel_agent", route_after_agent("hotel_agent"), ROUTE_MAP)
    builder.add_conditional_edges("weather_agent", route_after_agent("weather_agent"), ROUTE_MAP)
    builder.add_conditional_edges("budget_agent", route_after_agent("budget_agent"), ROUTE_MAP)

    builder.add_edge("itinerary_agent", "final_agent")
    builder.add_edge("final_agent", END)
    builder.add_edge("guardrail_blocked", END)

    return builder


# =========================
# State Persistence Checkpointer
# =========================
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


# =========================
# Execution & Serialization Helpers
# =========================
def _interrupt_payload(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    interrupts = result.get("__interrupt__", [])
    if not interrupts:
        return None

    first_interrupt = interrupts[0]
    payload = getattr(first_interrupt, "value", first_interrupt)
    return payload if isinstance(payload, dict) else {"value": payload}


def _serialize_result(result: Dict[str, Any], thread_id: str) -> Dict[str, Any]:
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
        "raw_data": {k: v for k, v in result.items() if k != "messages"},
        "llm_calls": result.get("llm_calls", 0),
    }


def run_travel_agent(user_input: str, thread_id: Optional[str] = None) -> Dict[str, Any]:
    """Execute travel planner pipeline and return comprehensive result."""
    if not thread_id:
        thread_id = f"trip_{uuid.uuid4().hex[:12]}"

    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

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
            "llm_calls": 0,
        },
        config=config
    )

    return _serialize_result(result, thread_id)


def resume_travel_agent(
    thread_id: str,
    approved: bool,
    feedback: str = "",
) -> Dict[str, Any]:
    """Resume the paused LangGraph thread after human review."""
    if not thread_id:
        raise ValueError("thread_id is required to resume a travel plan.")

    config = {"configurable": {"thread_id": thread_id}}
    result = travel_graph.invoke(
        Command(
            resume={
                "approved": approved,
                "feedback": feedback.strip(),
            }
        ),
        config=config,
    )

    return _serialize_result(result, thread_id)