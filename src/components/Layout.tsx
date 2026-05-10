import type { ReactNode } from "react";

interface LayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  /** Hiérarchie de l’équipe (toujours à gauche du bloc « échanges »). */
  organisationAside: ReactNode;
  /** Routage / stream discussion (entre Organisation et Activité). */
  exchangesAside: ReactNode;
  /** Mission, idle : colonne la plus à droite. */
  activityAside: ReactNode;
}

export function Layout({
  sidebar,
  main,
  organisationAside,
  exchangesAside,
  activityAside,
}: LayoutProps) {
  return (
    <div className="shell shell--with-hud">
      <aside className="shell-sidebar">{sidebar}</aside>
      <main className="shell-main">{main}</main>
      <div className="shell-hud" aria-label="Organisation, échanges et activité">
        <aside className="shell-org" aria-label="Organisation de l’équipe">
          {organisationAside}
        </aside>
        <aside className="shell-exchanges" aria-label="Échanges en cours">
          {exchangesAside}
        </aside>
        <aside className="shell-activity" aria-label="Activité mission et indicateurs">
          {activityAside}
        </aside>
      </div>
    </div>
  );
}
