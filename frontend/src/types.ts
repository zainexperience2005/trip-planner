export interface TripConstraints {
  destination?: string;
  origin?: string;
  duration?: string;
  budget?: string;
  travel_style?: string;
  destination_clarity_score?: number;
  special_preferences?: string[];
}

export type ExecutionMode = "jev" | "pure_llm" | "hybrid";

export interface TripPlanResponse {
  thread_id: string;
  answer: string;
  final_answer?: string;
  final_response?: string;
  requires_approval: boolean;
  approval_request?: string;
  
  flight_results?: string;
  hotel_results?: string;
  weather_results?: string;
  budget_results?: string;
  itinerary?: string;
  
  selected_agents?: string[];
  trip_constraints?: TripConstraints;
  supervisor_reasoning?: string;
  
  guardrail_allowed?: boolean;
  guardrail_reason?: string;
  approved?: boolean | null;
  human_feedback?: string;
  execution_times?: Record<string, number>;
  comparison_metrics?: Record<string, any>;
  mode?: ExecutionMode;
  use_jev?: boolean;
  llm_calls?: number;
  
  id?: number;
  user_query?: string;
  destination?: string;
  origin?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PlanHistoryItem {
  id: number;
  thread_id: string;
  user_query: string;
  destination?: string;
  requires_approval: boolean;
  approved?: boolean | null;
  created_at?: string;
  selected_agents?: string[];
  guardrail_allowed?: boolean;
}

export type StepState = "idle" | "running" | "completed" | "skipped" | "blocked" | "waiting_approval";

export interface AgentStep {
  id: string;
  name: string;
  type: "guardrail" | "supervisor" | "specialist" | "itinerary" | "hitl" | "concierge";
  description: string;
  icon: string;
  status: StepState;
  details?: string;
  metadata?: Record<string, any>;
}

/**
 * Formats milliseconds into human-readable minutes and seconds format.
 * - Under 1s: "420ms"
 * - 1s to 59.9s: "14.2s"
 * - 60s+: "2m 5s"
 */
export function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null || isNaN(ms) || ms <= 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const mins = Math.floor(ms / 60000);
  const remainingSecs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${remainingSecs}s`;
}

