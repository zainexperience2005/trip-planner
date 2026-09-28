import type { TripPlanResponse, PlanHistoryItem } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export async function checkBackendHealth(): Promise<{ status: string; database?: string; jev_ready?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: "GET" });
    if (!res.ok) throw new Error("Backend offline");
    return await res.json();
  } catch {
    return { status: "unreachable" };
  }
}

export async function createTripPlan(query: string, origin?: string, threadId?: string): Promise<TripPlanResponse> {
  const payload: Record<string, any> = { query };
  if (origin) payload.origin = origin;
  if (threadId) payload.thread_id = threadId;

  const res = await fetch(`${API_BASE}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Request failed with status ${res.status}`);
  }

  return await res.json();
}

export async function resumeTripPlan(threadId: string, approved: boolean, feedback: string = ""): Promise<TripPlanResponse> {
  const res = await fetch(`${API_BASE}/api/plans/${threadId}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved, feedback }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Resume failed with status ${res.status}`);
  }

  return await res.json();
}

export async function getPlanHistory(): Promise<PlanHistoryItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/plans?limit=20`, { method: "GET" });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("Failed to load plans history:", err);
    return [];
  }
}

export async function getPlanDetails(threadId: string): Promise<TripPlanResponse> {
  const res = await fetch(`${API_BASE}/api/plans/${threadId}`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Plan not found for thread ${threadId}`);
  }
  return await res.json();
}
