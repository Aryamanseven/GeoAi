import { useMemo, useState, useCallback, useEffect } from "react";
import Globe from "../components/Globe";
import ImageUploader from "../components/ImageUploader";
import LoadingSkeleton from "../components/LoadingSkeleton";
import ResultPanel from "../components/ResultPanel";
import ChatPanel from "../components/ChatPanel";
import { predictCountry } from "../lib/api";

const HIGHLIGHT_COLORS = ["#ef5350", "#ff9800", "#ffee58"];

export default function Analyzer() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [error, setError] = useState("");
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

  const highlights = useMemo(
    () =>
      (result?.top3 || []).map((prediction, index) => ({
        ...prediction,
        color: HIGHLIGHT_COLORS[index] || HIGHLIGHT_COLORS[2]
      })),
    [result]
  );

  async function handleAnalyze() {
    if (!file) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = await predictCountry(file);
      setResult(payload);
    } catch (requestError) {
      setError(requestError.message || "Prediction failed. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-52px)] w-full overflow-hidden bg-slate-50 relative">
      {/* Sidebar Overlay */}
      <div 
        style={{ width: showUI ? sidebarWidth : 0 }}
        className={`flex-shrink-0 border-r border-slate-200 bg-white shadow-xl z-20 relative flex flex-col ${
          !isResizing ? 'transition-all duration-300' : ''
        } ${showUI ? 'opacity-100' : 'opacity-0 border-none overflow-hidden'}`}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div style={{ width: sidebarWidth }} className="p-6 space-y-6">
            <ImageUploader file={file} onFileSelect={setFile} />
          {file ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={loading}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Identifying..." : "Identify Country"}
              </button>
              {loading ? <span className="text-sm font-mono text-slate-500">Running prediction...</span> : null}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
              {error}
            </div>
          ) : null}
          {loading ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <p className="eyebrow">Prediction output</p>
              <div className="mt-4 space-y-5">
                <LoadingSkeleton lines={3} height={22} className="opacity-50" />
                <LoadingSkeleton lines={4} height={14} className="pt-4 opacity-50" />
              </div>
            </section>
          ) : (
            <ResultPanel
              predictions={result?.top3 || []}
              explanation={result?.explanation || ""}
              canGuess={result?.canGuess ?? true}
            />
          )}

          {/* Feature 1: Chat Panel — appears after prediction */}
          {result && !loading && (
            <ChatPanel
              imageFile={file}
              predictions={result?.top3 || []}
            />
          )}
        </div>
        </div>
        
        {/* Drag Handle */}
        <div
          onMouseDown={startResizing}
          className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors z-50 ${isResizing ? 'bg-blue-400' : 'bg-transparent'}`}
        />
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
      <div className="relative flex-1 h-full bg-slate-50 overflow-hidden z-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 z-10 absolute inset-0">
             <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
             <p className="font-mono text-sm text-slate-500">Analyzing satellite data...</p>
          </div>
        ) : null}
        <Globe
          highlights={highlights}
          flyTo={result?.top3?.[0] ? { lat: result.top3[0].lat, lng: result.top3[0].lng } : null}
        />
        {result?.top3?.length && !loading ? (
          <div className={`absolute right-8 top-8 z-20 w-80 rounded-2xl border border-white/60 bg-white/90 p-6 shadow-lg backdrop-blur-xl transition-all duration-300 ${!showUI ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}`}>
            <h3 className="mb-4 font-sans text-sm font-bold tracking-tight text-slate-800">Telemetry Lock</h3>
            {result.top3.map((prediction, index) => (
              <div
                key={`${prediction.isoNum}-${prediction.country}`}
                className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"
              >
                <span
                  className="h-3 w-3 rounded-full shadow-sm"
                  style={{ backgroundColor: HIGHLIGHT_COLORS[index] || HIGHLIGHT_COLORS[2] }}
                />
                <span className="font-semibold tracking-tight">{prediction.country}</span>
              </div>
            ))}
          </div>
        ) : null}
        {!result?.top3?.length && !loading ? (
          <div className={`absolute bottom-8 right-8 z-20 rounded-xl border border-white/60 bg-white/90 px-6 py-4 shadow-sm backdrop-blur-xl transition-all duration-300 ${!showUI ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
            <p className="font-mono text-sm font-medium text-slate-500">Awaiting Target Imagery...</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}


