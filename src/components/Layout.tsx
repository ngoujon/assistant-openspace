import type { ReactNode } from "react";

interface LayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
}

export function Layout({ sidebar, main }: LayoutProps) {
  return (
    <div className="shell">
      <aside className="shell-sidebar">{sidebar}</aside>
      <main className="shell-main">{main}</main>
      <aside className="shell-right" aria-label="Réservé (vide pour l’instant)" />
    </div>
  );
}
