import os
import certifi
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()


def get_sqlalchemy_database_url() -> str:
    """Format database URL for SQLAlchemy with psycopg3 or SQLite fallback."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url or "user:password" in database_url:
        return "sqlite:///./trip_plans.db"

    # Standardize scheme for SQLAlchemy with psycopg
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif database_url.startswith("postgresql://") and not database_url.startswith("postgresql+psycopg://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)

    if "sslmode=" not in database_url and "localhost" not in database_url and "127.0.0.1" not in database_url:
        separator = "&" if "?" in database_url else "?"
        database_url = f"{database_url}{separator}sslmode=require"

    return database_url


from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Boolean, JSON
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()


class TripPlan(Base):
    __tablename__ = "trip_plans"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    thread_id = Column(String(100), unique=True, index=True, nullable=False)
    user_query = Column(Text, nullable=False)
    flight_results = Column(Text, nullable=True)
    hotel_results = Column(Text, nullable=True)
    weather_results = Column(Text, nullable=True)
    budget_results = Column(Text, nullable=True)
    itinerary = Column(Text, nullable=True)
    final_answer = Column(Text, nullable=False)
    approval_request = Column(Text, nullable=True)
    requires_approval = Column(Boolean, default=False, nullable=True)
    approved = Column(Boolean, nullable=True)
    human_feedback = Column(Text, nullable=True)
    guardrail_allowed = Column(Boolean, default=True, nullable=True)
    guardrail_reason = Column(Text, nullable=True)
    selected_agents = Column(JSON, nullable=True)
    trip_constraints = Column(JSON, nullable=True)
    supervisor_reasoning = Column(Text, nullable=True)
    raw_data = Column(JSON, nullable=True)
    execution_times = Column(JSON, nullable=True)
    comparison_metrics = Column(JSON, nullable=True)
    use_jev = Column(Boolean, default=True, nullable=True)
    llm_calls = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


# Initialize SQLAlchemy Engine & SessionMaker
DATABASE_URL = get_sqlalchemy_database_url()


def create_configured_engine(url: str):
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})
    return create_engine(
        url,
        connect_args={"connect_timeout": 3},
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=10,
    )

engine = create_configured_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _ensure_columns(engine_instance):
    """Ensure all required columns exist in the trip_plans table."""
    try:
        from sqlalchemy import text, inspect
        inspector = inspect(engine_instance)
        if "trip_plans" in inspector.get_table_names():
            existing_cols = {col["name"] for col in inspector.get_columns("trip_plans")}
            new_cols = {
                "budget_results": "TEXT",
                "approval_request": "TEXT",
                "requires_approval": "BOOLEAN DEFAULT 0",
                "approved": "BOOLEAN",
                "human_feedback": "TEXT",
                "guardrail_allowed": "BOOLEAN DEFAULT 1",
                "guardrail_reason": "TEXT",
                "selected_agents": "JSON",
                "trip_constraints": "JSON",
                "supervisor_reasoning": "TEXT",
                "raw_data": "JSON",
                "execution_times": "JSON",
                "comparison_metrics": "JSON",
                "use_jev": "BOOLEAN DEFAULT 1",
            }
            with engine_instance.begin() as conn:
                for col_name, col_type in new_cols.items():
                    if col_name not in existing_cols:
                        try:
                            conn.execute(text(f"ALTER TABLE trip_plans ADD COLUMN {col_name} {col_type}"))
                        except Exception:
                            pass
    except Exception as e:
        print(f"[DEBUG] Notice on column migration: {e}")


def init_db():
    """Create database tables if they do not exist with fallback to SQLite."""
    global engine, SessionLocal
    try:
        with engine.connect() as conn:
            pass
        Base.metadata.create_all(bind=engine)
        _ensure_columns(engine)
    except Exception as e:
        print(f"[WARN] PostgreSQL unavailable ({e}). Falling back to local SQLite database (trip_plans.db)...")
        engine = create_configured_engine("sqlite:///./trip_plans.db")
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        Base.metadata.create_all(bind=engine)
        _ensure_columns(engine)


def get_db():
    """FastAPI Dependency for database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



