import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def test_health():
    res = requests.get(f"{BASE_URL}/api/health")
    print(f"[Health] status={res.status_code}, data={res.json()}")

def test_mode(mode: str, query: str):
    print(f"\n==========================================")
    print(f"Testing Mode: {mode.upper()}")
    print(f"Query: {query}")
    print(f"==========================================")
    payload = {
        "user_query": query,
        "mode": mode,
        "use_jev": (mode != "pure_llm")
    }
    t0 = time.perf_counter()
    res = requests.post(f"{BASE_URL}/api/plan", json=payload, timeout=90)
    elapsed = round((time.perf_counter() - t0) * 1000, 1)
    
    if res.status_code != 201:
        print(f"❌ Error {res.status_code}: {res.text}")
        return False
        
    data = res.json()
    returned_mode = data.get("mode")
    llm_calls = data.get("llm_calls", 0)
    times = data.get("execution_times", {})
    selected_agents = data.get("selected_agents", [])
    
    print(f"[SUCCESS] Finished in {elapsed}ms!")
    print(f"   Returned Mode: {returned_mode}")
    print(f"   Selected Agents: {selected_agents}")
    print(f"   LLM Calls: {llm_calls}")
    print(f"   Execution Times: {json.dumps(times, indent=2)}")
    print(f"   Itinerary preview: {data.get('itinerary', '')[:120]}...")
    
    assert returned_mode == mode, f"Expected mode {mode}, got {returned_mode}"
    return True

if __name__ == "__main__":
    test_health()
    
    # 1. Test Pure TypeSafe Jev Mode
    test_mode("jev", "Weekend getaway to Kyoto for temples and matcha")
    
    # 2. Test Pure LLM Mode
    test_mode("pure_llm", "3-day food adventure in Rome with pizza and pasta")
    
    # 3. Test Hybrid Mode
    test_mode("hybrid", "5-day trip to Tokyo visiting Akihabara and Mount Fuji")
