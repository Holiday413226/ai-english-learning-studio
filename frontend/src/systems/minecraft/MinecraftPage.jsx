/**
 * MinecraftPage — COZE-powered Minecraft English learning (placeholder).
 *
 * Full subsystem structure is in place — routes, session storage, store, API.
 * The UI implementation will follow the same pattern as DebaterPage.
 */
export default function MinecraftPage() {
  return (
    <div className="page-content">
      <header>
        <h1>⛏ Minecrafter</h1>
        <p>COZE-powered Minecraft English learning — coming soon</p>
      </header>

      <main className="placeholder-main">
        <div className="window placeholder-window">
          <div className="placeholder-box">
            <p>
              The Minecraft subsystem backend is ready:
              <code> POST /api/minecraft/chat</code>
              {" "}— send messages to COZE bot
            </p>
            <p>
              Session persistence is active — chat history is stored in
              {" "}<code>data/minecraft/</code> JSON files.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
