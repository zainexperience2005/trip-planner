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

const STEPS: StepItem[] = [
  {
    id: "supervisor",
    name: "Supervisor Guardrail & Routing",
    tag: "TypeSafe Jev System 1",
    type: "Decision Model",
    icon: <Zap className="h-4 w-4 text-purple-400" />,
    description: "Evaluates input safety (Noul), activates specialist agents, and extracts travel style.",
  },
  {
    id: "flight_agent",
    name: "Flight Specialist",
    tag: "Aviation MCP Tool",
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
    tag: "TypeSafe Jev + Groq",
    type: "Scoring & Analysis",
    agentKey: "budget_agent",
    icon: <DollarSign className="h-4 w-4 text-green-400" />,
    description: "Calculates feasibility score (0-2), pricing tier, and peak price surge risk.",
  },
  {
    id: "itinerary_agent",
    name: "Itinerary Specialist",
    tag: "Groq LLM Synthesis",
    type: "Synthesis",
    agentKey: "itinerary_agent",
    icon: <CalendarCheck className="h-4 w-4 text-indigo-400" />,
    description: "Drafts cohesive morning, afternoon, and evening day-by-day schedules.",
  },
  {
    id: "human_approval",
    name: "Human-in-the-Loop Review",
    tag: "LangGraph Interrupt",
    type: "HITL Control",
    icon: <UserCheck className="h-4 w-4 text-amber-400" />,
    description: "Pauses execution for traveler review, approval, or revision feedback.",
  },
  {
    id: "final_agent",
    name: "Final Concierge Guide",
    tag: "Concierge Synthesis",
    type: "Final Output",
    icon: <Award className="h-4 w-4 text-rose-400" />,
    description: "Compiles all specialist reports and feedback into a master travel guide.",
  },
];

export const AgentProgressTimeline: FC<AgentProgressTimelineProps> = ({
  plan,
  isLoading,
}) => {
  const selectedAgents = plan?.selected_agents || [];
  const isBlocked = plan && plan.guardrail_allowed === false;
  const isWaitingApproval = plan?.requires_approval;
  const isApproved = plan?.approved === true;

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

  return (
    <div className="w-full glass-panel rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-400" />
            Multi-Agent Execution Pipeline Flow
          </h2>
          <p className="text-xs text-slate-400">
            Real-time visual audit trail of LangGraph state transitions and TypeSafe Jev routing
          </p>
        </div>

        {plan?.supervisor_reasoning && (
          <div className="px-3 py-1 rounded-lg bg-indigo-950/40 border border-indigo-800/40 text-[11px] text-indigo-300">
            <strong>Supervisor:</strong> {plan.selected_agents?.length || 0} active specialists routed
          </div>
        )}
      </div>

      {/* Steps List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {STEPS.map((step) => {
          const status = getStepStatus(step);

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
                <ArrowRight className="h-3 w-3" /> Skipped (Jev)
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
            </div>
          );
        })}
      </div>
    </div>
  );
};
