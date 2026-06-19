import { useState, type ReactNode } from "react";

interface LayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  organisationAside: ReactNode;
  activityAside: ReactNode;
}

export function Layout({
  sidebar,
  main,
  organisationAside,
  activityAside,
}: LayoutProps) {
  const [orgOpen, setOrgOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(true);

  return (
    <div className="shell shell--with-hud">
      <aside className="shell-sidebar">{sidebar}</aside>
      <main className="shell-main">{main}</main>
      <div className="shell-hud" aria-label="Organisation et activité">
        <aside
          className={`shell-org${orgOpen ? "" : " shell-hud-panel--collapsed"}`}
          aria-label="Organisation de l’équipe"
        >
          <button
            type="button"
            className="shell-hud-toggle"
            aria-expanded={orgOpen}
            onClick={() => setOrgOpen((o) => !o)}
          >
            Organisation
          </button>
          {orgOpen ? organisationAside : null}
        </aside>
        <aside
          className={`shell-activity${activityOpen ? "" : " shell-hud-panel--collapsed"}`}
          aria-label="Activité mission et discussion"
        >
          <button
            type="button"
            className="shell-hud-toggle"
            aria-expanded={activityOpen}
            onClick={() => setActivityOpen((o) => !o)}
          >
            Activité
          </button>
          {activityOpen ? activityAside : null}
        </aside>
      </div>
    </div>
  );
}
