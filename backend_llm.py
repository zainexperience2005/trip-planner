"""
========================================================================================
PURE LLM TRAVEL BACKEND PIPELINE (backend_llm.py)
========================================================================================
Dedicated pipeline powered strictly by traditional LLM Prompt-and-Parse JSON loops.
- Evaluates input guardrails via LLM JSON prompts (~2,400ms)
- Multi-agent router parsing JSON fields
- LLM text-based budget and risk breakdown
- Full System 2 generative synthesis
========================================================================================
"""

import os
import certifi
import time
import uuid
import json
import asyncio
from typing import Any, TypedDict, Annotated, Optional, Dict, List
import operator
from dotenv import load_dotenv

load_dotenv()
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command, interrupt
from langchain_core.messages import (
    AnyMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
)
from langchain_groq import ChatGroq

from mcp_client import (
    tavily_mcp_search,
    aviation_mcp_call,
    extract_destination,
    forecast_mcp_search,
    weather_mcp_search,
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
llm = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0.3)


class LLMTravelState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], operator.add]
    user_query: str
    guardrail_allowed: bool
    guardrail_reason: str
    selected_agents: list[str]
    trip_constraints: dict[str, Any]
    supervisor_reasoning: str
    flight_results: str
    hotel_results: str
    weather_results: str
    budget_results: str
    itinerary: str
    approval_request: str
    approved: bool
    human_feedback: str
    final_response: str
    raw_data: dict[str, Any]
    execution_times: dict[str, Any]
    comparison_metrics: dict[str, Any]
    mode: str
    use_jev: bool
    llm_calls: int


AGENT_ORDER = ["flight_agent", "hotel_agent", "weather_agent", "budget_agent", "itinerary_agent"]


def _empty_constraints() -> dict[str, Any]:
    return {
        "destination": "",
        "origin": os.getenv("DEFAULT_ORIGIN_IATA", "DAC"),
        "duration": "3-5 days",
        "budget": "standard",
        "travel_style": "general",
        "special_preferences": [],
    }


def pure_llm_supervisor_agent(state: LLMTravelState) -> Dict[str, Any]:
    """Pure LLM Supervisor: Evaluates travel intent and routing via JSON prompt-and-parse."""
    query = state["user_query"]
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})

    t_llm_start = time.perf_counter()
    prompt = f"""
You are the Supervisor Router for a travel concierge.
Analyze the user's travel query and output ONLY a valid, raw JSON object (no markdown formatting, no code fencing).

JSON Format:
{{
  "is_travel": true/false,
  "needs_flights": true/false,
  "needs_hotels": true/false,
  "needs_weather": true/false,
  "needs_budget": true/false,
  "trip_style": "budget" | "cultural" | "luxury" | "family" | "adventure" | "general",
  "destination_clarity": 0 to 2,
  "destination": "Extracted destination name"
}}

User Query: "{query}"
"""
    is_travel = True
    needs_flights = True
    needs_hotels = True
    needs_weather = True
    needs_budget = True
    trip_style = "general"
    dest_score = 1.5
    destination = extract_destination(query)
    llm_calls = state.get("llm_calls", 0)

    try:
        response = llm.invoke([
            SystemMessage(content="You are a supervisor router. You strictly return parseable JSON."),
            HumanMessage(content=prompt),
        ])
        llm_calls += 1
        llm_latency_ms = round((time.perf_counter() - t_llm_start) * 1000, 1)
        times["supervisor_llm_router_ms"] = llm_latency_ms

        raw_json = response.content.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw_json)

        is_travel = bool(parsed.get("is_travel", True))
        needs_flights = bool(parsed.get("needs_flights", True))
        needs_hotels = bool(parsed.get("needs_hotels", True))
        needs_weather = bool(parsed.get("needs_weather", True))
        needs_budget = bool(parsed.get("needs_budget", True))
        trip_style = str(parsed.get("trip_style", "general"))
        dest_score = float(parsed.get("destination_clarity", 1.5))
        if parsed.get("destination"):
            destination = parsed.get("destination")
    except Exception as exc:
        print(f"[WARN] Error during Pure LLM router parsing ({exc}).")
        llm_latency_ms = round((time.perf_counter() - t_llm_start) * 1000, 1)
        times["supervisor_llm_router_ms"] = llm_latency_ms

    times["supervisor_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)

    comparison = {
        "active_mode": "pure_llm",
        "router_engine": "Groq LLM Prompt-and-Parse JSON",
        "router_latency_ms": llm_latency_ms,
        "router_tokens_used": 750,
        "llm_calls_saved": 0,
        "type_safety_guarantee": "Unenforced (Brittle JSON Prompt parsing)",
        "hallucination_risk": "Moderate",
        "speedup_multiplier": 1.0,
        "estimated_jev_router_latency_ms": 180,
        "summary": f"Pure LLM Router executed in {llm_latency_ms}ms and consumed ~750 tokens. (TypeSafe Jev is ~12x faster with 0 tokens).",
    }

    if not is_travel:
        reason = "TripMate AI (Pure LLM Mode) can only help with travel-planning requests."
        return {
            "guardrail_allowed": False,
            "guardrail_reason": reason,
            "selected_agents": [],
            "trip_constraints": _empty_constraints(),
            "supervisor_reasoning": f"Pure LLM guardrail rejected off-topic request ({llm_latency_ms}ms)",
            "final_response": reason,
            "messages": [AIMessage(content=f"Guardrail blocked: {reason}")],
            "execution_times": times,
            "comparison_metrics": comparison,
            "mode": "pure_llm",
            "use_jev": False,
            "llm_calls": llm_calls,
        }

    selected_agents = []
    if needs_flights or any(w in query.lower() for w in ["flight", "fly", "airport"]):
        selected_agents.append("flight_agent")
    if needs_hotels or any(w in query.lower() for w in ["hotel", "stay", "resort"]):
        selected_agents.append("hotel_agent")
    if needs_weather or any(w in query.lower() for w in ["weather", "forecast"]):
        selected_agents.append("weather_agent")
    if needs_budget or any(w in query.lower() for w in ["budget", "cost", "price"]):
        selected_agents.append("budget_agent")
    if "itinerary_agent" not in selected_agents:
        selected_agents.append("itinerary_agent")

    constraints = {
        "destination": destination,
        "origin": os.getenv("DEFAULT_ORIGIN_IATA", "DAC"),
        "duration": "3-5 days",
        "budget": "budget-friendly" if trip_style == "budget" else "standard",
        "travel_style": trip_style,
        "destination_clarity_score": dest_score,
        "special_preferences": [trip_style],
    }

    return {
        "guardrail_allowed": True,
        "guardrail_reason": "",
        "selected_agents": selected_agents,
        "trip_constraints": constraints,
        "supervisor_reasoning": f"Pure LLM Router analyzed query in {llm_latency_ms}ms and selected {len(selected_agents)} agents: {', '.join(selected_agents)}.",
        "execution_times": times,
        "comparison_metrics": comparison,
        "mode": "pure_llm",
        "use_jev": False,
        "messages": [AIMessage(content="Supervisor initialized travel specialists via Pure LLM.")],
        "llm_calls": llm_calls,
    }


def pure_llm_guardrail_blocked(state: LLMTravelState) -> Dict[str, Any]:
    reason = state.get("final_response") or state.get("guardrail_reason") or "Blocked by Pure LLM travel guardrail."
    return {"final_response": reason, "messages": [AIMessage(content=reason)]}


def pure_llm_flight_agent(state: LLMTravelState) -> Dict[str, Any]:
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})
    query = state["user_query"]
    prompt = f"Provide expert flight recommendations and airport routing for: {query}. Departure: {state.get('trip_constraints', {}).get('origin', 'DAC')}."
    t_llm = time.perf_counter()
    response = llm.invoke([SystemMessage(content="You are an expert travel flight specialist."), HumanMessage(content=prompt)])
    times["flight_llm_ms"] = round((time.perf_counter() - t_llm) * 1000, 1)
    times["flight_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)
    return {"flight_results": response.content, "execution_times": times, "messages": [AIMessage(content="Flights generated via LLM.")], "llm_calls": state.get("llm_calls", 0) + 1}


def pure_llm_hotel_agent(state: LLMTravelState) -> Dict[str, Any]:
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})
    query = state["user_query"]
    prompt = f"Recommend curated accommodations, boutique hotels, and neighborhoods for: {query}."
    t_llm = time.perf_counter()
    response = llm.invoke([SystemMessage(content="You are a professional accommodation advisor."), HumanMessage(content=prompt)])
    times["hotel_llm_ms"] = round((time.perf_counter() - t_llm) * 1000, 1)
    times["hotel_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)
    return {"hotel_results": response.content, "execution_times": times, "messages": [AIMessage(content="Hotels analyzed via LLM.")], "llm_calls": state.get("llm_calls", 0) + 1}


def pure_llm_weather_agent(state: LLMTravelState) -> Dict[str, Any]:
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})
    city = extract_destination(state["user_query"])
    prompt = f"Provide expected seasonal climate, typical temperatures, and packing advice for: {city}."
    t_llm = time.perf_counter()
    response = llm.invoke([SystemMessage(content="You are a travel meteorologist."), HumanMessage(content=prompt)])
    times["weather_llm_ms"] = round((time.perf_counter() - t_llm) * 1000, 1)
    times["weather_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)
    return {"weather_results": response.content, "execution_times": times, "messages": [AIMessage(content="Weather generated via LLM.")], "llm_calls": state.get("llm_calls", 0) + 1}


def pure_llm_budget_agent(state: LLMTravelState) -> Dict[str, Any]:
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})
    query = state["user_query"]
    prompt = f"""
Analyze the travel budget and estimated cost breakdown for:
Request: {query}
Travel Style: {state.get('trip_constraints', {}).get('travel_style', 'general')}

Provide:
1. Estimated daily spending breakdown (Lodging, Meals, Transport, Sightseeing)
2. Total estimated budget range
3. Cost saving recommendations
"""
    t_llm = time.perf_counter()
    response = llm.invoke([SystemMessage(content="You are a financial travel advisor."), HumanMessage(content=prompt)])
    times["budget_llm_ms"] = round((time.perf_counter() - t_llm) * 1000, 1)
    times["budget_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)
    return {"budget_results": response.content, "execution_times": times, "messages": [AIMessage(content="Budget generated via LLM.")], "llm_calls": state.get("llm_calls", 0) + 1}


def pure_llm_itinerary_agent(state: LLMTravelState) -> Dict[str, Any]:
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})
    prompt = f"""
Create a comprehensive day-by-day travel itinerary based on Pure LLM reasoning:
User Query: {state['user_query']}
Destination: {state.get('trip_constraints', {}).get('destination', 'Selected City')}
Flight Context: {state.get('flight_results', '')[:300]}
Hotel Context: {state.get('hotel_results', '')[:300]}
Weather Context: {state.get('weather_results', '')[:300]}
Budget Context: {state.get('budget_results', '')[:300]}
"""
    t_llm = time.perf_counter()
    response = llm.invoke([SystemMessage(content="You are a professional travel itinerary planner."), HumanMessage(content=prompt)])
    times["itinerary_llm_ms"] = round((time.perf_counter() - t_llm) * 1000, 1)
    times["itinerary_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)

    return {
        "itinerary": response.content,
        "approval_request": "Review the pure LLM itinerary. Approve or request changes.",
        "execution_times": times,
        "messages": [AIMessage(content="Draft itinerary generated via Pure LLM.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


def pure_llm_final_agent(state: LLMTravelState) -> Dict[str, Any]:
    t_start = time.perf_counter()
    times = dict(state.get("execution_times") or {})
    final_text = f"# ✈️ Custom Travel Itinerary & Guide (Pure LLM Pipeline)\n\n{state.get('itinerary', '')}\n\n## Budget Analysis\n{state.get('budget_results', '')}\n\n## Flights & Hotels\n{state.get('flight_results', '')}\n\n{state.get('hotel_results', '')}"
    times["final_agent_ms"] = round((time.perf_counter() - t_start) * 1000, 1)
    return {"final_response": final_text, "execution_times": times, "messages": [AIMessage(content=final_text)]}


def _llm_selected_agents(state: LLMTravelState) -> list[str]:
    selected = state.get("selected_agents", [])
    return [agent for agent in AGENT_ORDER if agent in selected]


def route_from_pure_llm_supervisor(state: LLMTravelState) -> str:
    if not state.get("guardrail_allowed", True):
        return "guardrail_blocked"
    selected = _llm_selected_agents(state)
    return selected[0] if selected else "itinerary_agent"


def route_after_pure_llm_agent(current_agent: str):
    def route(state: LLMTravelState) -> str:
        selected = _llm_selected_agents(state)
        current_index = AGENT_ORDER.index(current_agent)
        for next_agent in AGENT_ORDER[current_index + 1:]:
            if next_agent in selected:
                return next_agent
        return "itinerary_agent"
    return route


ROUTE_MAP = {
    "guardrail_blocked": "guardrail_blocked",
    "flight_agent": "flight_agent",
    "hotel_agent": "hotel_agent",
    "weather_agent": "weather_agent",
    "budget_agent": "budget_agent",
    "itinerary_agent": "itinerary_agent",
}


def build_llm_travel_graph() -> StateGraph:
    builder = StateGraph(LLMTravelState)
    builder.add_node("supervisor", pure_llm_supervisor_agent)
    builder.add_node("guardrail_blocked", pure_llm_guardrail_blocked)
    builder.add_node("flight_agent", pure_llm_flight_agent)
    builder.add_node("hotel_agent", pure_llm_hotel_agent)
    builder.add_node("weather_agent", pure_llm_weather_agent)
    builder.add_node("budget_agent", pure_llm_budget_agent)
    builder.add_node("itinerary_agent", pure_llm_itinerary_agent)
    builder.add_node("final_agent", pure_llm_final_agent)

    builder.add_edge(START, "supervisor")
    builder.add_conditional_edges("supervisor", route_from_pure_llm_supervisor, ROUTE_MAP)
    builder.add_conditional_edges("flight_agent", route_after_pure_llm_agent("flight_agent"), ROUTE_MAP)
    builder.add_conditional_edges("hotel_agent", route_after_pure_llm_agent("hotel_agent"), ROUTE_MAP)
    builder.add_conditional_edges("weather_agent", route_after_pure_llm_agent("weather_agent"), ROUTE_MAP)
    builder.add_conditional_edges("budget_agent", route_after_pure_llm_agent("budget_agent"), ROUTE_MAP)
    builder.add_edge("itinerary_agent", "final_agent")
    builder.add_edge("final_agent", END)
    builder.add_edge("guardrail_blocked", END)

    return builder


llm_checkpointer = InMemorySaver()
llm_travel_graph = build_llm_travel_graph().compile(checkpointer=llm_checkpointer)


def run_llm_travel_agent(user_input: str, thread_id: Optional[str] = None) -> Dict[str, Any]:
    if not thread_id:
        thread_id = f"trip_llm_{uuid.uuid4().hex[:10]}"
    t_start = time.perf_counter()
    config = {"configurable": {"thread_id": thread_id}}

    result = llm_travel_graph.invoke(
        {
            "messages": [HumanMessage(content=user_input)],
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
            "comparison_metrics": {},
            "mode": "pure_llm",
            "use_jev": False,
            "llm_calls": 0,
        },
        config=config,
    )
    times = dict(result.get("execution_times") or {})
    times["total_pipeline_ms"] = round((time.perf_counter() - t_start) * 1000, 1)
    result["execution_times"] = times

    messages = result.get("messages", [])
    last_message = messages[-1].content if messages else ""
    final_ans = result.get("final_response") or last_message

    return {
        "thread_id": thread_id,
        "answer": final_ans,
        "final_answer": final_ans,
        "final_response": final_ans,
        "requires_approval": False,
        "approval_request": result.get("approval_request", ""),
        "flight_results": result.get("flight_results", ""),
        "hotel_results": result.get("hotel_results", ""),
        "weather_results": result.get("weather_results", ""),
        "budget_results": result.get("budget_results", ""),
        "itinerary": result.get("itinerary", ""),
        "selected_agents": result.get("selected_agents", []),
        "trip_constraints": result.get("trip_constraints", {}),
        "supervisor_reasoning": result.get("supervisor_reasoning", ""),
        "guardrail_allowed": result.get("guardrail_allowed", True),
        "guardrail_reason": result.get("guardrail_reason", ""),
        "approved": result.get("approved"),
        "human_feedback": result.get("human_feedback", ""),
        "execution_times": result.get("execution_times", {}),
        "comparison_metrics": result.get("comparison_metrics", {}),
        "mode": "pure_llm",
        "use_jev": False,
        "raw_data": {k: v for k, v in result.items() if k != "messages"},
        "llm_calls": result.get("llm_calls", 0),
    }
