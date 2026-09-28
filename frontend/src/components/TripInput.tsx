import { useState, type FC, type FormEvent, type KeyboardEvent } from "react";
import { Send, Sparkles, Plane, Compass, AlertCircle } from "lucide-react";

interface TripInputProps {
  onSubmit: (query: string, origin: string, useJev: boolean) => void;
  isLoading: boolean;
  useJev: boolean;
  setUseJev: (val: boolean) => void;
}

const PRESET_PROMPTS = [
  {
    title: "🌸 Kyoto Cultural Explorer",
    query: "Plan a 5-day cultural and historical trip to Kyoto, Japan on a moderate budget with tea ceremonies, traditional shrines, and local dining.",
  },
  {
    title: "🏔️ Swiss Alps Adventure",
    query: "I want an adventurous 4-day hiking and mountain train trip to Interlaken and Zermatt, Switzerland with scenic viewpoints.",
  },
  {
    title: "🏖️ Bali Budget Vacation",
    query: "Budget-friendly 7-day tropical trip to Bali, Indonesia with affordable surf hostels, beach cafes, and scooter routes under $70/day.",
  },
  {
    title: "🏛️ Rome & Amalfi Luxury",
    query: "Luxury 6-day holiday to Rome and Amalfi Coast featuring 5-star boutique hotels, private transfers, and fine dining.",
  },
];

export const TripInput: FC<TripInputProps> = ({ onSubmit, isLoading, useJev, setUseJev }) => {
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("DAC");
  const [error, setError] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setError("Please describe your travel destination or dream vacation.");
      return;
    }
    setError("");
    onSubmit(query.trim(), origin.trim() || "DAC", useJev);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="w-full glass-panel rounded-2xl p-5 sm:p-7 border border-slate-800 shadow-2xl relative overflow-hidden">
      {/* Background Accent Gradient Glows */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <form onSubmit={handleSubmit} className="relative z-10 space-y-4">
        {/* Header Controls: Label, Architecture Mode Selector, Airport Origin */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <label htmlFor="travel-query" className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            Where would you like to travel?
          </label>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Architecture Mode Selector Toggle */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setUseJev(true)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  useJev
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/20"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Use TypeSafe Jev System 1 for ~180ms routing & 0 token guardrail"
              >
                <span>⚡ TypeSafe Jev (Fast)</span>
              </button>
              <button
                type="button"
                onClick={() => setUseJev(false)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  !useJev
                    ? "bg-slate-800 text-indigo-300 shadow-md border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Use traditional Groq Prompt & Parse JSON Router for comparison"
              >
                <span>🤖 Pure LLM Mode</span>
              </button>
            </div>

            {/* Airport Origin */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
              <span className="flex items-center gap-1">
                <Plane className="h-3.5 w-3.5 text-slate-400" /> Origin:
              </span>
              <input
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                placeholder="DAC"
                maxLength={4}
                className="w-14 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded font-mono text-center text-xs font-semibold text-indigo-300 focus:ring-1 focus:ring-indigo-500 outline-none uppercase"
              />
            </div>
          </div>
        </div>

        {/* Query Input Area */}
        <div className="relative">
          <textarea
            id="travel-query"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe your destination, trip duration, budget, travel style, and must-see activities (e.g., 'Plan a 5-day family trip to Tokyo with Disney and sushi spots under $200/day')..."
            rows={3}
            disabled={isLoading}
            className="w-full px-4 py-3.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder:text-slate-500 text-sm sm:text-base focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none transition-all disabled:opacity-60"
          />

          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 font-mono text-[10px]">Ctrl+Enter</kbd>
            </span>
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Planning Trip...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Generate Itinerary</span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-950/30 border border-rose-900/40 px-3 py-2 rounded-lg animate-fade-in">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Inspiration Chips */}
        <div className="pt-2">
          <p className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5 text-indigo-400" />
            Quick Inspiration Ideas:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {PRESET_PROMPTS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setQuery(preset.query);
                  if (error) setError("");
                }}
                className="text-left px-3 py-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/30 text-xs text-slate-300 hover:text-white transition-all group"
              >
                <div className="font-semibold text-indigo-300 group-hover:text-indigo-200 truncate">
                  {preset.title}
                </div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                  {preset.query}
                </div>
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
};
