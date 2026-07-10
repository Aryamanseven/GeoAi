import { useEffect, useRef, useState } from "react";
import FlagDisplay from "./FlagDisplay";
import { getQuizExplanation } from "../lib/api";

export default function QuizCard({
  question,
  answered,
  answerCorrect,
  onAnswer,
  onNext,
  userAnswer: externalUserAnswer,
}) {
  const [textInput, setTextInput] = useState("");
  const inputRef = useRef(null);


  // Feature 2: Adaptive quiz explanation state
  const [explanationText, setExplanationText] = useState(null);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
  const [trackedAnswer, setTrackedAnswer] = useState(null);

  // Reset text input, deep dive, and explanation state when question changes
  useEffect(() => {
    setTextInput("");

    setExplanationText(null);
    setIsLoadingExplanation(false);
    setTrackedAnswer(null);
    if (inputRef.current) inputRef.current.focus();
  }, [question]);

  // Feature 2: Auto-fetch explanation when answered incorrectly
  useEffect(() => {
    if (answered && !answerCorrect && question && trackedAnswer) {
      setIsLoadingExplanation(true);
      getQuizExplanation(
        question.question,
        trackedAnswer,
        question.answer,
        question.category || "general"
      )
        .then((text) => {
          if (text) setExplanationText(text);
        })
        .catch(console.error)
        .finally(() => setIsLoadingExplanation(false));
    }
  }, [answered, answerCorrect, question, trackedAnswer]);

  if (!question) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <p className="text-sm font-mono text-slate-500">Loading question…</p>
      </section>
    );
  }

  const cat = question.category || "general";
  const isTextMode = cat === "flags" || cat === "capitals";
  const isMcqMode = cat === "seas" || cat === "mountains";

  /* ─── Handlers ─── */
  function handleTextSubmit(e) {
    e.preventDefault();
    if (answered || !textInput.trim()) return;
    setTrackedAnswer(textInput.trim());
    onAnswer(textInput.trim());
  }

  function handleOptionClick(option) {
    if (answered) return;
    setTrackedAnswer(option);
    onAnswer(option);
  }



  // Feature 2: Render adaptive explanation for wrong answers
  function renderExplanationSection() {
    if (answerCorrect) return null;

    return (
      <div className="mt-3">
        {isLoadingExplanation && (
          <div className="flex items-center gap-2 text-sm text-blue-500 font-mono">
            <span className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            Generating personalized explanation...
          </div>
        )}
        {explanationText && (
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
            <h4 className="text-slate-900 font-bold tracking-tight mb-1 flex items-center gap-2 text-sm">
              Why?
            </h4>
            <p className="text-sm text-slate-600 leading-relaxed">
              {explanationText}
            </p>
          </div>
        )}
      </div>
    );
  }



  return (
    <section className="flex flex-col gap-6">
      {/* ─── FLAGS MODE ─── */}
      {cat === "flags" && (
        <>
          <div className="flex justify-center">
            <img
              src={`https://flagcdn.com/w320/${question.iso2?.toLowerCase()}.png`}
              alt="Flag"
              className="h-[160px] object-cover rounded-xl shadow-md border border-slate-200"
            />
          </div>
          <form onSubmit={handleTextSubmit} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type country name..."
                autoFocus
                disabled={answered}
                className={`flex-1 rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder-slate-400 shadow-sm outline-none transition ${
                  answered
                    ? answerCorrect
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold"
                      : "border-rose-500 bg-rose-50 text-rose-700 font-semibold"
                    : "border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                }`}
              />
              {!answered && (
                <button
                  type="submit"
                  disabled={!textInput.trim()}
                  className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 hover:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Submit
                </button>
              )}
            </div>
            {answered && (
              <div className="mt-2 text-base">
                {answerCorrect ? (
                  <p className="text-emerald-600 font-semibold">Correct! {question.answer}</p>
                ) : (
                  <p className="text-rose-600 font-semibold">Incorrect. It was {question.answer}</p>
                )}
                {question.funFact && (
                  <p className="mt-3 text-sm leading-6 text-slate-600"><strong>Fun Fact:</strong> {question.funFact}</p>
                )}
                {renderExplanationSection()}
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={onNext}
                    autoFocus
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    Next Flag →
                  </button>
                </div>
              </div>
            )}
          </form>
        </>
      )}

      {/* ─── CAPITALS MODE ─── */}
      {cat === "capitals" && (
        <>
          <div className="flex items-center gap-4">
            <FlagDisplay iso2={question.iso2} emoji={question.flag} size="md" />
            <h2 className="font-sans text-3xl font-bold tracking-tight text-slate-900">
              {question.promptCountry || question.country || "Country"}
            </h2>
          </div>
          <p className="text-lg text-slate-600 font-medium">
            What is the capital of {question.promptCountry || question.country}?
          </p>
          <form onSubmit={handleTextSubmit} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type the capital city..."
                autoFocus
                disabled={answered}
                className={`flex-1 rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder-slate-400 shadow-sm outline-none transition ${
                  answered
                    ? answerCorrect
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold"
                      : "border-rose-500 bg-rose-50 text-rose-700 font-semibold"
                    : "border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                }`}
              />
              {!answered && (
                <button
                  type="submit"
                  disabled={!textInput.trim()}
                  className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 hover:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Submit
                </button>
              )}
            </div>
            {answered && (
              <div className="mt-2 text-base">
                {answerCorrect ? (
                  <p className="text-emerald-600 font-semibold">{question.answer} is correct!</p>
                ) : (
                  <p className="text-rose-600 font-semibold">Incorrect. The capital is {question.answer}</p>
                )}
                {question.funFact && (
                  <p className="mt-3 text-sm leading-6 text-slate-600"><strong>Fun Fact:</strong> {question.funFact}</p>
                )}
                {renderExplanationSection()}
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={onNext}
                    autoFocus
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </form>
        </>
      )}

      {/* ─── SEAS / MOUNTAINS MODE (MCQ) ─── */}
      {isMcqMode && (
        <>
          <p className="eyebrow text-blue-600">
            {cat === "seas" ? "🌊 Seas & Oceans" : "⛰ Mountain Ranges"}
          </p>
          <h2 className="font-sans text-2xl font-bold tracking-tight text-slate-900 leading-snug">
            {question.question}
          </h2>
          <div className="grid gap-3 mt-2">
            {(question.options || []).map((option) => {
              const optCorrect = answered && option === question.answer;
              const optClicked = answered && !answerCorrect && option !== question.answer;
              let classes = "border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-500 shadow-sm";
              
              if (answered) {
                if (optCorrect) classes = "border-emerald-500 bg-emerald-50 text-emerald-700 font-bold shadow-sm";
                else if (optClicked) classes = "border-rose-500 bg-rose-50 text-rose-700 opacity-70 shadow-sm";
                else classes = "border-slate-200 bg-white text-slate-400 shadow-sm";
              }

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleOptionClick(option)}
                  disabled={answered}
                  className={`rounded-xl border px-4 py-4 text-left text-sm transition-all ${classes}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
          {answered && (
            <div className="mt-4 text-base">
              {answerCorrect ? (
                <p className="text-emerald-600 font-semibold">Correct!</p>
              ) : (
                <p className="text-rose-600 font-semibold">Incorrect. The answer is {question.answer}</p>
              )}
              {question.funFact && (
                <p className="mt-3 text-sm leading-6 text-slate-600"><strong>Fun Fact:</strong> {question.funFact}</p>
              )}
              {renderExplanationSection()}
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={onNext}
                  autoFocus
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
