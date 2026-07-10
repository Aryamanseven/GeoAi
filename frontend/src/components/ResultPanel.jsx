import FlagDisplay from "./FlagDisplay";

const COLORS = ["#ef5350", "#ff9800", "#ffee58"];

export default function ResultPanel({ predictions = [], explanation = "", canGuess = true }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="eyebrow">Prediction output</p>
          <h2 className="mt-2 font-sans font-bold tracking-tight text-2xl text-slate-900">Country ranking and reasoning</h2>
        </div>
      </div>

      {!predictions.length ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-700 shadow-sm">
          Upload an image to see the model's top three country guesses, confidence bars, and an explanation.
        </div>
      ) : null}

      <div className="space-y-4">
        {predictions.map((prediction, index) => {
          const accent = COLORS[index] || COLORS[2];
          return (
            <article
              key={`${prediction.isoNum}-${index}`}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <FlagDisplay iso2={prediction.iso2} emoji={prediction.flag} size="sm" />
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{prediction.country}</h3>
                    {index === 0 ? (
                      <span className="mt-1 inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-widest text-emerald-700">
                        BEST GUESS
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold text-slate-700">{Number(prediction.confidence).toFixed(1)}%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(Number(prediction.confidence), 8)}%`,
                    backgroundColor: accent
                  }}
                />
              </div>
            </article>
          );
        })}
      </div>

      {predictions.length ? (
        canGuess ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900">AI Reasoning</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {explanation || "Reasoning will appear here after an image is analyzed."}
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
            <p className="font-semibold text-slate-900">Not enough geographic clues</p>
            <p className="mt-2 leading-6 text-slate-500">
              The model could rank a few possibilities, but the image does not contain enough clear regional evidence to make a confident explanation.
            </p>
          </div>
        )
      ) : null}
    </section>
  );
}
