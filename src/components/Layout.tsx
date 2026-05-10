import type { ReactNode } from "react";

interface LayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  /** Hiérarchie de l’équipe (à gauche de l’activité). */
  organisationAside: ReactNode;
  /** Mission / discussion : colonne à droite. */
  activityAside: ReactNode;
}

export function Layout({
  sidebar,
  main,
  organisationAside,
  activityAside,
}: LayoutProps) {
  return (
    <div className="shell shell--with-hud">
      <aside className="shell-sidebar">{sidebar}</aside>
      <main className="shell-main">{main}</main>
      <div className="shell-hud" aria-label="Organisation et activité">
        <aside className="shell-org" aria-label="Organisation de l’équipe">
          {organisationAside}
        </aside>
        <aside className="shell-activity" aria-label="Activité mission et discussion">
          {activityAside}
        </aside>
      </div>
    </div>
  );
}
