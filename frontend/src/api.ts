import type { TripPlanResponse, PlanHistoryItem } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function parseErrorMessage(errorData: any, defaultMsg: string): string {
  if (!errorData) return defaultMsg;
  if (typeof errorData === "string") return errorData;
  if (typeof errorData.detail === "string") return errorData.detail;
  if (Array.isArray(errorData.detail)) {
    return errorData.detail
      .map((item: any) => {
        const field = item.loc ? item.loc.slice(1).join(".") : "";
        return field ? `${field}: ${item.msg}` : item.msg;
      })
      .join("; ");
  }
  if (typeof errorData.detail === "object" && errorData.detail !== null) {
    return JSON.stringify(errorData.detail);
  }
  if (typeof errorData.message === "string") return errorData.message;
  return defaultMsg;
}

export async function checkBackendHealth(): Promise<{ status: string; database?: string; jev_ready?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { method: "GET" });
    if (!res.ok) throw new Error("Backend offline");
    return await res.json();
  } catch {
    try {
      const rootRes = await fetch(`${API_BASE}/`, { method: "GET" });
      if (rootRes.ok) return await rootRes.json();
    } catch {
      // ignore
    }
    return { status: "unreachable" };
  }
}

export async function createTripPlan(query: string, origin?: string, threadId?: string): Promise<TripPlanResponse> {
  const fullQuery = origin && origin.trim() && origin.trim().toUpperCase() !== "DAC"
    ? `${query} (Origin airport: ${origin.trim().toUpperCase()})`
    : query;

  const payload: Record<string, any> = {
    user_query: fullQuery,
  };
  if (threadId) payload.thread_id = threadId;

  const res = await fetch(`${API_BASE}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(parseErrorMessage(errorData, `Request failed with status ${res.status}`));
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
    throw new Error(parseErrorMessage(errorData, `Resume failed with status ${res.status}`));
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
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(parseErrorMessage(errorData, `Plan not found for thread ${threadId}`));
  }
  return await res.json();
}
