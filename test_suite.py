import sys
import io

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
elif hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from fastapi.testclient import TestClient
from app import app
from database import init_db


def run_tests():
    print("=" * 60)
    print("Starting AI Travel Planner Integration & Unit Tests")
    print("=" * 60)

    # 1. Database Initialization
    print("\n[STEP 1] Testing Database Table Initialization...")
    init_db()
    print("-> Database initialized successfully.")

    client = TestClient(app)

    # 2. Test Root Endpoint
    print("\n[STEP 2] Testing Root Endpoint (GET /)...")
    res_root = client.get("/")
    assert res_root.status_code == 200, f"Root endpoint failed: {res_root.text}"
    print(f"-> Status: {res_root.status_code}")
    print(f"-> Response: {res_root.json()['name']} v{res_root.json()['version']}")

    # 3. Test Health Endpoint
    print("\n[STEP 3] Testing Health Endpoint (GET /api/health)...")
    res_health = client.get("/api/health")
    assert res_health.status_code == 200, f"Health endpoint failed: {res_health.text}"
    print(f"-> Status: {res_health.status_code}, System: {res_health.json()['status']}")

    # 4. Test Multi-Agent Trip Planner Generation (POST /api/plan)
    print("\n[STEP 4] Testing Multi-Agent Trip Generation (POST /api/plan)...")
    test_payload = {
        "user_query": "Plan a 3-day weekend trip to Tokyo with cultural sights and great ramen.",
        "thread_id": "test_tokyo_001"
    }
    print(f"-> Sending query: '{test_payload['user_query']}'")
    res_plan = client.post("/api/plan", json=test_payload)
    assert res_plan.status_code == 201, f"Plan creation failed: {res_plan.status_code} - {res_plan.text}"
    plan_data = res_plan.json()
    print("-> Plan generated successfully!")
    print(f"-> Thread ID: {plan_data.get('thread_id')}")
    print(f"-> Total LLM calls: {plan_data.get('llm_calls')}")
    print(f"-> Final Answer Preview (first 250 chars):\n{plan_data.get('final_answer')[:250]}...")

    # 5. Test Listing Plans (GET /api/plans)
    print("\n[STEP 5] Testing List Trip Plans (GET /api/plans)...")
    res_list = client.get("/api/plans")
    assert res_list.status_code == 200, f"List plans failed: {res_list.text}"
    plans = res_list.json()
    print(f"-> Retrieved {len(plans)} saved plan(s) from database.")

    # 6. Test Getting Specific Plan (GET /api/plans/{thread_id})
    print("\n[STEP 6] Testing Retrieve Specific Plan (GET /api/plans/test_tokyo_001)...")
    res_get = client.get("/api/plans/test_tokyo_001")
    assert res_get.status_code == 200, f"Get plan failed: {res_get.text}"
    print("-> Retrieved plan verified successfully.")

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED SUCCESSFULLY! The project is fully operational.")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
