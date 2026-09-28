import { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { TripInput } from "./components/TripInput";
import { AgentProgressTimeline } from "./components/AgentProgressTimeline";
import { JevDecisionCard } from "./components/JevDecisionCard";
import { BenchmarkComparisonCard } from "./components/BenchmarkComparisonCard";
import { HitlReviewCard } from "./components/HitlReviewCard";
import { SpecialistResultsView } from "./components/SpecialistResultsView";
import { ItineraryViewer } from "./components/ItineraryViewer";
import { PlanHistorySidebar } from "./components/PlanHistorySidebar";
import type { TripPlanResponse, PlanHistoryItem } from "./types";
import { checkBackendHealth, createTripPlan, resumeTripPlan, getPlanHistory, getPlanDetails } from "./api";
import { AlertCircle, ShieldAlert } from "lucide-react";

export function App() {
  const [backendHealth, setBackendHealth] = useState<{ status: string; database?: string; jev_ready?: boolean }>({ status: "checking" });
  const [currentPlan, setCurrentPlan] = useState<TripPlanResponse | null>(null);
  const [useJev, setUseJev] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPlans, setHistoryPlans] = useState<PlanHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Check health and load initial history on mount
  useEffect(() => {
    async function init() {
      const health = await checkBackendHealth();
      setBackendHealth(health);
      loadHistory();
    }
    init();
  }, []);

  const loadHistory = async () => {
    setIsHistoryLoading(true);
    const plans = await getPlanHistory();
    setHistoryPlans(plans);
    setIsHistoryLoading(false);
  };

  const handleCreatePlan = async (query: string, origin: string, withJev: boolean = useJev) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await createTripPlan(query, origin, undefined, withJev);
      setCurrentPlan(result);
      loadHistory();
    } catch (err: any) {
      setError(err.message || "Failed to create trip plan. Please ensure the backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResumePlan = async (approved: boolean, feedback: string) => {
    if (!currentPlan?.thread_id) return;
    setIsResuming(true);
    setError(null);
    try {
      const result = await resumeTripPlan(currentPlan.thread_id, approved, feedback);
      setCurrentPlan(result);
      loadHistory();
    } catch (err: any) {
      setError(err.message || "Failed to resume trip plan.");
    } finally {
      setIsResuming(false);
    }
  };

  const handleSelectPlan = async (threadId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const plan = await getPlanDetails(threadId);
      setCurrentPlan(plan);
      if (typeof plan.use_jev === "boolean") {
        setUseJev(plan.use_jev);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load selected plan.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewPlan = () => {
    setCurrentPlan(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isGuardrailBlocked = currentPlan && currentPlan.guardrail_allowed === false;

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top App Header */}
      <Header
        backendHealth={backendHealth}
        onNewPlan={handleNewPlan}
        onToggleHistory={() => {
          setHistoryOpen(!historyOpen);
          if (!historyOpen) loadHistory();
        }}
        historyOpen={historyOpen}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        
        {/* Error Alert Banner */}
        {error && (
          <div className="w-full p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-start gap-3 animate-fade-in">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1 text-xs sm:text-sm">
              <strong className="font-semibold">Execution Error:</strong> {error}
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs text-rose-400 hover:text-white underline ml-auto"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Input Prompt Card with Architecture Mode Selector */}
        <TripInput
          onSubmit={handleCreatePlan}
          isLoading={isLoading}
          useJev={useJev}
          setUseJev={setUseJev}
        />

        {/* Guardrail Rejection Notice (if blocked by TypeSafe Jev) */}
        {isGuardrailBlocked && (
          <div className="w-full p-5 rounded-2xl bg-rose-950/30 border border-rose-800/50 shadow-xl flex items-start gap-4 animate-slide-up">
            <div className="p-3 rounded-xl bg-rose-900/50 border border-rose-700/60 text-rose-300 shrink-0">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-rose-200">
                Request Filtered by TypeSafe Jev Guardrail
              </h3>
              <p className="text-xs sm:text-sm text-rose-300/80 leading-relaxed">
                {currentPlan.guardrail_reason || currentPlan.final_response || "TripMate AI can only assist with travel, flight, hotel, weather, destination, and itinerary planning queries."}
              </p>
              <p className="text-[11px] text-slate-400 mt-2 font-mono">
                Jev Guardrail probability was below the minimum 0.35 threshold. LLM token expenditure was successfully avoided.
              </p>
            </div>
          </div>
        )}

        {/* Live Architecture Benchmark Comparison Card */}
        {currentPlan && (
          <BenchmarkComparisonCard
            plan={currentPlan}
            onSwitchModeAndRerun={(newMode) => {
              setUseJev(newMode);
              handleCreatePlan(currentPlan.user_query || "", currentPlan.trip_constraints?.origin || "DAC", newMode);
            }}
            isLoading={isLoading}
          />
        )}

        {/* Step-by-Step Multi-Agent Pipeline Timeline */}
        {(currentPlan || isLoading) && (
          <AgentProgressTimeline plan={currentPlan} isLoading={isLoading} />
        )}

        {/* TypeSafe Jev Calibrated Intelligence Card (shown when Jev was utilized) */}
        {currentPlan && !isGuardrailBlocked && currentPlan.use_jev !== false && (
          <JevDecisionCard plan={currentPlan} />
        )}

        {/* Human-in-the-Loop Review Callout */}
        {currentPlan?.requires_approval && (
          <HitlReviewCard
            draftItinerary={currentPlan.itinerary}
            approvalRequest={currentPlan.approval_request}
            onResume={handleResumePlan}
            isResuming={isResuming}
          />
        )}

        {/* Specialist Findings Tabs (Flights, Hotels, Weather, Budget) */}
        {currentPlan && !isGuardrailBlocked && (
          <SpecialistResultsView plan={currentPlan} />
        )}

        {/* Finalized Itinerary Viewer */}
        {currentPlan && !isGuardrailBlocked && (
          <ItineraryViewer plan={currentPlan} />
        )}
      </main>

      {/* Plan History Slide-Over Drawer */}
      <PlanHistorySidebar
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        plans={historyPlans}
        selectedThreadId={currentPlan?.thread_id}
        onSelectPlan={handleSelectPlan}
        isLoading={isHistoryLoading}
      />

      {/* App Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Built with <strong>LangGraph</strong>, <strong>TypeSafe Jev</strong>, <strong>Groq LLM</strong> & <strong>Model Context Protocol (MCP v2)</strong>
          </div>
          <div className="text-slate-600 font-mono text-[11px]">
            TripMate AI · Enterprise Multi-Agent Travel Planner
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
