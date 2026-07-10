import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import Globe from "../components/Globe";
import QuizCard from "../components/QuizCard";
import { getQuizQuestion, getCountries, getQuizCountries, getGeoFeatures } from "../lib/api";

const MAIN_CATEGORIES = [
  { id: "capitals", emoji: "", name: "Capitals" },
  { id: "countries", emoji: "", name: "Countries" },
  { id: "flags", emoji: "", name: "Flags" },
  { id: "seas", emoji: "", name: "Seas & Oceans" },
  { id: "mountains", emoji: "", name: "Mountain Ranges" },
];

const REGION_CATEGORIES = [
  { id: "asia", emoji: "", name: "Asia" },
  { id: "europe", emoji: "", name: "Europe" },
  { id: "africa", emoji: "", name: "Africa" },
  { id: "oceania", emoji: "", name: "Oceania" },
  { id: "north_america", emoji: "", name: "North America" },
  { id: "south_america", emoji: "", name: "South America" },
  { id: "world", emoji: "", name: "World" },
];

const CONTINENT_MAP = {
  asia: "Asia",
  europe: "Europe",
  africa: "Africa",
  oceania: "Oceania",
  north_america: "North America",
  south_america: "South America",
};

export default function Quiz() {
  const [screen, setScreen] = useState(1); // 1: Category, 2: Region, 3: Quiz
  const [showUI, setShowUI] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(440);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const resize = useCallback(
    (e) => {
      if (isResizing) {
        setSidebarWidth(Math.min(Math.max(e.clientX, 300), 800));
      }
    },
    [isResizing]
  );

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const [category, setCategory] = useState(null);
  const [region, setRegion] = useState(null);
  
  // Score state
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Quiz state (for Flags, Capitals, Seas, Mountains)
  const [question, setQuestion] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [answerCorrect, setAnswerCorrect] = useState(false);
  
  // Countries mode state
  const [regionCountries, setRegionCountries] = useState([]);
  const [namedCountries, setNamedCountries] = useState([]); // array of isoNum strings
  const [countryInput, setCountryInput] = useState("");
  const [giveUp, setGiveUp] = useState(false);
  const [askedQuestions, setAskedQuestions] = useState([]); // array of strings to exclude

  // Focus and Highlight for Globe
  const focusRegion = region || "world";
  const [globeHighlights, setGlobeHighlights] = useState([]);
  const [capitalMarker, setCapitalMarker] = useState(null);
  const [locationMarker, setLocationMarker] = useState(null);
  const [geoMarkers, setGeoMarkers] = useState([]);
  const [flyTo, setFlyTo] = useState(null);
  const [allCountries, setAllCountries] = useState([]);

  // Fetch all countries on mount for Globe
  useEffect(() => {
    getCountries().then(setAllCountries).catch(console.error);
  }, []);

  /* ─── Navigation ─── */
  function handleSelectCategory(catId) {
    setCategory(catId);
    if (["capitals", "countries", "flags"].includes(catId)) {
      setScreen(2); // needs region
    } else {
      setRegion("world"); // default for seas/mountains
      startQuiz(catId, "world");
    }
  }

  function handleSelectRegion(regId) {
    setRegion(regId);
    startQuiz(category, regId);
  }

  function handleBack() {
    if (screen === 2) {
      setScreen(1);
      setCategory(null);
    } else if (screen === 3) {
      setScreen(1);
      setCategory(null);
      setRegion(null);
      resetQuizState();
    }
  }

  function resetQuizState() {
    setCorrect(0);
    setTotal(0);
    setQuestion(null);
    setAnswered(false);
    setAnswerCorrect(false);
    setGlobeHighlights([]);
    setCapitalMarker(null);
    setLocationMarker(null);
    setGeoMarkers([]);
    setFlyTo(null);
    setRegionCountries([]);
    setNamedCountries([]);
    setGiveUp(false);
    setCountryInput("");
    setAskedQuestions([]);
  }

  /* ─── Fetching / Question Generation ─── */
  async function startQuiz(catId, regId) {
    setScreen(3);
    resetQuizState();
    
    if (catId === "countries") {
      try {
        // Use the new quiz countries endpoint
        const continentKey = CONTINENT_MAP[regId] || null;
        let data;
        if (continentKey) {
          data = await getQuizCountries(continentKey);
        } else {
          // World mode: flatten all continents
          const allData = await getQuizCountries();
          data = Object.values(allData).flat();
        }
        setRegionCountries(data);
      } catch (err) {
        console.error("Failed to load countries:", err);
        // Fallback to old API
        const fallback = await getCountries();
        const continentLabel = CONTINENT_MAP[regId];
        const filtered = continentLabel ? fallback.filter(c => c.continent === continentLabel) : fallback;
        setRegionCountries(filtered);
      }
    } else {
      loadNextQuestion(catId, regId);
    }
  }

  async function loadNextQuestion(catId, regId) {
    setQuestion(null);
    setAnswered(false);
    setAnswerCorrect(false);
    setGlobeHighlights([]);
    setCapitalMarker(null);
    setLocationMarker(null);
    setFlyTo(null);
    // Keep accumulated geoMarkers for seas/mountains so they build up on globe
    
    try {
      const data = await getQuizQuestion([], catId, "multiple_choice", regId, askedQuestions);
      setQuestion(data);

      if (catId === "capitals" && data.mapHighlight) {
        // Fly to country and highlight
        setFlyTo({ lat: data.mapHighlight.lat, lng: data.mapHighlight.lng });
      }
      
      // Pre-show marker for seas/mountains before answering
      if ((catId === "seas" || catId === "mountains") && data.mapHighlight) {
        setFlyTo({ lat: data.mapHighlight.lat, lng: data.mapHighlight.lng });
      }
    } catch (err) {
      console.error("Failed to load question:", err);
    }
  }

  /* ─── Handlers ─── */
  function handleAnswer(userAnswer) {
    if (answered || !question) return;
    setAnswered(true);
    setTotal((t) => t + 1);

    const isCorrect = userAnswer.toLowerCase() === question.answer.toLowerCase();
    setAnswerCorrect(isCorrect);
    if (isCorrect) setCorrect((c) => c + 1);
    setAskedQuestions(prev => [...prev, question.promptCountry || question.answer]);

    // Update Globe based on category
    if (category === "flags") {
      if (question.mapHighlight) {
        setFlyTo({ lat: question.mapHighlight.lat, lng: question.mapHighlight.lng });
      }
      // Try to find isoNum from allCountries
      const matchCountry = allCountries.find(c => c.name.toLowerCase() === question.answer.toLowerCase());
      if (matchCountry) {
        setGlobeHighlights([{
          isoNum: matchCountry.isoNum,
          color: isCorrect ? "#22c55e" : "#ef4444",
          country: question.answer,
          iso2: question.iso2,
          flag: question.flag,
        }]);
      }
    } else if (category === "capitals") {
      // Keep country highlighted, add capital marker
      const matchCountry = allCountries.find(c => c.name.toLowerCase() === (question.promptCountry || "").toLowerCase());
      if (matchCountry) {
        setGlobeHighlights([{ isoNum: matchCountry.isoNum, color: isCorrect ? "#22c55e" : "#ef4444" }]);
      }
      if (question.mapHighlight) {
        setCapitalMarker({
          lat: question.mapHighlight.lat,
          lng: question.mapHighlight.lng,
          name: question.answer
        });
        setFlyTo({ lat: question.mapHighlight.lat, lng: question.mapHighlight.lng });
      }
    } else if (category === "seas" || category === "mountains") {
      // Add to accumulated geoMarkers
      if (question.mapHighlight) {
        const markerType = question.mapHighlight.label?.toLowerCase().includes("ocean") ? "ocean" 
          : question.mapHighlight.label?.toLowerCase().includes("strait") || question.mapHighlight.label?.toLowerCase().includes("gulf") || question.mapHighlight.label?.toLowerCase().includes("bay") || question.mapHighlight.label?.toLowerCase().includes("channel") || question.mapHighlight.label?.toLowerCase().includes("passage") || question.mapHighlight.label?.toLowerCase().includes("bosphorus") ? "strait"
          : question.mapHighlight.label?.toLowerCase().includes("mount") || question.mapHighlight.label?.toLowerCase().includes("denali") || question.mapHighlight.label?.toLowerCase().includes("aconcagua") || question.mapHighlight.label?.toLowerCase().includes("k2") || question.mapHighlight.label?.toLowerCase().includes("kangchenjunga") || question.mapHighlight.label?.toLowerCase().includes("blanc") || question.mapHighlight.label?.toLowerCase().includes("vinson") || question.mapHighlight.label?.toLowerCase().includes("table") || question.mapHighlight.label?.toLowerCase().includes("puncak") || question.mapHighlight.label?.toLowerCase().includes("nevis") || question.mapHighlight.label?.toLowerCase().includes("logan") || question.mapHighlight.label?.toLowerCase().includes("fuji") || question.mapHighlight.label?.toLowerCase().includes("elbrus") ? "peak"
          : category === "mountains" ? "range"
          : "sea";

        const newMarker = {
          name: question.mapHighlight.label || question.answer,
          lat: question.mapHighlight.lat,
          lng: question.mapHighlight.lng,
          type: markerType,
          color: markerType === "peak" || markerType === "range" ? "#f97316" : "#3b82f6",
          correct: isCorrect,
        };

        setGeoMarkers(prev => {
          // Replace if same name already exists, otherwise add
          const existing = prev.filter(m => m.name !== newMarker.name);
          return [...existing, newMarker];
        });

        setFlyTo({ lat: question.mapHighlight.lat, lng: question.mapHighlight.lng });
      }
    }
  }

  /* ─── Countries Mode specific ─── */
  function handleCountryInputSubmit(e) {
    e.preventDefault();
    if (giveUp) return;
    const input = countryInput.trim().toLowerCase();
    
    // Find match
    const match = regionCountries.find(c => 
      c.name.toLowerCase() === input && !namedCountries.includes(String(c.isoNum))
    );

    if (match) {
      setNamedCountries(prev => [...prev, String(match.isoNum)]);
      setCorrect(c => c + 1);
      setTotal(c => c + 1);
      setCountryInput("");
      // Fly to the named country
      setFlyTo({ lat: match.countryLat || match.lat, lng: match.countryLng || match.lng });
    }
  }

  /* ─── Renderers ─── */
  function renderScreen() {
    if (screen === 1) {
      return (
        <div className="space-y-8">
          <h2 className="text-3xl font-sans font-bold tracking-tight text-slate-900 mb-6 text-center">Choose a Quiz Mode</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MAIN_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleSelectCategory(cat.id)}
                className="group rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition hover:border-blue-500 hover:bg-blue-50"
              >
                <h3 className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-blue-700">{cat.name}</h3>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (screen === 2) {
      return (
        <div className="space-y-8">
          <div className="flex items-center gap-4 mb-6">
            <button onClick={handleBack} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
              ← Back
            </button>
            <h2 className="text-3xl font-sans font-bold tracking-tight text-slate-900">Select Region</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {REGION_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleSelectRegion(cat.id)}
                className="group rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-500 hover:bg-blue-50"
              >
                <h3 className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-blue-700">{cat.name}</h3>
              </button>
            ))}
          </div>
        </div>
      );
    }

    // SCREEN 3: Quiz Active
    return (
      <div className="flex flex-col h-full space-y-6">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 pb-4">
          <button
            onClick={handleBack}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ← Categories
          </button>
          <span className="chip">
            {MAIN_CATEGORIES.find(c => c.id === category)?.name} • {REGION_CATEGORIES.find(r => r.id === region)?.name || "World"}
          </span>
          <div className="ml-auto flex gap-4 text-sm font-mono font-semibold">
            <span className="text-emerald-600">Score: {correct}</span>
            <span className="text-slate-500">/ {category === "countries" ? regionCountries.length : total}</span>
            {category !== "countries" && <span className="text-blue-600">Accuracy: {accuracy}%</span>}
          </div>
        </div>

        <div className="flex-1">
          {category === "countries" ? (
            <section className="flex flex-col h-[600px]">
              <h2 className="font-sans font-bold tracking-tight text-2xl text-slate-900 mb-4">
                Name all countries of {REGION_CATEGORIES.find(r => r.id === region)?.name}
              </h2>
              
              <form onSubmit={handleCountryInputSubmit} className="mb-4">
                <input
                  type="text"
                  value={countryInput}
                  onChange={(e) => setCountryInput(e.target.value)}
                  disabled={giveUp || correct === regionCountries.length}
                  placeholder="Type a country name..."
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
              </form>

              <div className="flex-1 overflow-y-auto pr-2 space-y-2 mb-4 font-mono text-sm">
                {regionCountries.map(c => {
                  const isFound = namedCountries.includes(String(c.isoNum));
                  if (!isFound && !giveUp) return null;
                  
                  return (
                    <div key={c.isoNum} className={`flex items-center gap-2 p-3 rounded-xl border ${isFound ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                      <strong>{isFound ? "Correct:" : "Missed:"}</strong> {c.name}
                    </div>
                  );
                })}
              </div>

              {!giveUp && correct < regionCountries.length && (
                <button
                  onClick={() => setGiveUp(true)}
                  className="w-full py-3 rounded-xl border border-slate-200 bg-white shadow-sm text-slate-900 font-semibold hover:bg-slate-50 transition"
                >
                  Give Up
                </button>
              )}
            </section>
          ) : (
            <div className="max-w-2xl mx-auto py-8">
              <QuizCard
                question={question}
                answered={answered}
                answerCorrect={answerCorrect}
                onAnswer={handleAnswer}
                onNext={() => loadNextQuestion(category, region)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Pre-answer location marker for seas/mountains (pulsing before answering)
  let currentLocMarker = locationMarker;
  if (!answered && question?.mapHighlight && (category === "seas" || category === "mountains")) {
    currentLocMarker = {
      lat: question.mapHighlight.lat,
      lng: question.mapHighlight.lng,
      label: question.mapHighlight.label || "Where is this?",
      color: category === "mountains" ? "#f97316" : "#3b82f6"
    };
  }

  return (
    <div className="flex h-[calc(100vh-52px)] w-full overflow-hidden bg-slate-50 relative">
      {/* Sidebar Overlay (Only for active Quiz) */}
      <div 
        style={{ width: screen === 3 && showUI ? sidebarWidth : 0 }}
        className={`flex-shrink-0 z-20 bg-white shadow-xl relative flex flex-col ${
          !isResizing ? 'transition-all duration-300' : ''
        } ${
          screen === 3 && showUI 
            ? 'opacity-100 border-r border-slate-200' 
            : 'opacity-0 border-none'
        }`}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div style={{ width: sidebarWidth }} className="p-6">
            {screen === 3 && renderScreen()}
          </div>
        </div>
        
        {/* Drag Handle */}
        {screen === 3 && showUI && (
          <div
            onMouseDown={startResizing}
            className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors z-50 ${isResizing ? 'bg-blue-400' : 'bg-transparent'}`}
          />
        )}
      </div>

      {/* Toggle UI Button */}
      <button 
        onClick={() => setShowUI(!showUI)}
        className="absolute bottom-6 left-6 z-30 rounded-full bg-white p-3 shadow-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
        title="Toggle Fullscreen Map"
      >
        {showUI ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7m-7 17v-6m0 0h6m-6 0l7 7M10 10H4m6 0V4m0 6l-7-7" /></svg>
        )}
      </button>

      {/* Globe Background */}
      <div className="relative flex-1 h-full bg-slate-50 flex items-center justify-center overflow-hidden z-0">
        <Globe
          countries={allCountries}
          focusRegion={focusRegion}
          flyTo={flyTo}
          namedCountries={namedCountries}
          highlights={globeHighlights}
          capitalMarker={capitalMarker}
          locationMarker={currentLocMarker}
          geoMarkers={geoMarkers}
        />
        
        {/* Centered Menu Container (Only when screen !== 3) */}
        {screen !== 3 && (
          <div className={`absolute z-10 m-auto h-fit w-full max-w-5xl rounded-[2rem] border border-white/60 bg-white/90 p-8 md:p-12 shadow-2xl backdrop-blur-xl transition-all duration-300 ${!showUI ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            {renderScreen()}
          </div>
        )}
      </div>
    </div>
  );
}
