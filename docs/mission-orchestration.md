# Mission équipe — orchestration LLM

## Flux utilisateur

1. Onglet **Chat** → mode **Mission équipe** (par défaut).
2. Saisir un **contexte** et/ou joindre des fichiers **.txt** / **.md**.
3. **Lancer la mission** : enchaînement d’appels à Ollama, sans stream (`stream: false`).
4. À la fin : aperçu du **README Markdown** généré et bouton **Télécharger le .md**.

## Pipeline (ordre)

| Étape | Acteur | Rôle |
|-------|--------|------|
| 1 | Orchestrateur | Analyse contexte + fichiers, brief par pôle (Artistique, Technique, Juridique). |
| 1b | Orchestrateur | Titre court pour renommer la conversation dans la **sidebar** (liste des projets). |
| 2 | Chaque directeur (pilier) | Consignes au ou aux sous-agents du pôle. |
| 3 | Chaque sous-agent | Travail spécialisé (extrait du contexte/fichiers, tronqué si très long). |
| 4 | Chaque directeur (pilier) | **Après** tous les sous-agents du pôle : reçoit **l’ensemble** de leurs livrables ; **synchronise** (cohérence, doublons, trous) et **ajuste** **sans réduire** le contenu utile — double relecture IA avec **vision globale** du pôle avant le document final. |
| 5 | Orchestrateur | Document unique type **README.md** pour lecteur externe. |

Les **textes « âme et rôle »** configurés dans l’onglet **Équipe** (modale par nœud) sont injectés comme **system prompts** pour chaque appel correspondant.

### Rôle du pilier par rapport aux sous-agents (étape 4)

Le **pilier** intervient **après** les sous-agents qui lui sont rattachés : il voit **toutes** leurs versions de travail. Cela permet une **synchronisation** des informations entre spécialistes du même pôle **sans compression** abusive du texte : le modèle relit, recoupe, corrige ou complète, puis livre une matière encore **dense** pour l’orchestrateur. C’est une **deuxième passe** (relecture / arbitrage) au niveau du pôle, avec **connaissance globale** de ce que chaque sous-agent a produit, afin que le rapport final puisse s’appuyer sur un ensemble **cohérent** plutôt que sur des silos disjoints.

## Équipe dynamique

L’arbre (membres sous l’orchestrateur, sous-agents sous les piliers) est lu depuis `loadTeamMembers()` au moment du lancement. Toute modification dans l’onglet **Équipe** (ajout, glisser-déposer, noms) est donc prise en compte pour la mission suivante. Des **archives nommées** permettent de sauvegarder une composition (arbre + âmes) et de la restaurer plus tard (`src/lib/teamArchiveStorage.ts`).

## Fichiers code

- `src/orchestration/pipeline.ts` — `runMissionPipeline` (boucle sur les piliers et leurs enfants).
- `src/lib/llmChat.ts` — `completeLlmChat` (réponse complète, pas de SSE ; Ollama).
- `src/lib/teamTreeStorage.ts` — persistance de l’arbre `openspace-team-tree-v1`.
- `src/components/MissionWorkspace.tsx` — UI contexte, fichiers, progression, téléchargement.

## Coût / performance

Environ **11** requêtes modèle pour une équipe type à trois pôles avec un sous-agent chacun (1 brief + 3×3 + 1 document final) — **sans** appel LLM pour renommer la conversation. Prévoir un modèle raisonnablement rapide sur machine locale ; le bouton **Arrêter la mission** annule via `AbortController`.

## Limites

- Pas de serveur backend : tout s’exécute dans le navigateur.
- Très gros fichiers : le rappel côté sous-agent est tronqué (~12k caractères) pour limiter la taille des prompts.
