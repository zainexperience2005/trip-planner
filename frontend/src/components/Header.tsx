import type { FC } from "react";
import { Compass, Sparkles, Database, Zap, History, Plus } from "lucide-react";

interface HeaderProps {
  backendHealth: { status: string; database?: string; jev_ready?: boolean };
  onNewPlan: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
}

export const Header: FC<HeaderProps> = ({
  backendHealth,
  onNewPlan,
  onToggleHistory,
  historyOpen,
}) => {
  const isOnline = backendHealth.status === "healthy" || backendHealth.status === "ok";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-4 lg:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Compass className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                TripMate <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">AI</span>
              </h1>
              <span className="px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                v2.0
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Multi-Agent Travel Concierge · TypeSafe Jev & Groq Pipeline
            </p>
          </div>
        </div>

        {/* System Badges & Telemetry */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          {/* Jev System One Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-950/50 border border-purple-800/40 text-purple-300">
            <Zap className="h-3.5 w-3.5 text-purple-400" />
            <span>TypeSafe Jev <strong className="text-purple-200">System 1</strong></span>
          </div>

          {/* Groq Generative Model Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-950/50 border border-indigo-800/40 text-indigo-300">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>Groq LLM</span>
          </div>

          {/* Database Checkpointer Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
            <Database className="h-3.5 w-3.5 text-emerald-400" />
            <span>{backendHealth.database === "postgres" ? "PostgreSQL" : "Checkpointer"}</span>
          </div>

          {/* Live Health Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
            <div className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
            <span className="text-[11px]">{isOnline ? "Live API" : "Connecting..."}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleHistory}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              historyOpen
                ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300"
                : "bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Trip History</span>
          </button>

          <button
            onClick={onNewPlan}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-md shadow-indigo-600/25 transition-all active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Plan</span>
          </button>
        </div>
      </div>
    </header>
  );
};
