import { useLocation, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { path: "/",           label: "Dashboard",    layer: "HOME",  icon: "M3 3h7v7H3V3zm0 10h7v7H3v-7zm10-10h7v7h-7V3zm0 10h7v7h-7v-7z" },
  { path: "/novel",      label: "Novel Translator", layer: "LAYER 1", icon: "M4 6h16M4 12h16M4 18h12" },
  { path: "/diary",      label: "Diary",        layer: "LAYER 2", icon: "M5 3v16l6-4 6 4V3z" },
  { path: "/debater",    label: "Debater",      layer: "LAYER 3", icon: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4v6l4 4" },
  { path: "/minecrafter",label: "Minecraft",    layer: "LAYER 4", icon: "M4 4h16v16H4V4zm4 4h8v8H8V8z" },
  { path: "/vocab",      label: "Vocab Vault",   layer: "VAULT",  icon: "M12 2l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z" },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">AI English Studio</span>
        <div className="sidebar-sub">v2.0.0</div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={`sidebar-item ${isActive(item.path) ? "active" : ""}`}
            onClick={() => navigate(item.path)}
          >
            <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={item.icon} />
            </svg>
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p><span className="sys-ok"></span><span className="sys-status">SYS.OK</span></p>
        <p>MAGI:ONLINE</p>
        <p>NAVI:CONNECTED</p>
      </div>

      <style>{`
        .sys-ok {
          display: inline-block;
          width: 6px;
          height: 6px;
          background: var(--accent);
          border-radius: 50%;
          margin-right: 4px;
          vertical-align: middle;
          box-shadow: 0 0 6px rgba(80, 250, 123, 0.5);
          animation: brandGlow 3s ease-in-out infinite;
        }
        .sys-status {
          color: var(--accent);
          animation: subtlePulse 3s ease-in-out infinite;
        }
      `}</style>
    </aside>
  );
}