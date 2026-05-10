import type { ReactNode } from "react";

interface LayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  /** Colonne entre le centre et l’activité (ex. Organisation en onglet Équipe). */
  midAside?: ReactNode;
  /** Colonne droite : activité / échanges en cours (discussion, mission). */
  rightAside?: ReactNode;
}

export function Layout({ sidebar, main, midAside, rightAside }: LayoutProps) {
  return (
    <div className={midAside ? "shell shell--with-org-aside" : "shell"}>
      <aside className="shell-sidebar">{sidebar}</aside>
      <main className="shell-main">{main}</main>
      {midAside ? (
        <aside className="shell-org" aria-label="Organisation de l’équipe">
          {midAside}
        </aside>
      ) : null}
      <aside
        className="shell-right"
        aria-label="Activité et échanges en cours"
      >
        {rightAside}
      </aside>
    </div>
  );
}
