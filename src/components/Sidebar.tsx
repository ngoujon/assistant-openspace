import type { Conversation } from "@/types";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: SidebarProps) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="sidebar-inner">
      <header className="sidebar-header">
        <h1 className="sidebar-title">OpenSpace</h1>
        <p className="sidebar-sub">Local · Ollama</p>
        <button type="button" className="btn-primary sidebar-new" onClick={onNew}>
          Nouveau projet
        </button>
      </header>
      <nav className="sidebar-nav" aria-label="Conversations">
        <h2 className="sidebar-section">Conversations</h2>
        <ul className="conv-list">
          {sorted.map((c) => (
            <li key={c.id}>
              <div
                className={
                  c.id === activeId ? "conv-item conv-item-active" : "conv-item"
                }
              >
                <button
                  type="button"
                  className="conv-btn"
                  aria-current={c.id === activeId ? "true" : undefined}
                  onClick={() => onSelect(c.id)}
                >
                  <span className="conv-title">{c.title}</span>
                  <span className="conv-meta">
                    {new Date(c.updatedAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  className="conv-delete"
                  aria-label={`Supprimer ${c.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(c.id);
                  }}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
