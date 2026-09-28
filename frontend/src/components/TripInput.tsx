import { useState, type FC, type FormEvent, type KeyboardEvent } from "react";
import { Send, Sparkles, Plane, Compass, AlertCircle } from "lucide-react";

interface TripInputProps {
  onSubmit: (query: string, origin: string, useJev: boolean) => void;
  isLoading: boolean;
  useJev: boolean;
  setUseJev: (val: boolean) => void;
}

interface InspirationIdea {
  title: string;
  category: "Complex Multi-City" | "Adventure & Nature" | "Culture & Food" | "Luxury & Wellness" | "Budget & Nomad";
  badge: string;
  origin?: string;
  query: string;
}

const PRESET_PROMPTS: InspirationIdea[] = [
  // Complex Multi-City
  {
    title: "🚅 Tokyo-Hakone-Kyoto-Osaka Golden Route",
    category: "Complex Multi-City",
    badge: "10 Days · Multi-City",
    origin: "DAC",
    query: "Plan a 10-day multi-city journey across Tokyo, Hakone, Kyoto, and Osaka using the Shinkansen bullet train. Include teamLab digital art, traditional ryokan with onsen, Fushimi Inari shrine at dawn, and Dotonbori street food with a moderate budget.",
  },
  {
    title: "🏰 Central Europe Heritage (Prague, Vienna, Budapest)",
    category: "Complex Multi-City",
    badge: "9 Days · 3 Countries",
    origin: "LHR",
    query: "9-day multi-country historic rail tour covering Prague, Vienna, and Budapest. Include Prague Old Town, Vienna State Opera classical concert, and Budapest Széchenyi thermal baths with mid-range boutique hotels under $180/day.",
  },
  {
    title: "🦁 Serengeti Safari & Zanzibar Beach Retreat",
    category: "Complex Multi-City",
    badge: "8 Days · Safari + Coast",
    origin: "DXB",
    query: "8-day combination adventure: 4 days big-five game drives in Serengeti & Ngorongoro Crater followed by 4 days relaxing beach stay in Stone Town & Nungwi, Zanzibar with a total budget around $4,000.",
  },

  // Adventure & Nature
  {
    title: "🌌 Iceland Ring Road & Aurora Chasing",
    category: "Adventure & Nature",
    badge: "7 Days · Winter Expedition",
    origin: "JFK",
    query: "7-day winter road trip along Iceland's Ring Road to chase the Northern Lights, explore Vatnajökull blue ice caves, Diamond Beach, and geothermal lagoons with 4x4 camper logistics and weather safety plans.",
  },
  {
    title: "🏔️ Swiss Alps Hiking & Scenic Trains",
    category: "Adventure & Nature",
    badge: "5 Days · Alpine Adventure",
    origin: "FRA",
    query: "5-day alpine adventure in Interlaken, Grindelwald, and Zermatt with scenic Jungfraujoch cogwheel trains, Matterhorn hiking trails, and cliff-walk viewpoints on a moderate budget.",
  },
  {
    title: "🧗 Patagonia Glaciers & Fitz Roy Trekking",
    category: "Adventure & Nature",
    badge: "8 Days · Extreme Trek",
    origin: "EZE",
    query: "8-day trekking expedition in Torres del Paine (Chile) and El Chaltén (Argentina) covering Laguna de los Tres, Perito Moreno glacier walks, and weather-resilient packing plans under $2,200.",
  },

  // Culture & Food
  {
    title: "🍣 Kyoto & Osaka Gastronomy & Culture",
    category: "Culture & Food",
    badge: "6 Days · Culinary & Temples",
    origin: "SIN",
    query: "6-day immersive culinary and cultural tour of Kyoto and Osaka featuring tea ceremonies in Uji, morning Tsukiji/Kuromon market tastings, Gion geisha districts, and Arashiyama bamboo forest.",
  },
  {
    title: "🕌 Istanbul & Cappadocia Cave Journey",
    category: "Culture & Food",
    badge: "7 Days · Bazaars & Hot Air Balloons",
    origin: "DAC",
    query: "7-day cultural immersion in Istanbul (Hagia Sophia, Grand Bazaar, Bosphorus sunset cruise) and Cappadocia (hot air balloon sunrise ride, Goreme cave hotel, underground city) on a $1,400 budget.",
  },

  // Luxury & Wellness
  {
    title: "🍷 Tuscany Vineyards & Amalfi Luxury Coast",
    category: "Luxury & Wellness",
    badge: "6 Days · 5-Star Luxury",
    origin: "FCO",
    query: "Luxury 6-day holiday featuring Chianti private vineyard wine tastings, Florence Renaissance private tours, and cliffside 5-star boutique hotels in Positano with private chauffeur transfers.",
  },
  {
    title: "🏝️ Maldives Overwater Villa & Coral Diving",
    category: "Luxury & Wellness",
    badge: "5 Days · Luxury Island",
    origin: "MLE",
    query: "5-day romantic luxury getaway in an all-inclusive Maldives overwater bungalow with private plunge pool, manta ray snorkeling, sunset dolphin cruise, and spa treatments.",
  },

  // Budget & Nomad
  {
    title: "🎒 Southeast Asia Island Hopper (Thailand)",
    category: "Budget & Nomad",
    badge: "12 Days · Under $50/day",
    origin: "BKK",
    query: "12-day budget backpacking trip through Bangkok, Chiang Mai, and Koh Samui under $45/day. Include night sleeper trains, street food night markets, ethical elephant sanctuary, and hostel dorms.",
  },
  {
    title: "💻 Lisbon & Madeira Nomad Workcation",
    category: "Budget & Nomad",
    badge: "14 Days · Remote Work",
    origin: "LIS",
    query: "14-day digital nomad workcation in Lisbon and Madeira Island with high-speed coworking cafes, evening sunset viewpoints, weekend surf lessons, and scenic levada hikes.",
  },
];

export const TripInput: FC<TripInputProps> = ({ onSubmit, isLoading, useJev, setUseJev }) => {
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("DAC");
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = ["All", "Complex Multi-City", "Adventure & Nature", "Culture & Food", "Luxury & Wellness", "Budget & Nomad"] as const;

  const filteredPresets = selectedCategory === "All"
    ? PRESET_PROMPTS
    : PRESET_PROMPTS.filter((p) => p.category === selectedCategory);

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

  const handleSelectPreset = (preset: InspirationIdea) => {
    setQuery(preset.query);
    if (preset.origin) {
      setOrigin(preset.origin);
    }
    if (error) setError("");
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

        {/* Quick Inspiration & Complex Ideas Section */}
        <div className="pt-2 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-indigo-400" />
              Quick Inspiration & Complex Ideas ({filteredPresets.length})
            </p>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-all whitespace-nowrap ${
                    selectedCategory === cat
                      ? "bg-indigo-500/20 text-indigo-200 border-indigo-500/50 shadow-sm"
                      : "bg-slate-900/50 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Inspiration Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {filteredPresets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isLoading}
                onClick={() => handleSelectPreset(preset)}
                className="text-left p-3 rounded-xl bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/40 text-xs transition-all group flex flex-col justify-between hover:shadow-lg hover:shadow-indigo-950/40"
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
                      {preset.badge}
                    </span>
                    {preset.origin && (
                      <span className="text-[10px] font-mono text-slate-400">
                        {preset.origin} ✈️
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors line-clamp-1">
                    {preset.title}
                  </div>
                  <div className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                    {preset.query}
                  </div>
                </div>
                <div className="mt-2 text-[10px] font-medium text-indigo-400/70 group-hover:text-indigo-300 flex items-center gap-1">
                  <span>Use prompt</span>
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
};
