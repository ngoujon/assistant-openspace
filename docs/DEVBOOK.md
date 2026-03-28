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

---

## 2026-03-28 (suite) — Arbre hiérarchique (onglet Équipe)

### Objectif

Afficher un organigramme lisible : **Orchestrateur** en tête, trois **agents** (Directeur Artistique, CTO, Directeur juridique), puis des **sous-agents** par branche.

### Décisions

- Structure de données **`TEAM_HIERARCHY`** dans `TeamPanel.tsx` (pas encore branchée sur Ollama).
- Sous-agents : libellés métier génériques par pôle (modifiables sans changer la hiérarchie).
- Présentation : liste imbriquée `role="tree"` / `treeitem`, repères visuels (bordure gauche, cartes par nœud).

### Fichiers touchés

- `src/components/TeamPanel.tsx`, `src/index.css`

---

## Modèle de mise à jour

Pour chaque session ou PR significative, ajouter une sous-section datée avec : **objectif**, **décisions**, **fichiers touchés**, **dette / suivis**.
