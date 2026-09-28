import os
import time
import certifi
from datetime import datetime
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, Query, status, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import init_db, get_db, TripPlan
from backend import run_travel_agent, resume_travel_agent

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()


# =========================================================
# Lifespan Context Manager
# =========================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database schema
    print("[INFO] Initializing database schema...")
    try:
        init_db()
        print("[SUCCESS] Database schema successfully initialized.")
    except Exception as e:
        print(f"[WARN] Notice on database initialization: {e}")
    yield
    print("[INFO] FastAPI application shutdown.")



# =========================================================
# FastAPI Application & Request Logging Middleware
# =========================================================

app = FastAPI(
    title="AI Travel Planner API",
    description="Multi-Agent AI Trip Planner built with LangGraph, MCP v2, PostgreSQL, and Groq LLM.",
    version="2.0.0",
    lifespan=lifespan,
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def format_duration(ms: float) -> str:
    """Formats milliseconds into clean minutes & seconds or seconds/ms."""
    if ms is None or ms < 0:
        return "0ms"
    if ms < 1000:
        return f"{round(ms)}ms"
    if ms < 60000:
        return f"{ms / 1000:.2f}s"
    mins = int(ms // 60000)
    secs = round((ms % 60000) / 1000, 1)
    return f"{mins}m {secs}s"


@app.middleware("http")
async def log_request_time(request: Request, call_next):
    """Measures and logs total HTTP request duration in mins, secs & ms for all API endpoints."""
    start_time = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start_time) * 1000, 1)
    path = request.url.path
    if path.startswith("/api/"):
        status_code = response.status_code
        status_icon = "🟢" if status_code < 400 else "🔴"
        time_display = format_duration(duration_ms)
        print(f"[API LOG] {status_icon} {request.method} {path} | Total API Time: {time_display} ({duration_ms}ms) | Status: {status_code}")
    return response


# =========================================================
# Pydantic Schemas
# =========================================================

class TripPlanRequest(BaseModel):
    user_query: str = Field(
        ...,
        description="The travel destination or itinerary request.",
        example="Plan a 5-day budget-friendly cultural trip to Tokyo with great ramen spots and historical shrines."
    )
    thread_id: Optional[str] = Field(
        None,
        description="Optional unique session/thread identifier for state persistence.",
        example="trip_tokyo_001"
    )
    mode: Optional[str] = Field(
        "hybrid",
        description="Execution mode: 'jev' (Pure Jev System 1), 'pure_llm' (Pure LLM), or 'hybrid' (Hybrid System 1 & 2).",
        example="hybrid"
    )
    use_jev: Optional[bool] = Field(
        None,
        description="Backward-compatible boolean toggle for TypeSafe Jev (True = hybrid/jev, False = pure_llm).",
        example=True
    )


class ResumeTripPlanRequest(BaseModel):
    thread_id: Optional[str] = Field(
        None,
        description="Unique thread ID of the paused trip plan.",
        example="trip_tokyo_001"
    )
    approved: bool = Field(
        True,
        description="Whether the draft itinerary is approved (True) or needs revisions (False)."
    )
    feedback: Optional[str] = Field(
        "",
        description="Feedback or revision instructions if approved is False.",
        example="Please add more budget-friendly food stalls in Shibuya."
    )
    mode: Optional[str] = Field(
        "hybrid",
        description="Pipeline mode to resume: 'hybrid' | 'jev' | 'pure_llm'."
    )


class TripPlanResponse(BaseModel):
    thread_id: str
    user_query: str
    final_answer: str
    flight_results: Optional[str] = None
    hotel_results: Optional[str] = None
    weather_results: Optional[str] = None
    budget_results: Optional[str] = None
    itinerary: Optional[str] = None
    approval_request: Optional[str] = None
    requires_approval: Optional[bool] = False
    approved: Optional[bool] = None
    human_feedback: Optional[str] = None
    guardrail_allowed: Optional[bool] = True
    guardrail_reason: Optional[str] = None
    selected_agents: Optional[List[str]] = None
    trip_constraints: Optional[Dict[str, Any]] = None
    supervisor_reasoning: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None
    execution_times: Optional[Dict[str, Any]] = None
    comparison_metrics: Optional[Dict[str, Any]] = None
    mode: Optional[str] = "hybrid"
    use_jev: Optional[bool] = True
    llm_calls: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TripPlanSummary(BaseModel):
    id: int
    thread_id: str
    user_query: str
    requires_approval: Optional[bool] = False
    approved: Optional[bool] = None
    created_at: datetime

    class Config:
        from_attributes = True


# =========================================================
# API Endpoints
# =========================================================

@app.get("/", tags=["General"])
def root():
    """Root welcome endpoint with API overview."""
    return {
        "name": "AI Travel Planner API",
        "version": "2.0.0",
        "status": "operational",
        "stack": {
            "orchestration": "LangGraph StateGraph",
            "model": "Groq LLM (openai/gpt-oss-20b / llama-3.3-70b-versatile)",
            "protocol": "Model Context Protocol (MCP) v2",
            "persistence": "PostgreSQL (PostgresSaver + SQLAlchemy) with InMemory fallback",
            "framework": "FastAPI"
        },
        "docs": "/docs",
        "endpoints": {
            "POST /api/plan": "Generate custom multi-agent trip itinerary",
            "POST /api/plans/{thread_id}/resume": "Resume and finalize trip plan after human review",
            "GET /api/plans": "List previously generated trip plans",
            "GET /api/plans/{thread_id}": "Retrieve a specific trip plan with all specialist findings",
            "GET /api/health": "Health check endpoint"
        }
    }


@app.get("/api/health", tags=["General"])
def health_check():
    """Health check endpoint to verify system status."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }


def _save_or_update_trip_plan(db: Session, result: Dict[str, Any], user_query: str) -> TripPlan:
    """Helper to persist all multi-agent specialist results to PostgreSQL / SQLite."""
    thread_id = result["thread_id"]
    final_answer = result.get("final_answer") or result.get("answer") or ""
    flight_results = result.get("flight_results", "")
    hotel_results = result.get("hotel_results", "")
    weather_results = result.get("weather_results", "")
    budget_results = result.get("budget_results", "")
    itinerary = result.get("itinerary", "")
    approval_request = result.get("approval_request", "")
    requires_approval = result.get("requires_approval", False)
    approved = result.get("approved")
    human_feedback = result.get("human_feedback", "")
    guardrail_allowed = result.get("guardrail_allowed", True)
    guardrail_reason = result.get("guardrail_reason", "")
    selected_agents = result.get("selected_agents", [])
    trip_constraints = result.get("trip_constraints", {})
    supervisor_reasoning = result.get("supervisor_reasoning", "")
    raw_data = result.get("raw_data") or result
    execution_times = result.get("execution_times") or {}
    comparison_metrics = result.get("comparison_metrics") or {}
    mode = result.get("mode") or "hybrid"
    use_jev = result.get("use_jev", True)
    llm_calls = result.get("llm_calls", 0)

    existing_plan = db.query(TripPlan).filter(TripPlan.thread_id == thread_id).first()
    if existing_plan:
        existing_plan.user_query = user_query
        existing_plan.flight_results = flight_results
        existing_plan.hotel_results = hotel_results
        existing_plan.weather_results = weather_results
        existing_plan.budget_results = budget_results
        existing_plan.itinerary = itinerary
        existing_plan.final_answer = final_answer
        existing_plan.approval_request = approval_request
        existing_plan.requires_approval = requires_approval
        existing_plan.approved = approved
        existing_plan.human_feedback = human_feedback
        existing_plan.guardrail_allowed = guardrail_allowed
        existing_plan.guardrail_reason = guardrail_reason
        existing_plan.selected_agents = selected_agents
        existing_plan.trip_constraints = trip_constraints
        existing_plan.supervisor_reasoning = supervisor_reasoning
        existing_plan.raw_data = raw_data
        existing_plan.execution_times = execution_times
        existing_plan.comparison_metrics = comparison_metrics
        existing_plan.mode = mode
        existing_plan.use_jev = use_jev
        existing_plan.llm_calls = llm_calls
        existing_plan.created_at = datetime.utcnow()
        db.commit()
        db.refresh(existing_plan)
        return existing_plan
    else:
        record = TripPlan(
            thread_id=thread_id,
            user_query=user_query,
            flight_results=flight_results,
            hotel_results=hotel_results,
            weather_results=weather_results,
            budget_results=budget_results,
            itinerary=itinerary,
            final_answer=final_answer,
            approval_request=approval_request,
            requires_approval=requires_approval,
            approved=approved,
            human_feedback=human_feedback,
            guardrail_allowed=guardrail_allowed,
            guardrail_reason=guardrail_reason,
            selected_agents=selected_agents,
            trip_constraints=trip_constraints,
            supervisor_reasoning=supervisor_reasoning,
            raw_data=raw_data,
            execution_times=execution_times,
            comparison_metrics=comparison_metrics,
            mode=mode,
            use_jev=use_jev,
            llm_calls=llm_calls,
            created_at=datetime.utcnow()
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


@app.post(
    "/api/plan",
    response_model=TripPlanResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Travel Planner"]
)
def create_trip_plan(request: TripPlanRequest, db: Session = Depends(get_db)):
    """
    Execute the multi-agent travel planning graph and return all specialist findings.
    Supports mode: 'jev' (Pure Jev), 'pure_llm' (Pure LLM), or 'hybrid' (Hybrid System 1 & 2).
    """
    if not request.user_query.strip():
        raise HTTPException(status_code=400, detail="user_query cannot be empty.")

    try:
        # Determine mode strictly: request.mode is the authoritative source of truth
        if request.mode and request.mode.strip().lower() in ["jev", "pure_llm", "llm", "hybrid"]:
            raw = request.mode.strip().lower()
            chosen_mode = "pure_llm" if raw == "llm" else raw
        elif request.use_jev is False:
            chosen_mode = "pure_llm"
        else:
            chosen_mode = "hybrid"

        print(f"[API] 🎯 create_trip_plan invoked with mode='{chosen_mode}' (request.mode='{request.mode}', use_jev={request.use_jev})")

        result = run_travel_agent(
            user_input=request.user_query,
            thread_id=request.thread_id,
            mode=chosen_mode,
            use_jev=(chosen_mode != "pure_llm")
        )

        total_time_ms = result.get("execution_times", {}).get("total_pipeline_ms", 0)
        print(f"[API] ✅ Plan created successfully for mode='{chosen_mode}' in {format_duration(total_time_ms)} ({total_time_ms}ms) (Thread: {result.get('thread_id')})")

        record = _save_or_update_trip_plan(db, result, request.user_query)

        return TripPlanResponse(
            thread_id=record.thread_id,
            user_query=record.user_query,
            final_answer=record.final_answer,
            flight_results=record.flight_results,
            hotel_results=record.hotel_results,
            weather_results=record.weather_results,
            budget_results=record.budget_results,
            itinerary=record.itinerary,
            approval_request=record.approval_request,
            requires_approval=record.requires_approval,
            approved=record.approved,
            human_feedback=record.human_feedback,
            guardrail_allowed=record.guardrail_allowed,
            guardrail_reason=record.guardrail_reason,
            selected_agents=record.selected_agents,
            trip_constraints=record.trip_constraints,
            supervisor_reasoning=record.supervisor_reasoning,
            raw_data=record.raw_data,
            execution_times=record.execution_times,
            comparison_metrics=record.comparison_metrics,
            mode=record.mode or chosen_mode,
            use_jev=record.use_jev,
            llm_calls=record.llm_calls,
            created_at=record.created_at
        )

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while generating trip plan: {str(e)}"
        )


@app.post(
    "/api/plans/{thread_id}/resume",
    response_model=TripPlanResponse,
    tags=["Travel Planner"]
)
@app.post(
    "/api/plan/resume",
    response_model=TripPlanResponse,
    tags=["Travel Planner"]
)
def resume_trip_plan(
    request: ResumeTripPlanRequest,
    thread_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Resume execution of a paused trip plan with human review feedback (Human-in-the-Loop).
    """
    active_thread_id = thread_id or request.thread_id
    if not active_thread_id:
        raise HTTPException(status_code=400, detail="thread_id must be provided in the URL or body.")

    plan = db.query(TripPlan).filter(TripPlan.thread_id == active_thread_id).first()
    user_query = plan.user_query if plan else "Trip Planning"

    try:
        result = resume_travel_agent(
            thread_id=active_thread_id,
            approved=request.approved,
            feedback=request.feedback or ""
        )

        record = _save_or_update_trip_plan(db, result, user_query)

        return TripPlanResponse(
            thread_id=record.thread_id,
            user_query=record.user_query,
            final_answer=record.final_answer,
            flight_results=record.flight_results,
            hotel_results=record.hotel_results,
            weather_results=record.weather_results,
            budget_results=record.budget_results,
            itinerary=record.itinerary,
            approval_request=record.approval_request,
            requires_approval=record.requires_approval,
            approved=record.approved,
            human_feedback=record.human_feedback,
            guardrail_allowed=record.guardrail_allowed,
            guardrail_reason=record.guardrail_reason,
            selected_agents=record.selected_agents,
            trip_constraints=record.trip_constraints,
            supervisor_reasoning=record.supervisor_reasoning,
            raw_data=record.raw_data,
            execution_times=record.execution_times,
            comparison_metrics=record.comparison_metrics,
            use_jev=record.use_jev,
            llm_calls=record.llm_calls,
            created_at=record.created_at
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while resuming trip plan: {str(e)}"
        )


@app.get("/api/plans", response_model=List[TripPlanSummary], tags=["Travel Planner"])
def list_trip_plans(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Retrieve a paginated list of saved trip plans from database."""
    plans = (
        db.query(TripPlan)
        .order_by(TripPlan.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return plans


@app.get("/api/plans/{thread_id}", response_model=TripPlanResponse, tags=["Travel Planner"])
def get_trip_plan(thread_id: str, db: Session = Depends(get_db)):
    """Retrieve full details of a specific trip plan including all specialist findings."""
    plan = db.query(TripPlan).filter(TripPlan.thread_id == thread_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail=f"Trip plan with thread_id '{thread_id}' not found.")
    return plan


@app.delete("/api/plans/{thread_id}", tags=["Travel Planner"])
def delete_trip_plan(thread_id: str, db: Session = Depends(get_db)):
    """Delete a saved trip plan from database."""
    plan = db.query(TripPlan).filter(TripPlan.thread_id == thread_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail=f"Trip plan with thread_id '{thread_id}' not found.")
    
    db.delete(plan)
    db.commit()
    return {"status": "success", "message": f"Trip plan '{thread_id}' deleted successfully."}

