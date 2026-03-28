# OpenSpace Localhost

Interface web locale branchée sur **Ollama** : **mission d’équipe virtuelle** (orchestrateur, directeurs, sous-agents) qui produit un **README Markdown** téléchargeable, plus un mode **discussion** libre avec le modèle.

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

## Fonctionnalités principales

### Mission équipe (onglet Chat, mode par défaut)

- Saisie d’un **contexte** et ajout de **fichiers texte** (.txt, .md).
- Enchaînement **Orchestrateur → 3 directeurs → 3 sous-agents → synthèses → document final**, chaque étape via Ollama en local.
- Les **personas** sont ceux définis dans l’onglet **Équipe** (clic sur un rôle → texte « âme et rôle », stocké dans le navigateur).
- **Télécharger le .md** une fois la mission terminée.

### Discussion

- Même onglet **Chat**, mode **Discussion** : conversation directe avec le modèle (streaming).

### Équipe

- Arbre **modifiable** : nouveaux membres sous l’orchestrateur, **glisser-déposer** sous l’orchestrateur ou sous un agent, suppression.
- Modale **âme / rôle** par membre, avec bouton **Générer un seed** (Ollama, selon le nom et la place dans l’équipe — choisir le modèle dans l’onglet Chat).

### Autres

- **Colonne gauche** : conversations (mode Discussion), persistance `localStorage`.
- **Colonne droite** : réservée pour extensions.

## Ollama et proxy

Le navigateur appelle `/api/ollama/...` ; Vite redirige vers `http://127.0.0.1:11434`. Détails dans `docs/ollama.md`. Le mode mission utilise des appels **non stream** (`completeOllamaChat`) ; la discussion utilise le **stream** classique.

## Documentation

| Fichier | Rôle |
|--------|------|
| `docs/DEVBOOK.md` | Journal technique et changelog |
| `docs/mission-orchestration.md` | Pipeline mission, limites, fichiers concernés |
| `docs/ollama.md` | API et dépannage |
| `docs/architecture.md` | Structure du code |

## Licence

Projet privé / usage local sauf mention contraire.
