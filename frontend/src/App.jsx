import { NavLink, Route, Routes } from "react-router-dom";
import Analyzer from "./pages/Analyzer";
import Quiz from "./pages/Quiz";
import Eval from "./pages/Eval";

const navItems = [
  { to: "/", label: "Analyzer" },
  { to: "/quiz", label: "Quiz" },
  { to: "/eval", label: "Eval" }
];

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 flex h-[52px] items-center justify-between border-b border-white/60 bg-white/90 px-6 shadow-sm backdrop-blur-xl">
        <div className="font-bold tracking-tight text-slate-900">GeoAI.Studio</div>
        <nav className="flex h-full gap-6">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex h-full items-center border-b-2 px-1 text-sm font-semibold transition-colors ${
                  isActive ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-blue-500"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* MAIN CONTENT */}
      <main className="h-[calc(100vh-52px)] w-full">
        <Routes>
          <Route path="/" element={<Analyzer />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/eval" element={<Eval />} />
        </Routes>
      </main>
    </div>
  );
}


