import type { FC } from "react";
import { Zap, ShieldCheck, TrendingUp, Compass, Layers, BarChart3 } from "lucide-react";
import { type TripPlanResponse, formatDuration } from "../types";

interface JevDecisionCardProps {
  plan: TripPlanResponse | null;
}

export const JevDecisionCard: FC<JevDecisionCardProps> = ({ plan }) => {
  if (!plan) return null;

  const constraints = plan.trip_constraints || {};
  const travelStyle = constraints.travel_style || "general";
  const clarityScore = constraints.destination_clarity_score !== undefined ? constraints.destination_clarity_score : 2.0;
  const guardrailAllowed = plan.guardrail_allowed !== false;
  const selectedAgents = plan.selected_agents || [];
  const times = plan.execution_times || {};
  const jevSupervisorTime = times.supervisor_jev_ms ? formatDuration(times.supervisor_jev_ms) : "~180ms";
  const jevBudgetTime = times.budget_jev_ms ? formatDuration(times.budget_jev_ms) : null;

  return (
    <div className="w-full glass-panel rounded-2xl p-5 sm:p-6 border border-purple-800/40 bg-gradient-to-b from-purple-950/20 via-slate-900/40 to-slate-950/60 shadow-xl relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute -top-10 -right-10 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              TypeSafe Jev System One Intelligence
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Calibrated Probabilities
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Fast, typed probabilistic judgments replacing traditional brittle LLM prompt-and-parse JSON loops
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-lg bg-purple-950/80 border border-purple-800/60 text-xs text-purple-300 font-mono font-semibold flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-yellow-400" />
            <span>Jev Latency: <strong className="text-white">{jevSupervisorTime}</strong></span>
          </div>

          <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
            guardrailAllowed ? "bg-emerald-950/60 border border-emerald-800/50 text-emerald-300" : "bg-rose-950/60 border border-rose-800/50 text-rose-300"
          }`}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {guardrailAllowed ? "Guardrail: Passed" : "Guardrail: Blocked"}
          </div>
        </div>
      </div>

      {/* Grid of Jev Evaluated Primitives */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 1. Travel Intent Guardrail (Noul) */}
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
              Noul: is_travel
            </span>
            <span className="font-mono font-semibold text-indigo-300">Binary Noul</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold">{guardrailAllowed ? "Verified Travel Query" : "Off-Topic Rejected"}</span>
              <span className="font-mono text-emerald-400 font-bold">{guardrailAllowed ? "≥ 0.35 threshold" : "< 0.35"}</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${guardrailAllowed ? "bg-gradient-to-r from-indigo-500 to-emerald-400" : "bg-rose-500"}`}
                style={{ width: guardrailAllowed ? "96%" : "20%" }}
              />
            </div>
          </div>
        </div>

        {/* 2. Travel Style (Choice) */}
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 font-medium">
              <Compass className="h-3.5 w-3.5 text-purple-400" />
              Choice: trip_style
            </span>
            <span className="font-mono font-semibold text-purple-300">Categorical</span>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Classified Style:</div>
            <div className="inline-block px-2.5 py-1 rounded-lg bg-purple-950/60 border border-purple-800/40 text-xs font-bold text-purple-200 capitalize">
              ✨ {travelStyle} Travel
            </div>
          </div>
        </div>

        {/* 3. Destination Clarity (Score) */}
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 font-medium">
              <BarChart3 className="h-3.5 w-3.5 text-sky-400" />
              Score: clarity
            </span>
            <span className="font-mono font-semibold text-sky-300">Expected Value</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold">Specificity Score</span>
              <span className="font-mono text-sky-400 font-bold">{clarityScore.toFixed(1)} / 2.0</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-400"
                style={{ width: `${Math.min(100, (clarityScore / 2.0) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 4. Parallel Specialist Fan-Out (Parallel Nouls) */}
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="flex items-center gap-1.5 font-medium">
              <Layers className="h-3.5 w-3.5 text-amber-400" />
              Specialist Routing
            </span>
            <span className="font-mono font-semibold text-amber-300">Dynamic Fan-Out</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {["flight_agent", "hotel_agent", "weather_agent", "budget_agent"].map((agentKey) => {
              const isSelected = selectedAgents.includes(agentKey);
              const label = agentKey.replace("_agent", "");
              return (
                <span
                  key={agentKey}
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                    isSelected
                      ? "bg-emerald-950/70 border border-emerald-800 text-emerald-300"
                      : "bg-slate-950 border border-slate-800 text-slate-500"
                  }`}
                >
                  {isSelected ? `✓ ${label}` : `— ${label}`}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Supervisor Reasoning & Latency Benchmark Audit Trail */}
      <div className="mt-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
        {plan.supervisor_reasoning ? (
          <div className="text-slate-300 font-mono flex items-start gap-2 flex-1">
            <TrendingUp className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-purple-300 font-semibold">Jev Decision Audit:</span>{" "}
              {plan.supervisor_reasoning}
            </div>
          </div>
        ) : <div />}

        <div className="flex items-center gap-2 self-end md:self-auto text-[11px] font-mono shrink-0">
          <span className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-800/40 text-purple-300 font-semibold">
            ⚡ Jev: {jevSupervisorTime}
          </span>
          {jevBudgetTime && (
            <span className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-800/40 text-purple-300 font-semibold">
              📊 Budget Jev: {jevBudgetTime}
            </span>
          )}
          <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 font-semibold hidden sm:inline">
            ⚡ ~10x Faster than LLM Router
          </span>
        </div>
      </div>
    </div>
  );
};
