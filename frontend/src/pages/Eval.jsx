import { useEffect, useState } from "react";
import EvalDashboard from "../components/EvalDashboard";

export default function Eval() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [is404, setIs404] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api/eval/results`
        );
        if (!active) return;

        if (res.status === 404) {
          setIs404(true);
          setLoading(false);
          return;
        }

        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }

        const payload = await res.json();
        if (active) {
          setData(payload);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message || "Could not load evaluation results.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh" }}>
      {loading ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div
              style={{
                width: 48,
                height: 48,
                border: "4px solid #e2e8f0",
                borderTopColor: "#3b82f6",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p className="font-mono text-sm text-slate-500">Loading evaluation data…</p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : is404 ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
            <p className="text-4xl">📊</p>
            <h2 className="mt-4 font-sans text-2xl font-bold tracking-tight text-slate-900">No Evaluation Results</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Run the following command to generate evaluation results:
            </p>
            <code className="mt-4 inline-block rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 font-mono text-sm text-blue-600 shadow-sm">
              python -m backend.model.evaluate
            </code>
          </div>
        </div>
      ) : error ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700 shadow-sm">
            {error}
          </div>
        </div>
      ) : (
        <EvalDashboard data={data} />
      )}
    </div>
  );
}
