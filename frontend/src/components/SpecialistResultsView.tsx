import { useState, type FC } from "react";
import { Plane, Building2, CloudSun, DollarSign, Sparkles, Info } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TripPlanResponse } from "../types";

interface SpecialistResultsViewProps {
  plan: TripPlanResponse;
}

type TabType = "flights" | "hotels" | "weather" | "budget";

export const SpecialistResultsView: FC<SpecialistResultsViewProps> = ({ plan }) => {
  const [activeTab, setActiveTab] = useState<TabType>("flights");

  const tabs = [
    {
      id: "flights" as TabType,
      name: "Flight Logistics",
      icon: <Plane className="h-4 w-4" />,
      content: plan.flight_results,
      color: "text-sky-400 border-sky-500",
      activeBg: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    },
    {
      id: "hotels" as TabType,
      name: "Curated Hotels",
      icon: <Building2 className="h-4 w-4" />,
      content: plan.hotel_results,
      color: "text-amber-400 border-amber-500",
      activeBg: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    },
    {
      id: "weather" as TabType,
      name: "Weather & Forecast",
      icon: <CloudSun className="h-4 w-4" />,
      content: plan.weather_results,
      color: "text-emerald-400 border-emerald-500",
      activeBg: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    },
    {
      id: "budget" as TabType,
      name: "Budget & Pricing",
      icon: <DollarSign className="h-4 w-4" />,
      content: plan.budget_results,
      color: "text-purple-400 border-purple-500",
      activeBg: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    },
  ];

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];

  return (
    <div className="w-full glass-panel rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
      {/* Tab Navigation Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 pt-3 bg-slate-950/60 overflow-x-auto">
        <div className="flex items-center gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const hasData = Boolean(tab.content);

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl border-t border-x transition-all shrink-0 ${
                  isActive
                    ? `${tab.activeBg} border-b-2 border-b-indigo-500`
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                }`}
              >
                {tab.icon}
                <span>{tab.name}</span>
                {hasData && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 font-mono pr-2">
          <Sparkles className="h-3 w-3 text-indigo-400" />
          Specialist MCP Findings
        </div>
      </div>

      {/* Tab Content Panel */}
      <div className="p-5 sm:p-6 bg-slate-900/40 min-h-[220px]">
        {currentTab.content ? (
          <div className="markdown-content text-sm text-slate-300 leading-relaxed max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {currentTab.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center text-slate-500">
            <Info className="h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium">No specialist data available for {currentTab.name}.</p>
            <p className="text-xs text-slate-600 mt-1">This agent may have been skipped dynamically by TypeSafe Jev routing.</p>
          </div>
        )}
      </div>
    </div>
  );
};
