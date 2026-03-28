export function TeamPanel() {
  return (
    <div className="team-panel">
      <h2 className="team-heading">Équipe virtuelle</h2>
      <p className="team-copy">
        Ici, plusieurs agents pourront collaborer et s’appuyer sur Ollama en local.
        Les rôles, le routage des messages et l’orchestration arriveront dans une
        prochaine itération.
      </p>
      <ul className="team-placeholder-list">
        <li>Agents spécialisés (à définir)</li>
        <li>File de tâches / handoff</li>
        <li>Même proxy Ollama que l’onglet Chat</li>
      </ul>
    </div>
  );
}
