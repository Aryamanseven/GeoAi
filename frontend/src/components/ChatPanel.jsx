import { useState, useRef, useEffect } from "react";
import { chatAboutImage } from "../lib/api";



export default function ChatPanel({ imageFile, predictions = [] }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageBase64, setImageBase64] = useState(null);
  const scrollRef = useRef(null);

  // Convert image file to base64 once
  useEffect(() => {
    if (!imageFile) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      // Strip the data:image/...;base64, prefix
      const b64 = reader.result.split(",")[1];
      setImageBase64(b64);
    };
    reader.readAsDataURL(imageFile);
  }, [imageFile]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function sendMessage(text) {
    if (!text.trim() || loading || !imageBase64) return;

    const userMsg = { role: "user", content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const predictionNames = predictions.map((p) => p.country);
      const reply = await chatAboutImage(imageBase64, updatedMessages, predictionNames);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }



  if (!imageFile) return null;

  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center gap-3">
        <div>
          <p className="eyebrow">Interactive Analysis</p>
          <h2 className="mt-1 font-sans font-bold tracking-tight text-xl text-slate-900">
            Ask the Geography Detective
          </h2>
        </div>
      </div>



      {/* Messages */}
      <div
        ref={scrollRef}
        className="mb-4 max-h-[320px] min-h-[80px] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-inner"
      >
        {messages.length === 0 && !loading && (
          <p className="text-sm text-slate-500 italic">
            Ask questions about the image to investigate geographic clues...
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-800 border border-slate-200"
              }`}
            >
              {msg.role === "assistant" && (
                <span className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Detective
                </span>
              )}
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <span className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
              Analyzing...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(e);
        }} 
        className="flex gap-2 items-end"
      >
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (input.trim() && !loading) {
                sendMessage(input);
                e.target.style.height = 'auto';
              }
            }
          }}
          placeholder="Ask about the image..."
          disabled={loading}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 shadow-sm max-h-[150px] overflow-y-auto"
          style={{ minHeight: '46px' }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl border border-transparent bg-slate-900 px-5 h-[46px] text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
