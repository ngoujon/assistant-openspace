import type { Conversation } from "@/types";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
}: SidebarProps) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="sidebar-inner">
      <header className="sidebar-header">
        <div className="sidebar-brand-row">
          <h1 className="sidebar-title">OpenSpace</h1>
          <button
            type="button"
            className="sidebar-settings-btn"
            aria-label="Paramètres"
            title="Paramètres"
            onClick={onOpenSettings}
          >
            <svg
              className="sidebar-settings-icon"
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
        <p className="sidebar-sub">Chat · Mission · Équipe</p>
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
