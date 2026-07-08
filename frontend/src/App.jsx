/**
 * App — root component.
 *
 * Three fully-isolated subsystems, each with its own:
 *   - Backend router   (systems/<name>/router.py)
 *   - Session storage  (data/<name>/)
 *   - Frontend module  (systems/<name>/)
 *
 * Global config (API keys, Bot IDs) lives in configStore (localStorage).
 * The backend NEVER stores sensitive keys — every request carries its own.
 */
import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import NovelPage from "./systems/novel/NovelPage";
import DebaterPage from "./systems/debater/DebaterPage";
import MinecraftPage from "./systems/minecraft/MinecraftPage";
import "./App.css";

export default function App() {
  // On tab/window close: tell the backend to shut down (EXE mode).
  // No-op if the backend is already gone or in dev mode.
  useEffect(() => {
    const handleBeforeUnload = () => {
      navigator.sendBeacon("/api/shutdown");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar />
        <div className="main-area">
          <Routes>
            <Route path="/" element={<NovelPage />} />
            <Route path="/debater" element={<DebaterPage />} />
            <Route path="/minecrafter" element={<MinecraftPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
