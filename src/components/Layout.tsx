import type { ReactNode } from "react";

interface LayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  /** Colonne droite : activité / échanges en cours (discussion, mission). */
  rightAside?: ReactNode;
}

export function Layout({ sidebar, main, rightAside }: LayoutProps) {
  return (
    <div className="shell">
      <aside className="shell-sidebar">{sidebar}</aside>
      <main className="shell-main">{main}</main>
      <aside
        className="shell-right"
        aria-label="Activité et échanges en cours"
      >
        {rightAside}
      </aside>
    </div>
  );
}
