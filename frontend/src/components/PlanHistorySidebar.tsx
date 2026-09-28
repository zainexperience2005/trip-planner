import type { FC } from "react";
import { X, History, MapPin, Calendar, ChevronRight } from "lucide-react";
import type { PlanHistoryItem } from "../types";
import { formatDate } from "../lib/utils";

interface PlanHistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  plans: PlanHistoryItem[];
  selectedThreadId?: string;
  onSelectPlan: (threadId: string) => void;
  isLoading: boolean;
}

export const PlanHistorySidebar: FC<PlanHistorySidebarProps> = ({
  isOpen,
  onClose,
  plans,
  selectedThreadId,
  onSelectPlan,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md h-full bg-slate-950 border-l border-slate-800 shadow-2xl p-5 sm:p-6 flex flex-col justify-between animate-slide-up">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white">Trip Planning History</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-slate-400 mt-2 mb-4">
            Recent travel queries saved with PostgreSQL / Memory checkpointer state.
          </p>

          {/* List of Plans */}
          <div className="space-y-2.5 overflow-y-auto max-h-[calc(100vh-160px)] pr-1">
            {isLoading ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <div className="h-5 w-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-2" />
                Loading history...
              </div>
            ) : plans.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No past plans yet. Create your first itinerary!
              </div>
            ) : (
              plans.map((p) => {
                const isSelected = selectedThreadId === p.thread_id;
                const isBlocked = p.guardrail_allowed === false;

                return (
                  <button
                    key={p.id || p.thread_id}
                    onClick={() => {
                      onSelectPlan(p.thread_id);
                      onClose();
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between group ${
                      isSelected
                        ? "bg-indigo-950/40 border-indigo-500/50 shadow-md shadow-indigo-500/10"
                        : "bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 group-hover:text-indigo-300 transition-colors truncate">
                        <MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                        <span className="truncate">{p.destination || "Custom Trip"}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-1">
                        {p.user_query}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(p.created_at)}
                        </span>
                        {isBlocked ? (
                          <span className="px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800/40">
                            Blocked
                          </span>
                        ) : p.requires_approval ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/40">
                            Review Needed
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/40">
                            Completed
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 text-center">
          TripMate AI Multi-Agent Checkpointer
        </div>
      </div>
    </div>
  );
};
