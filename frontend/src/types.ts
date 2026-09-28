export interface TripConstraints {
  destination?: string;
  origin?: string;
  duration?: string;
  budget?: string;
  travel_style?: string;
  destination_clarity_score?: number;
  special_preferences?: string[];
}

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
