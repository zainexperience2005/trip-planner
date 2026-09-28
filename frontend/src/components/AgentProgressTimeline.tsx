import type { FC, ReactNode } from "react";
import {
  Zap,
  Plane,
  Building2,
  CloudSun,
  DollarSign,
  CalendarCheck,
  UserCheck,
  Award,
  CheckCircle2,
  Clock,
  Ban,
  ArrowRight,
} from "lucide-react";
import type { TripPlanResponse } from "../types";

interface AgentProgressTimelineProps {
  plan: TripPlanResponse | null;
  isLoading: boolean;
}

interface StepItem {
  id: string;
  name: string;
  tag: string;
  type: string;
  icon: ReactNode;
  description: string;
  agentKey?: string;
}

function getStepsForMode(mode: string = "hybrid"): StepItem[] {
  const isPureLLM = mode === "pure_llm";
  const isJev = mode === "jev";

  return [
    {
      id: "supervisor",
      name: "Supervisor Guardrail & Routing",
      tag: isPureLLM ? "Groq LLM Prompt-and-Parse (~2.4s)" : isJev ? "Pure TypeSafe Jev Decision Model (~180ms)" : "TypeSafe Jev System 1 (~180ms)",
      type: isPureLLM ? "LLM JSON Parser" : "Decision Model",
      icon: <Zap className="h-4 w-4 text-purple-400" />,
      description: isPureLLM
        ? "Uses Groq LLM prompt-and-parse JSON to check content policy and route agent tasks."
        : "Evaluates input safety (Noul), activates specialist agents (Choice), and extracts travel style.",
    },
    {
      id: "flight_agent",
      name: "Flight Specialist",
      tag: isPureLLM ? "Aviation Tool + LLM" : "Aviation MCP Tool",
      type: "Tool + LLM",
      agentKey: "flight_agent",
      icon: <Plane className="h-4 w-4 text-sky-400" />,
      description: "Queries airport databases, hubs, and airlines to advise on routing & fares.",
    },
    {
      id: "hotel_agent",
      name: "Hotel Specialist",
      tag: "Tavily Web Search MCP",
      type: "Live Search",
      agentKey: "hotel_agent",
      icon: <Building2 className="h-4 w-4 text-amber-400" />,
      description: "Searches live accommodation data, boutique stays, and neighborhood lodging.",
    },
    {
      id: "weather_agent",
      name: "Weather Specialist",
      tag: "Open-Meteo MCP",
      type: "Meteorological API",
      agentKey: "weather_agent",
      icon: <CloudSun className="h-4 w-4 text-emerald-400" />,
      description: "Retrieves live current temperature and 7-day extended forecasts.",
    },
    {
      id: "budget_agent",
      name: "Budget & Risk Specialist",
      tag: isPureLLM ? "Groq LLM Risk Evaluator" : isJev ? "TypeSafe Jev Score (0-2) + Choice" : "TypeSafe Jev + Groq LLM",
      type: isPureLLM ? "LLM Analysis" : "Scoring & Analysis",
      agentKey: "budget_agent",
      icon: <DollarSign className="h-4 w-4 text-green-400" />,
      description: isPureLLM
        ? "Evaluates price risk using standard LLM generative reasoning."
        : "Calculates feasibility score (0-2), pricing tier, and peak price surge risk via TypeSafe Jev.",
    },
    {
      id: "itinerary_agent",
      name: "Itinerary Specialist",
      tag: isJev ? "Jev Structured Synthesis" : "Groq LLM Synthesis",
      type: "Synthesis",
      agentKey: "itinerary_agent",
      icon: <CalendarCheck className="h-4 w-4 text-indigo-400" />,
      description: "Drafts cohesive morning, afternoon, and evening day-by-day schedules.",
    },
    {
      id: "human_approval",
      name: "Human-in-the-Loop Review",
      tag: isJev ? "Review Checkpoint" : "LangGraph Interrupt",
      type: "HITL Control",
      icon: <UserCheck className="h-4 w-4 text-amber-400" />,
      description: "Pauses execution for traveler review, approval, or revision feedback.",
    },
    {
      id: "final_agent",
      name: "Final Concierge Guide",
      tag: isPureLLM ? "Groq Concierge (Pure LLM)" : isJev ? "TypeSafe Concierge" : "Master Concierge (Hybrid)",
      type: "Final Output",
      icon: <Award className="h-4 w-4 text-rose-400" />,
      description: "Compiles all specialist reports and feedback into a master travel guide.",
    },
  ];
}

function formatLatency(ms?: number): string {
  if (!ms) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export const AgentProgressTimeline: FC<AgentProgressTimelineProps> = ({
  plan,
  isLoading,
}) => {
  const currentMode = plan?.mode || "hybrid";
  const steps = getStepsForMode(currentMode);
  const selectedAgents = plan?.selected_agents || [];
  const isBlocked = plan && plan.guardrail_allowed === false;
  const isWaitingApproval = plan?.requires_approval;
  const isApproved = plan?.approved === true;
  const times = plan?.execution_times || {};

  const getStepStatus = (step: StepItem) => {
    if (!plan && !isLoading) return "idle";
    if (isLoading) return "running";

    if (isBlocked) {
      if (step.id === "supervisor") return "blocked";
      return "skipped";
    }

    if (step.id === "supervisor") return "completed";

    // Specialist step checking
    if (step.agentKey) {
      const isSelected = selectedAgents.includes(step.agentKey);
      if (!isSelected) return "skipped";

      // Check if this step has output
      if (step.agentKey === "flight_agent" && plan?.flight_results) return "completed";
      if (step.agentKey === "hotel_agent" && plan?.hotel_results) return "completed";
      if (step.agentKey === "weather_agent" && plan?.weather_results) return "completed";
      if (step.agentKey === "budget_agent" && plan?.budget_results) return "completed";
      if (step.agentKey === "itinerary_agent" && plan?.itinerary) return "completed";

      return "completed";
    }

    if (step.id === "human_approval") {
      if (isWaitingApproval) return "waiting_approval";
      if (isApproved !== undefined && isApproved !== null) return "completed";
      return "idle";
    }

    if (step.id === "final_agent") {
      if (plan?.final_response && !isWaitingApproval) return "completed";
      return isWaitingApproval ? "idle" : "completed";
    }

    return "idle";
  };

  const getStepLatencyDetails = (stepId: string) => {
    switch (stepId) {
      case "supervisor":
        if (times.supervisor_jev_ms) {
          return `⚡ Jev: ${formatLatency(times.supervisor_jev_ms)}`;
        }
        return times.supervisor_agent_ms ? `⏱ ${formatLatency(times.supervisor_agent_ms)}` : null;
      case "flight_agent":
        if (times.flight_llm_ms && times.flight_mcp_ms) {
          return `✈ MCP: ${formatLatency(times.flight_mcp_ms)} · 🤖 LLM: ${formatLatency(times.flight_llm_ms)}`;
        }
        return times.flight_agent_ms ? `⏱ ${formatLatency(times.flight_agent_ms)}` : null;
      case "hotel_agent":
        return times.hotel_mcp_ms
          ? `🌐 Tavily Search: ${formatLatency(times.hotel_mcp_ms)}`
          : times.hotel_agent_ms
          ? `⏱ ${formatLatency(times.hotel_agent_ms)}`
          : null;
      case "weather_agent":
        return times.weather_mcp_ms
          ? `⛅ Open-Meteo: ${formatLatency(times.weather_mcp_ms)}`
          : times.weather_agent_ms
          ? `⏱ ${formatLatency(times.weather_agent_ms)}`
          : null;
      case "budget_agent":
        if (times.budget_jev_ms && times.budget_llm_ms) {
          return `⚡ Jev: ${formatLatency(times.budget_jev_ms)} · 🤖 LLM: ${formatLatency(times.budget_llm_ms)}`;
        }
        return times.budget_agent_ms ? `⏱ ${formatLatency(times.budget_agent_ms)}` : null;
      case "itinerary_agent":
        return times.itinerary_llm_ms
          ? `🤖 Groq LLM: ${formatLatency(times.itinerary_llm_ms)}`
          : times.itinerary_agent_ms
          ? `⏱ ${formatLatency(times.itinerary_agent_ms)}`
          : null;
      case "final_agent":
        return times.final_llm_ms
          ? `🤖 Groq Concierge: ${formatLatency(times.final_llm_ms)}`
          : times.final_agent_ms
          ? `⏱ ${formatLatency(times.final_agent_ms)}`
          : null;
      default:
        return null;
    }
  };

  return (
    <div className="w-full glass-panel rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-400" />
            Multi-Agent Execution Pipeline Flow
          </h2>
          <p className="text-xs text-slate-400">
            Real-time visual audit trail of LangGraph state transitions, TypeSafe Jev decisions & LLM latencies
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {plan?.mode && (
            <div className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border ${
              plan.mode === "jev"
                ? "bg-purple-950/60 border-purple-800/50 text-purple-300"
                : plan.mode === "pure_llm"
                ? "bg-slate-900 border-slate-700 text-slate-300"
                : "bg-indigo-950/60 border-indigo-800/50 text-indigo-300"
            }`}>
              <span>
                {plan.mode === "jev"
                  ? "⚡ Pure TypeSafe Jev"
                  : plan.mode === "pure_llm"
                  ? "🤖 Pure LLM Pipeline"
                  : "🚀 Hybrid Jev + LLM"}
              </span>
            </div>
          )}
          {times.total_pipeline_ms && (
            <div className="px-3 py-1 rounded-lg bg-emerald-950/50 border border-emerald-800/40 text-[11px] text-emerald-300 font-mono flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span>Total: <strong>{formatLatency(times.total_pipeline_ms)}</strong></span>
            </div>
          )}
          {plan?.supervisor_reasoning && (
            <div className="px-3 py-1 rounded-lg bg-indigo-950/40 border border-indigo-800/40 text-[11px] text-indigo-300 hidden md:block">
              <strong>Active:</strong> {plan.selected_agents?.length || 0} agents
            </div>
          )}
        </div>
      </div>

      {/* Steps List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((step) => {
          const status = getStepStatus(step);
          const latencyDetails = getStepLatencyDetails(step.id);

          let statusBadge = (
            <span className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
              <Clock className="h-3 w-3" /> Standby
            </span>
          );

          let cardBorder = "border-slate-800 bg-slate-900/40";

          if (status === "running") {
            statusBadge = (
              <span className="flex items-center gap-1 text-[10px] text-indigo-400 font-semibold animate-pulse">
                <div className="h-2 w-2 rounded-full bg-indigo-400 animate-ping" /> Executing
              </span>
            );
            cardBorder = "border-indigo-500/50 bg-indigo-950/20";
          } else if (status === "completed") {
            statusBadge = (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                <CheckCircle2 className="h-3 w-3" /> Completed
              </span>
            );
            cardBorder = "border-emerald-500/30 bg-emerald-950/10";
          } else if (status === "waiting_approval") {
            statusBadge = (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold animate-pulse">
                <Clock className="h-3 w-3" /> Action Required
              </span>
            );
            cardBorder = "border-amber-500/50 bg-amber-950/20 shadow-lg shadow-amber-500/10";
          } else if (status === "blocked") {
            statusBadge = (
              <span className="flex items-center gap-1 text-[10px] text-rose-400 font-semibold">
                <Ban className="h-3 w-3" /> Guardrail Block
              </span>
            );
            cardBorder = "border-rose-500/40 bg-rose-950/20";
          } else if (status === "skipped") {
            statusBadge = (
              <span className="flex items-center gap-1 text-[10px] text-slate-600 font-normal">
                <ArrowRight className="h-3 w-3" /> {currentMode === "pure_llm" ? "Skipped (LLM)" : "Skipped (Jev)"}
              </span>
            );
            cardBorder = "border-slate-900/60 bg-slate-950/40 opacity-60";
          }

          return (
            <div
              key={step.id}
              className={`p-3.5 rounded-xl border transition-all ${cardBorder} flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                    {step.icon}
                  </div>
                  {statusBadge}
                </div>

                <div className="font-semibold text-xs text-slate-200">
                  {step.name}
                </div>
                <div className="text-[10px] font-mono text-purple-300/90 mt-0.5">
                  {step.tag}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 leading-snug line-clamp-2">
                  {step.description}
                </p>
              </div>

              {/* Step Latency Breakdown Badge */}
              {status === "completed" && latencyDetails && (
                <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-300">
                  <span className="text-slate-400">Time Taken:</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-indigo-300 font-semibold">
                    {latencyDetails}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
