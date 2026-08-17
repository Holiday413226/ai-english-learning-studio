/**
 * App — root component.
 *
 * On mount, restores API keys from backend (keyring_store → Zustand),
 * then notifies SetupModal that keys are ready.
 * Keys survive EXE restarts because they're stored in encrypted file.
 *
 * SettingsContext provides { openSettings, triggerGlitch } so any page/component can
 * open the global SetupModal — Dashboard ⚙, Debater Sidebar ⚙, etc.
 */
import { useEffect, useState, useRef, createContext, useCallback } from "react";
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

export const SettingsContext = createContext({
  openSettings: () => {},
  triggerGlitch: () => {},
});

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

  // ── Logo glitch trigger ───────────────────────────────────
  const triggerGlitch = useCallback(() => {
    const el = document.getElementById('main-title-glitch');
    if (!el) return;
    el.classList.remove('glitch-trigger');
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add('glitch-trigger');
  }, []);

  // ── Block Invasion Effect for .btn-primary / .nes-btn.is-primary ──
  const blockInvasionSetup = useRef(false);
  useEffect(() => {
    if (blockInvasionSetup.current) return;
    blockInvasionSetup.current = true;

    function setupBlockInvasion(btn) {
      // Clean up any existing block invaders (React reconciliation may have removed them)
      btn.querySelectorAll('.block-invader').forEach((b) => b.remove());

      // Wrap plain text in a span so it stays above the invading blocks
      for (let i = 0; i < btn.childNodes.length; i++) {
        const node = btn.childNodes[i];
        if (node.nodeType === 3 && node.textContent.trim()) {
          const wrapper = document.createElement('span');
          wrapper.textContent = node.textContent;
          wrapper.style.position = 'relative';
          wrapper.style.zIndex = '1';
          node.replaceWith(wrapper);
          break;
        }
      }

      // Generate highly irregular block heights that sum to 100%
      const count = 10 + Math.floor(Math.random() * 5); // 10-14 blocks
      const heights = [];
      let total = 0;
      for (let i = 0; i < count; i++) {
        const h = 3 + Math.floor(Math.random() * 52);
        heights.push(h);
        total += h;
      }
      // Normalize to sum exactly 100%
      let accumulated = 0;
      for (let i = 0; i < count; i++) {
        let normalized = Math.round(heights[i] / total * 100);
        if (i === count - 1) {
          normalized = 100 - accumulated;
        }
        normalized = Math.max(3, Math.min(normalized, 55));
        heights[i] = normalized;
        accumulated += normalized;
        if (accumulated >= 100) {
          heights[i] -= (accumulated - 100);
          heights.splice(i + 1);
          break;
        }
      }

      // Create block invaders
      let topOffset = 0;
      heights.forEach((h) => {
        const block = document.createElement('span');
        block.className = 'block-invader';
        block.style.top = topOffset + '%';
        block.style.height = h + '%';
        block.dataset.targetWidth = '100%';
        block.style.transitionDuration = (0.08 + Math.random() * 0.27).toFixed(2) + 's';
        block.style.transitionDelay = (Math.random() * 0.15).toFixed(3) + 's';
        block.style.opacity = (0.75 + Math.random() * 0.25).toFixed(2);
        btn.appendChild(block);
        topOffset += h;
      });

      // Hover handlers
      btn.addEventListener('mouseenter', function () {
        this.querySelectorAll('.block-invader').forEach((b) => {
          b.style.width = b.dataset.targetWidth;
        });
      });

      btn.addEventListener('mouseleave', function () {
        this.querySelectorAll('.block-invader').forEach((b) => {
          b.style.width = '0';
        });
      });
    }

    // Initial setup
    document.querySelectorAll('.btn-primary, .nes-btn.is-primary').forEach(setupBlockInvasion);

    // MutationObserver for dynamically added buttons AND text changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Handle added nodes (new buttons)
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.matches && node.matches('.btn-primary, .nes-btn.is-primary')) {
              setupBlockInvasion(node);
            }
            if (node.querySelectorAll) {
              node.querySelectorAll('.btn-primary, .nes-btn.is-primary').forEach(setupBlockInvasion);
            }
          }
        });

        // Handle text changes (e.g., "Analyzing..." → "Submit for Review")
        // React reconciliation removes block invaders when button text changes
        if (mutation.type === 'characterData') {
          let el = mutation.target.parentElement;
          while (el) {
            if (el.matches && el.matches('.btn-primary, .nes-btn.is-primary')) {
              setupBlockInvasion(el);
              break;
            }
            el = el.parentElement;
          }
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  // ── Settings context ──────────────────────────────────────
  const settingsContextValue = {
    openSettings: () => setShowSetup(true),
    triggerGlitch,
  };

  return (
    <SettingsContext.Provider value={settingsContextValue}>
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
        {/* Global SetupModal — the ONLY instance. Opened via SettingsContext. */}
        {keysRestored && (
          <SetupModal
            open={showSetup}
            onClose={() => setShowSetup(false)}
            restoredKeys={restoredKeys}
            onGlitchTrigger={triggerGlitch}
          />
        )}
      </BrowserRouter>
    </SettingsContext.Provider>
  );
}