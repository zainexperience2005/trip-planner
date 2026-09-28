import type { FC } from "react";
import { Zap, Cpu, Gauge, Sparkles } from "lucide-react";
import { type TripPlanResponse, type ExecutionMode, formatDuration } from "../types";

interface BenchmarkComparisonCardProps {
  plan: TripPlanResponse;
  onSwitchModeAndRerun: (mode: ExecutionMode) => void;
  isLoading: boolean;
}

export const BenchmarkComparisonCard: FC<BenchmarkComparisonCardProps> = ({
  plan,
  onSwitchModeAndRerun,
  isLoading,
}) => {
  const currentMode: ExecutionMode = (plan.mode as ExecutionMode) || (plan.use_jev === false ? "pure_llm" : "hybrid");
  const metrics = plan.comparison_metrics || {};
  const times = plan.execution_times || {};

  // Latencies
  const jevTimeMs = times.supervisor_jev_ms || 180;
  const llmRouterTimeMs = times.supervisor_llm_router_ms || (metrics.estimated_llm_router_latency_ms || 2200);

  return (
    <div className="w-full glass-panel rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-2xl bg-gradient-to-b from-slate-900/90 via-slate-950/80 to-slate-950 relative overflow-hidden animate-slide-up">
      {/* Ambient Top Glow */}
      <div className="absolute top-0 right-1/4 w-96 h-32 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Title and 3-Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 mb-5 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Gauge className="h-4 w-4" />
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              Architecture Performance Benchmark
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                3 Execution Modes
              </span>
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Compare throughput, router latency, token consumption, and type safety across Jev, Pure LLM, and Hybrid architectures.
          </p>
        </div>

        {/* 3 Interactive Mode Switcher Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 self-start lg:self-auto bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            disabled={isLoading || currentMode === "hybrid"}
            onClick={() => onSwitchModeAndRerun("hybrid")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
              currentMode === "hybrid"
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🚀 Hybrid</span>
          </button>
          <button
            disabled={isLoading || currentMode === "jev"}
            onClick={() => onSwitchModeAndRerun("jev")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
              currentMode === "jev"
                ? "bg-indigo-600 text-white shadow-md border border-indigo-500"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>⚡ Jev Mode</span>
          </button>
          <button
            disabled={isLoading || currentMode === "pure_llm"}
            onClick={() => onSwitchModeAndRerun("pure_llm")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
              currentMode === "pure_llm"
                ? "bg-slate-800 text-indigo-300 shadow-md border border-slate-700"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🤖 Pure LLM</span>
          </button>
        </div>
      </div>

      {/* 3 Side-by-Side Architectural Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        
        {/* CARD 1: HYBRID MODE */}
        <div className={`p-4 rounded-xl border transition-all ${
          currentMode === "hybrid"
            ? "bg-purple-950/30 border-purple-600/60 shadow-lg ring-1 ring-purple-500/40"
            : "bg-slate-900/40 border-slate-800 opacity-80"
        }`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-600/20 text-purple-300 border border-purple-500/30">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-white flex items-center gap-1">
                  Hybrid System 1 & 2
                  {currentMode === "hybrid" && (
                    <span className="px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 text-[9px] font-mono border border-emerald-800 font-semibold">
                      ACTIVE
                    </span>
                  )}
                </h4>
                <p className="text-[10px] text-purple-300/80 font-mono">Jev Speed + Deep LLM Synthesis</p>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-400 font-mono">{formatDuration(jevTimeMs)}</span>
          </div>

          <div className="space-y-1.5 text-[11px] text-slate-300">
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Router Latency</span>
              <strong className="text-emerald-400 font-mono">{formatDuration(jevTimeMs)} ({Math.round(jevTimeMs)}ms)</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Router Tokens</span>
              <strong className="text-emerald-400 font-mono">0 Tokens</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Tool Ecosystem</span>
              <strong className="text-indigo-300">MCP v2 Live APIs</strong>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Reliability</span>
              <strong className="text-purple-300">100% Typed Decisions</strong>
            </div>
          </div>
        </div>

        {/* CARD 2: PURE JEV MODE */}
        <div className={`p-4 rounded-xl border transition-all ${
          currentMode === "jev"
            ? "bg-indigo-950/40 border-indigo-500/60 shadow-lg ring-1 ring-indigo-500/40"
            : "bg-slate-900/40 border-slate-800 opacity-80"
        }`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-white flex items-center gap-1">
                  TypeSafe Jev Mode
                  {currentMode === "jev" && (
                    <span className="px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 text-[9px] font-mono border border-emerald-800 font-semibold">
                      ACTIVE
                    </span>
                  )}
                </h4>
                <p className="text-[10px] text-indigo-300/80 font-mono">Pure System 1 Decision Model</p>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-400 font-mono">{formatDuration(jevTimeMs)}</span>
          </div>

          <div className="space-y-1.5 text-[11px] text-slate-300">
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Decision Engine</span>
              <strong className="text-indigo-300">Noul / Choice / Score</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Budget Rubric</span>
              <strong className="text-emerald-400">Probability Math (0..2)</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">JSON Parse Risk</span>
              <strong className="text-emerald-400 font-mono">0% (No LLM prompt parsing)</strong>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Speedup</span>
              <strong className="text-yellow-400 font-mono">~12.2× Faster</strong>
            </div>
          </div>
        </div>

        {/* CARD 3: PURE LLM MODE */}
        <div className={`p-4 rounded-xl border transition-all ${
          currentMode === "pure_llm"
            ? "bg-slate-900 border-indigo-500/60 shadow-lg ring-1 ring-indigo-500/40"
            : "bg-slate-900/40 border-slate-800 opacity-80"
        }`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-white flex items-center gap-1">
                  Pure LLM Mode
                  {currentMode === "pure_llm" && (
                    <span className="px-1 py-0.2 rounded bg-amber-950 text-amber-300 text-[9px] font-mono border border-amber-800 font-semibold">
                      ACTIVE
                    </span>
                  )}
                </h4>
                <p className="text-[10px] text-slate-400 font-mono">Prompt & Parse JSON Loops</p>
              </div>
            </div>
            <span className="text-xs font-bold text-amber-400 font-mono">{formatDuration(llmRouterTimeMs)}</span>
          </div>

          <div className="space-y-1.5 text-[11px] text-slate-300">
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Router Latency</span>
              <strong className="text-amber-400 font-mono">{formatDuration(llmRouterTimeMs)} ({Math.round(llmRouterTimeMs)}ms)</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Router Tokens</span>
              <strong className="text-amber-400 font-mono">~750 tokens / call</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Output Safety</span>
              <strong className="text-rose-400">Brittle JSON Parsing</strong>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Budget Rubric</span>
              <strong className="text-slate-400">Text-based estimate</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Latency Speedometer Visualizer Bar */}
      <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-2 text-xs">
        <div className="flex items-center justify-between text-slate-300 font-medium">
          <span className="flex items-center gap-1.5">
            <Gauge className="h-4 w-4 text-indigo-400" />
            Router Execution Latency Benchmark
          </span>
          <span className="text-[11px] text-emerald-400 font-mono">
            TypeSafe Jev is ~{(llmRouterTimeMs / Math.max(1, jevTimeMs)).toFixed(1)}x faster
          </span>
        </div>

        {/* Jev Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>⚡ TypeSafe Jev Router</span>
            <span className="font-mono text-emerald-400 font-bold">{formatDuration(jevTimeMs)} ({Math.round(jevTimeMs)}ms) · 0 tokens</span>
          </div>
          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.max(6, Math.min(100, (jevTimeMs / llmRouterTimeMs) * 100))}%` }}
            />
          </div>
        </div>

        {/* Pure LLM Bar */}
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>🤖 Pure LLM Prompt-and-Parse Router</span>
            <span className="font-mono text-amber-400 font-bold">{formatDuration(llmRouterTimeMs)} ({Math.round(llmRouterTimeMs)}ms) · ~750 tokens</span>
          </div>
          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-700"
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
