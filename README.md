# OpenSpace Localhost

Interface web locale pour une **mission d’équipe virtuelle** (orchestrateur, directeurs, sous-agents) qui produit un **README Markdown** téléchargeable, plus un mode **Discussion** orchestré par l’équipe (routage via l’orchestrateur). Par défaut l’inférence passe par **Mistral AI** (API cloud) ; tu peux basculer sur **Ollama** local dans **Paramètres**.

## Prérequis

- **Node.js** 20+ (LTS recommandé)
- **Mistral AI** (défaut) : compte sur [console.mistral.ai](https://console.mistral.ai/) et clé API collée dans **Paramètres** (stockage local du navigateur).
- **Optionnel — Ollama** si tu choisis ce fournisseur dans Paramètres : [https://ollama.com](https://ollama.com) démarré sur la machine, et au moins un modèle, par exemple :

```bash
ollama pull llama3.2
```

## Démarrage

```bash
npm install
npm run dev
```

L’application écoute sur **[http://localhost:3004](http://localhost:3004)**.

En production locale après build :

```bash
npm run build
npm run preview
```

Le port **3004** est configuré pour `npm run dev` et `npm run preview`.

## Docker (port 3004)

### Rechargement à chaud (recommandé pendant le dev)

Sans reconstruire l’image nginx : Vite dans Docker avec les sources montées.

```bash
npm run docker:dev
```

Puis **http://localhost:3004**. Arrêt : `Ctrl+C` ou `npm run docker:dev:down`. Ne pas lancer en parallèle du mode production ci-dessous (même port).

### Image nginx (build statique)

Depuis un volume **exFAT** (ex. disque externe), préfère :

```bash
npm run docker:up
```

Sinon :

```bash
docker compose up --build -d
```

Puis **http://localhost:3004**. Ollama doit être **lancé sur l’hôte** (le conteneur s’y connecte via `host.docker.internal:11434`). Détails, Linux et dépannage `._.cursor` : `docs/docker.md`.

## Fonctionnalités principales

### Mission équipe puis Discussion

- À l’ouverture d’une **nouvelle conversation** (ou d’un projet sans historique ni livrable), l’écran affiche la **mission** : contexte, fichiers .txt / .md, lancement du pipeline.
- Enchaînement **Orchestrateur → 3 directeurs → 3 sous-agents → synthèses → document final**, chaque étape via le **fournisseur LLM** choisi (Mistral ou Ollama).
- Les **personas** sont ceux définis dans l’onglet **Équipe** (clic sur un rôle → texte « âme et rôle », stocké dans le navigateur).
- **Télécharger le .md** une fois la mission terminée ; dès qu’un **livrable** est produit, l’interface passe **automatiquement** en **Discussion** (plus de bascule manuelle Mission / Discussion).
- En **Discussion** : message à **toute l’équipe** ; l’**orchestrateur** désigne le **membre le plus qualifié** (ou répond lui-même pour synthèse / compte rendu si pertinent ou demandé), puis réponse en streaming avec l’âme de ce membre.
- Rouvrir une conversation qui a déjà des **messages** ou un **livrable** ouvre directement la Discussion.

### Équipe

- L’**arbre** est visible en permanence dans la colonne **Organisation** (à droite du contenu) : nouveaux membres sous l’orchestrateur, **glisser-déposer** sous l’orchestrateur ou sous un agent, suppression.
- **Clic sur un membre** : modale **âme / rôle** ; bouton **Générer un seed** (LLM configuré — modèle Ollama dans la barre du chat si besoin).

### Autres

- **Colonne gauche** : conversations, persistance `localStorage` ; icône **Paramètres** à droite du titre OpenSpace (fournisseur LLM, clé Mistral, prompts pour **Générer un seed**).
- **À droite du chat** : **Organisation** (arbre) puis **Activité** (mission : étapes, durée ; en discussion : routage / stream ; bouton **Télécharger le .md** en bas de la colonne).

## Proxy LLM

- **Mistral** (défaut) : `/api/mistral/...` → `https://api.mistral.ai` (voir `docs/mistral.md`).
- **Ollama** : `/api/ollama/...` → `http://127.0.0.1:11434` en local (voir `docs/ollama.md`).

Le mode mission utilise des appels **non stream** ; la discussion utilise le **stream** (NDJSON côté Ollama, SSE côté Mistral).

## Documentation

| Fichier | Rôle |
|--------|------|
| `docs/DEVBOOK.md` | Journal technique et changelog |
| `docs/mission-orchestration.md` | Pipeline mission, limites, fichiers concernés |
| `docs/mistral.md` | API Mistral, clé, proxy |
| `docs/ollama.md` | API Ollama et dépannage |
| `docs/architecture.md` | Structure du code |
| `docs/docker.md` | Image Docker, compose, Ollama hôte |

## Licence

Projet privé / usage local sauf mention contraire.
