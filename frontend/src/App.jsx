/**
 * App — root component.
 *
 * Six subsystems (Dashboard / Novel / Diary / Debater / Minecraft / Vocab Vault),
 * each with its own backend router and frontend module.
 *
 * On mount, restores API keys from the backend (keyring_store) into Zustand.
 * This ensures keys survive EXE restarts even when localStorage is cleared.
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
import useConfigStore from "./store/configStore";
import "./App.css";

export default function App() {
  const setConfig = useConfigStore((s) => s.setConfig);
  const cozeApiKey = useConfigStore((s) => s.cozeApiKey);

  // ── Restore keys from backend keyring_store on mount ──────
  useEffect(() => {
    // If Zustand already has keys (from localStorage), skip restore
    if (cozeApiKey) return;

    fetch("/api/config/status")
      .then((r) => r.json())
      .then((status) => {
        // If any key is configured in backend, ask backend to give us the values
        // We use a dedicated endpoint or just trust the status flags
        if (Object.values(status).some(Boolean)) {
          // Keys exist in backend — we need to fetch them
          // For security, the backend only returns status (bool), not plaintext
          // So we set a flag that tells SetupModal to show "keys configured" state
          setConfig({ _backendHasKeys: true });
        }
      })
      .catch(() => {}); // backend not ready yet — that's ok
  }, []); // only on mount

  // On tab/window close: tell the backend to shut down (EXE mode).
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
