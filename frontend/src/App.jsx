/**
 * App — root component.
 *
 * Six subsystems (Dashboard / Novel / Diary / Debater / Minecraft / Vocab Vault),
 * each with its own:
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
import DashboardPage from "./systems/dashboard/DashboardPage";
import NovelPage from "./systems/novel/NovelPage";
import DiaryPage from "./systems/diary/DiaryPage";
import DebaterPage from "./systems/debater/DebaterPage";
import MinecraftPage from "./systems/minecraft/MinecraftPage";
import VocabPage from "./systems/vocab/VocabPage";
import "./App.css";

export default function App() {
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
            <Route path="/" element={<DashboardPage />} />
            <Route path="/novel" element={<NovelPage />} />
            <Route path="/diary" element={<DiaryPage />} />
            <Route path="/debater" element={<DebaterPage />} />
            <Route path="/minecrafter" element={<MinecraftPage />} />
            <Route path="/vocab" element={<VocabPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
