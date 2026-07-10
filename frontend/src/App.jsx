/**
 * App — root component.
 *
 * On mount, restores API keys from backend (keyring_store → Zustand),
 * then notifies SetupModal that keys are ready.
 * Keys survive EXE restarts because they're stored in encrypted file.
 */
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import SetupModal from "./components/SetupModal";
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
  const deepseekApiKey = useConfigStore((s) => s.deepseekApiKey);
  const [keysRestored, setKeysRestored] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [restoredKeys, setRestoredKeys] = useState({});

  // ── Restore keys from backend keyring_store on mount ──────
  useEffect(() => {
    // If Zustand already has keys (from localStorage), skip restore
    if (cozeApiKey || deepseekApiKey) {
      setKeysRestored(true);
      return;
    }

    // Fetch all keys from backend
    fetch("/api/config/get")
      .then((r) => r.json())
      .then((keys) => {
        if (keys.error) return;
        // Check if any key has a value
        const hasKeys = Object.values(keys).some((v) => v && v.length > 0);
        if (hasKeys) {
          // Restore to Zustand
          setConfig({
            deepseekApiKey: keys.deepseekApiKey || "",
            cozeApiKey: keys.cozeApiKey || "",
            debateBotId: keys.debateBotId || "",
            discussBotId: keys.discussBotId || "",
            minecraftBotId: keys.minecraftBotId || "",
          });
          setRestoredKeys(keys);
        } else {
          // No keys configured — show SetupModal on first launch
          setShowSetup(true);
        }
        setKeysRestored(true);
      })
      .catch(() => {
        // Backend not ready yet — retry in 2s
        setTimeout(() => {
          fetch("/api/config/get")
            .then((r) => r.json())
            .then((keys) => {
              if (keys.error) { setShowSetup(true); setKeysRestored(true); return; }
              const hasKeys = Object.values(keys).some((v) => v && v.length > 0);
              if (hasKeys) {
                setConfig({
                  deepseekApiKey: keys.deepseekApiKey || "",
                  cozeApiKey: keys.cozeApiKey || "",
                  debateBotId: keys.debateBotId || "",
                  discussBotId: keys.discussBotId || "",
                  minecraftBotId: keys.minecraftBotId || "",
                });
              } else {
                setShowSetup(true);
              }
              setKeysRestored(true);
            })
            .catch(() => { setShowSetup(true); setKeysRestored(true); });
        }, 2000);
      });
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
      {/* SetupModal — auto-opens on first launch when no keys configured */}
      {keysRestored && (
        <SetupModal
          open={showSetup}
          onClose={() => setShowSetup(false)}
          restoredKeys={restoredKeys}
        />
      )}
    </BrowserRouter>
  );
}
