import { useState, type FC, type FormEvent } from "react";
import { UserCheck, CheckCircle2, RotateCcw, MessageSquare } from "lucide-react";
import confetti from "canvas-confetti";

interface HitlReviewCardProps {
  draftItinerary?: string;
  approvalRequest?: string;
  onResume: (approved: boolean, feedback: string) => void;
  isResuming: boolean;
}

export const HitlReviewCard: FC<HitlReviewCardProps> = ({
  approvalRequest,
  onResume,
  isResuming,
}) => {
  const [feedback, setFeedback] = useState("");
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);

  const handleApprove = () => {
    // Trigger confetti animation for delightful human approval feedback
    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch {
      // ignore
    }
    onResume(true, "");
  };

  const handleRequestRevision = (e: FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    onResume(false, feedback.trim());
  };

  return (
    <div className="w-full glass-panel rounded-2xl p-5 sm:p-6 border-2 border-amber-500/50 bg-gradient-to-b from-amber-950/20 via-slate-900/60 to-slate-950/80 shadow-2xl relative animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-amber-500/20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
            <UserCheck className="h-6 w-6 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-white">
                Human-in-the-Loop Review Required
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold animate-pulse">
                Paused at interrupt()
              </span>
            </div>
            <p className="text-xs text-amber-200/70">
              {approvalRequest || "Please review the draft travel itinerary. You can approve it as is or request modifications."}
            </p>
          </div>
        </div>
      </div>

      {/* Action Decision Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
        <button
          type="button"
          disabled={isResuming}
          onClick={handleApprove}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition-all active:scale-95 disabled:opacity-50"
        >
          {isResuming ? (
            <>
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Finalizing Guide...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5" />
              <span>Approve & Finalize Plan</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={isResuming}
          onClick={() => setShowFeedbackInput(!showFeedbackInput)}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 hover:text-amber-200 font-semibold text-sm transition-all"
        >
          <RotateCcw className="h-4 w-4" />
          <span>{showFeedbackInput ? "Cancel Changes" : "Request Revisions"}</span>
        </button>
      </div>

      {/* Revision Feedback Input Drawer */}
      {showFeedbackInput && (
        <form onSubmit={handleRequestRevision} className="mt-4 pt-4 border-t border-slate-800 space-y-3 animate-fade-in">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
            What changes or preferences would you like to update?
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. 'Please replace day 3 hiking with a museum tour and add more local ramen recommendations'..."
            rows={2}
            disabled={isResuming}
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-amber-500/30 rounded-xl text-slate-100 placeholder:text-slate-500 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 outline-none resize-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isResuming || !feedback.trim()}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md shadow-amber-600/30 transition-all disabled:opacity-50"
            >
              Submit Revisions to Pipeline
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
