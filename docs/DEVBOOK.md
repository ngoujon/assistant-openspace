# Devbook — OpenSpace Localhost

Journal de développement : à **mettre à jour à chaque changement notable** (fonctionnalité, dette technique, incident, décision d’architecture).

---

## 2026-03-28 — Bootstrap UI + Chat Ollama

### Objectif

Première version utilisable : shell trois colonnes (sidebar conversations, zone centrale avec onglets Chat / Équipe, colonne droite vide), chat branché sur Ollama local via proxy Vite.

### Décisions

- **Stack** : Vite 6, React 19, TypeScript strict, pas de framework CSS externe (variables CSS + layout responsive basique).
- **Persistance** : conversations et messages dans `localStorage` (`openspace-conversations-v1`) — suffisant pour le MVP ; migration possible vers fichier ou DB plus tard.
- **Ollama** : appels uniquement vers `/api/ollama/*` en dev pour éviter les soucis CORS ; même origine que l’UI.
- **Onglet Équipe** : au premier livrable, texte de substitution uniquement (l’arbre arrive dans l’entrée « suite » le même jour).

### Fichiers clés

- `vite.config.ts` — `server.port = 3004`, `proxy['/api/ollama']` → `127.0.0.1:11434`.
- `src/lib/ollama.ts` — `fetchOllamaModels`, `streamOllamaChat` (NDJSON stream).
- `src/App.tsx` — état conversations, onglet actif, synchro `activeId` si conversation supprimée.
- `src/components/ChatPanel.tsx` — envoi, streaming, abort, sélecteur de modèle.

### Suivi / dette

- Pas de tests automatisés pour l’instant.
- `npm run preview` : port **3004** (aligné sur le dev server).
- Colonne droite : à spécifier (métadonnées agent, fichiers joints, etc.).

### Changelog (condensé)

| Date | Changement |
|------|------------|
| 2026-03-28 | Initialisation projet, UI, chat Ollama, docs, règles Cursor |
| 2026-03-28 | Onglet Équipe : arbre Orchestrateur → agents → sous-agents |
| 2026-03-28 | Équipe : libellés des sous-agents (Designer UI/UX, Développeur, DPO) |
| 2026-03-28 | Équipe : modale « âme et rôle » par nœud, seeds, persistance `openspace-team-souls-v1` |
| 2026-03-28 | UI : thème sombre minimal (zinc), chat type assistant avec bandeau d’accent, compositeur centré |
| 2026-03-28 | Mission équipe : pipeline orchestrateur → agents → sous-agents → README.md + téléchargement |

---

## 2026-03-28 — Mission équipe (orchestration Ollama)

### Objectif

À partir d’un **contexte** et de **fichiers texte**, exécuter dans le navigateur un pipeline multi-étapes : orchestrateur, trois directeurs avec délégation aux sous-agents, synthèses, puis **document Markdown** type README, **téléchargeable**.

### Décisions

- **`completeOllamaChat`** (`stream: false`) pour enchaîner les étapes sans parser plusieurs streams.
- Prompts **system** = textes « âme et rôle » (`loadAgentSouls` + seeds).
- **~11 appels** modèle par mission ; annulation via **`AbortController`**.
- UI : mode **Mission équipe** (défaut) vs **Discussion** dans l’onglet Chat ; `docs/mission-orchestration.md` décrit le flux.

### Fichiers touchés

- `src/orchestration/pipeline.ts`, `src/lib/ollama.ts`, `src/components/MissionWorkspace.tsx`, `src/components/ChatPanel.tsx`, `src/index.css`, `docs/mission-orchestration.md`, `README.md`, `docs/architecture.md`

### Suivi / dette

- Troncature du payload pour les sous-agents (~12k caractères) si contexte énorme.
- Pas de parallélisation des branches (séquentiel pour simplicité et charge machine).

---

## 2026-03-28 — Thème sombre minimal « codes IA »

### Objectif

Interface **sombre**, **épurée** et **simple à lire**, en s’alignant sur les usages habituels des chats IA : contraste maîtrisé, peu de bordures criardes, bulles utilisateur / assistant distinctes, zone de saisie claire, onglets discrets.

### Décisions

- Palette proche **zinc** (`#09090b`, surfaces `#18181b`), texte **hiérarchisé** (`--text`, `--text-secondary`, `--text-tertiary`).
- **Accent** cyan doux (`#7dd3fc`) réservé aux états actifs, focus et CTA — pas de surcharge visuelle.
- Chat : assistant avec **bandeau latéral** (inset box-shadow) ; liste des conversations avec **barre active** à gauche ; **largeur max** du fil pour la lisibilité.
- Modale : léger **backdrop blur**, ombre portée unique.

### Fichiers touchés

- `src/index.css`

---

## 2026-03-28 — Modale « âme et rôle » + seeds agents

### Objectif

Éditer par clic sur chaque nœud de l’arbre une zone de texte décrivant **rôle** et **âme** (prompt métier). Fermeture **Échap** sans enregistrer ; **Entrée** enregistre et ferme ; **Maj+Entrée** = saut de ligne dans la zone.

### Décisions

- Seeds par identifiant de nœud dans `src/data/teamSeeds.ts` (`AGENT_SOUL_SEEDS`).
- Persistance `localStorage` via `src/lib/teamSoulsStorage.ts` (clé `openspace-team-souls-v1`), fusion avec les seeds pour les ids connus.
- Composant `AgentSoulModal.tsx` : `role="dialog"`, raccourcis documentés dans le pied de modale ; clic sur le fond = fermer (comme annuler).

### Fichiers touchés

- `src/components/TeamPanel.tsx`, `src/components/AgentSoulModal.tsx`, `src/data/teamSeeds.ts`, `src/lib/teamSoulsStorage.ts`, `src/index.css`

---

## 2026-03-28 (suite) — Arbre hiérarchique (onglet Équipe)

### Objectif

Afficher un organigramme lisible : **Orchestrateur** en tête, trois **agents** (Directeur Artistique, CTO, Directeur juridique), puis des **sous-agents** par branche.

### Décisions

- Structure de données **`TEAM_HIERARCHY`** dans `TeamPanel.tsx` (pas encore branchée sur Ollama).
- Sous-agents : **Designer UI / UX** (sous DA), **Développeur** (sous CTO), **DPO** (sous Directeur juridique) — un sous-agent par branche pour l’instant.
- Présentation : liste imbriquée `role="tree"` / `treeitem`, repères visuels (bordure gauche, cartes par nœud).

### Fichiers touchés

- `src/components/TeamPanel.tsx`, `src/index.css`

---

## Modèle de mise à jour

Pour chaque session ou PR significative, ajouter une sous-section datée avec : **objectif**, **décisions**, **fichiers touchés**, **dette / suivis**.
