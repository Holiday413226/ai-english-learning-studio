import { useLocation, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { path: "/",           label: "Dashboard",    layer: "HOME",  icon: "🏠" },
  { path: "/novel",      label: "EnglishNovel", layer: "LAYER 1", icon: "📖" },
  { path: "/diary",      label: "Diary",        layer: "LAYER 2", icon: "✍️" },
  { path: "/debater",    label: "Debater",      layer: "LAYER 3", icon: "⚔️" },
  { path: "/minecrafter",label: "Minecrafter",  layer: "LAYER 4", icon: "⛏️" },
  { path: "/vocab",      label: "VocabVault",   layer: "VAULT",  icon: "📚" },
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
        <span className="sidebar-logo">AI</span>
        <span className="sidebar-sub">English Studio</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={`sidebar-item ${isActive(item.path) ? "active" : ""}`}
            onClick={() => navigate(item.path)}
          >
            <span className="sidebar-layer">{item.layer}</span>
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p>v2.0.0</p>
      </div>
    </aside>
  );
}
