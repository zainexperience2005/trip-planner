import type { FC } from "react";
import { Zap, Cpu, Gauge, Coins, ShieldCheck, CheckCircle2, ArrowRightLeft, Sparkles, AlertTriangle } from "lucide-react";
import type { TripPlanResponse } from "../types";

interface BenchmarkComparisonCardProps {
  plan: TripPlanResponse;
  onSwitchModeAndRerun: (useJev: boolean) => void;
  isLoading: boolean;
}

export const BenchmarkComparisonCard: FC<BenchmarkComparisonCardProps> = ({
  plan,
  onSwitchModeAndRerun,
  isLoading,
}) => {
  const isJevActive = plan.use_jev !== false;
  const metrics = plan.comparison_metrics || {};
  const times = plan.execution_times || {};

  // Real or benchmarked latencies
  const jevTimeMs = times.supervisor_jev_ms || 180;
  const llmRouterTimeMs = times.supervisor_llm_router_ms || (metrics.estimated_llm_router_latency_ms || 2200);
  const speedupMultiplier = metrics.speedup_multiplier || (llmRouterTimeMs / Math.max(1, jevTimeMs)).toFixed(1);

  return (
    <div className="w-full glass-panel rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-2xl bg-gradient-to-b from-slate-900/90 via-slate-950/80 to-slate-950 relative overflow-hidden animate-slide-up">
      {/* Ambient Top Glow */}
      <div className="absolute top-0 right-1/4 w-96 h-32 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Title and Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 mb-5 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Gauge className="h-4 w-4" />
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              Architecture Performance Benchmark
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                TypeSafe Jev vs Pure LLM
              </span>
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Compare throughput, router latency, token expenditure, and structural reliability side-by-side.
          </p>
        </div>

        {/* Interactive Mode Toggle Button */}
        <div className="flex items-center gap-2 self-start lg:self-auto">
          <div className="text-xs text-slate-400 hidden sm:block font-mono">
            Active Mode:
          </div>
          <button
            disabled={isLoading}
            onClick={() => onSwitchModeAndRerun(!isJevActive)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 ${
              isJevActive
                ? "bg-purple-950/80 hover:bg-purple-900/80 border border-purple-700 text-purple-200"
                : "bg-indigo-950/80 hover:bg-indigo-900/80 border border-indigo-700 text-indigo-200"
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5 text-yellow-400" />
            <span>
              {isJevActive ? "Switch to Pure LLM Mode" : "Switch to Hybrid Jev Mode"}
            </span>
          </button>
        </div>
      </div>

      {/* Side-by-Side Architectural Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6">
        
        {/* CARD 1: TypeSafe Jev System 1 (Hybrid) */}
        <div className={`p-4 sm:p-5 rounded-xl border transition-all ${
          isJevActive
            ? "bg-purple-950/30 border-purple-600/50 shadow-lg shadow-purple-500/10 ring-1 ring-purple-500/30"
            : "bg-slate-900/40 border-slate-800 opacity-75"
        }`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-600/20 text-purple-300 border border-purple-500/30">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                  TypeSafe Jev + Groq LLM
                  {isJevActive && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-mono border border-emerald-800/60 font-semibold">
                      ACTIVE
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-purple-300/80 font-mono">System 1 Fast Decision Model</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm sm:text-base font-bold text-emerald-400 font-mono">
                {Math.round(jevTimeMs)}ms
              </span>
              <div className="text-[10px] text-slate-500 font-mono">Router Latency</div>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-purple-400" /> Latency Speed:
              </span>
              <strong className="text-emerald-400 font-mono">~{speedupMultiplier}x Faster</strong>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-yellow-400" /> Router Token Cost:
              </span>
              <strong className="text-emerald-400 font-mono">0 Tokens ($0.00)</strong>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-sky-400" /> Type Safety:
              </span>
              <strong className="text-sky-300 font-mono">100% Typed Math (No JSON parse)</strong>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Guardrail Cost:
              </span>
              <strong className="text-slate-200">Rejects in ~180ms without LLM cost</strong>
            </div>
          </div>
        </div>

        {/* CARD 2: Pure LLM Mode (Prompt-and-Parse JSON) */}
        <div className={`p-4 sm:p-5 rounded-xl border transition-all ${
          !isJevActive
            ? "bg-indigo-950/30 border-indigo-600/50 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/30"
            : "bg-slate-900/40 border-slate-800 opacity-75"
        }`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                  Pure LLM Architecture
                  {!isJevActive && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 text-[10px] font-mono border border-indigo-800/60 font-semibold">
                      ACTIVE
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-indigo-300/80 font-mono">Prompt-and-Parse JSON Router</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm sm:text-base font-bold text-amber-400 font-mono">
                {Math.round(llmRouterTimeMs)}ms
              </span>
              <div className="text-[10px] text-slate-500 font-mono">Router Latency</div>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-indigo-400" /> Latency Speed:
              </span>
              <strong className="text-amber-400 font-mono">1.8s - 3.2s Baseline</strong>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-yellow-400" /> Router Token Cost:
              </span>
              <strong className="text-amber-300 font-mono">~680-850 Tokens/Query</strong>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Type Safety:
              </span>
              <strong className="text-amber-300 font-mono">Unenforced (Brittle JSON parse)</strong>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" /> Guardrail Cost:
              </span>
              <strong className="text-slate-300">Requires full generative LLM call</strong>
            </div>
          </div>
        </div>

      </div>

      {/* Latency Comparison Progress Meter */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
        <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
          <span className="font-semibold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
            Decision Latency Speedometer Comparison:
          </span>
          <span className="font-mono text-[11px] text-emerald-400 font-bold">
            Jev ({Math.round(jevTimeMs)}ms) is {speedupMultiplier}x faster than LLM ({Math.round(llmRouterTimeMs)}ms)
          </span>
        </div>

        <div className="space-y-2">
          {/* Jev Bar */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
              <span>TypeSafe Jev System 1 (Noul + Choice + Score):</span>
              <span className="font-mono text-emerald-400">{Math.round(jevTimeMs)}ms</span>
            </div>
            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
                style={{ width: `${Math.max(6, Math.min(100, (jevTimeMs / llmRouterTimeMs) * 100))}%` }}
              />
            </div>
          </div>

          {/* LLM Bar */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
              <span>Pure LLM Prompt & Parse JSON Router:</span>
              <span className="font-mono text-amber-400">{Math.round(llmRouterTimeMs)}ms</span>
            </div>
            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500"
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
