# OpenSpace Localhost

Interface web locale pour dialoguer avec **Ollama** (Mac Mini ou machine de dev), avec une feuille de route vers une **équipe virtuelle** d’agents.

## Prérequis

- **Node.js** 20+ (LTS recommandé)
- **Ollama** installé et démarré sur la même machine : [https://ollama.com](https://ollama.com)
- Au moins un modèle téléchargé, par exemple :

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

## Fonctionnalités actuelles

- **Colonne gauche** : liste des conversations (titres dérivés du premier message, tri par dernière activité, stockage `localStorage`).
- **Centre** : onglet **Chat** (flux SSE vers Ollama via proxy Vite) et onglet **Équipe** (placeholder pour agents multiples).
- **Colonne droite** : réservée pour de futurs panneaux (contexte, outils, etc.).

## Ollama et proxy

Le navigateur appelle `/api/ollama/...` ; Vite redirige vers `http://127.0.0.1:11434`. Ainsi pas besoin d’exposer Ollama en CORS côté navigateur pendant le développement. Détails dans `docs/ollama.md`.

## Documentation

| Fichier | Rôle |
|--------|------|
| `docs/DEVBOOK.md` | Journal technique, décisions, changelog à tenir à jour |
| `docs/ollama.md` | Intégration API et dépannage |
| `docs/architecture.md` | Structure du code et flux de données |

## Licence

Projet privé / usage local sauf mention contraire.
