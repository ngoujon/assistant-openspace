# Architecture — OpenSpace Localhost

## Vue d’ensemble

Application **SPA** React montée sur Vite. En **développement**, le serveur Vite sert les assets et proxifie les appels **Mistral** (`/api/mistral`) et **Ollama** (`/api/ollama`). En **Docker**, nginx sert le build statique et les mêmes préfixes (`docs/docker.md`).

```mermaid
flowchart LR
  Browser[Navigateur :3004]
  Vite[Vite dev server]
  Mistral[Mistral API]
  Ollama[Ollama :11434]
  Browser --> Vite
  Vite -->|"/api/mistral/*"| Mistral
  Vite -->|"/api/ollama/*"| Ollama
```

## Interface

Styles globaux dans `src/index.css` : thème sombre minimal (variables CSS), pas de librairie UI. Objectif : lisibilité longue durée et patterns familiers (chat assistant / utilisateur, compositeur en bas).

## Arborescence `src/`

| Élément | Rôle |
|---------|------|
| `App.tsx` | État global : conversations, conversation active, onglet principal, fournisseur LLM, modèle |
| `components/Layout.tsx` | Grille 3 ou 4 colonnes (onglet Équipe : Organisation entre centre et activité) |
| `components/Sidebar.tsx` | Liste conversations + actions |
| `components/ChatPanel.tsx` | Mission équipe ; Discussion orchestrée (`discussionTeamChat`) |
| `lib/discussionTeamChat.ts` | Routage orchestrateur + stream du membre choisi |
| `components/MissionWorkspace.tsx` | Contexte, fichiers, pipeline, aperçu MD, téléchargement |
| `components/TeamWorkspaceContext.tsx` | État partagé équipe (membres, âmes, DnD) |
| `components/TeamOrganisationAside.tsx` | Colonne Organisation (arbre pleine hauteur à gauche de l’activité) |
| `components/TeamCentrePanel.tsx` | Zone centrale Équipe : archives + modale âme/rôle |
| `lib/teamTreeStorage.ts` | Membres, reparentage, profondeur max 3 (`openspace-team-tree-v1`) |
| `lib/teamTreeDisplay.ts` | Conversion liste → arbre d’affichage (`DisplayNode`) |
| `lib/generateMemberSeed.ts` | Appel LLM (Mistral ou Ollama) pour proposer un texte « âme et rôle » |
| `components/AgentSoulModal.tsx` | Modale d’édition (Échap / Entrée / Maj+Entrée) |
| `data/teamSeeds.ts` | Textes initiaux (seeds) par id de nœud |
| `lib/teamSoulsStorage.ts` | Lecture / écriture `openspace-team-souls-v1` |
| `lib/ollama.ts` | Tags Ollama, `streamOllamaChat`, `completeOllamaChat` |
| `lib/mistral.ts` | Modèles Mistral, chat complet et stream (SSE) |
| `lib/llmChat.ts` | `completeLlmChat` / `streamLlmChat` selon le fournisseur |
| `orchestration/pipeline.ts` | `runMissionPipeline` : orchestrateur → branches → README |
| `lib/storage.ts` | Sérialisation conversations `localStorage` |
| `types.ts` | Types partagés |

## Flux Chat (mode Discussion)

1. L’utilisateur envoie un message → enregistrement du message `user`.
2. **`routeDiscussionMessage`** (`src/lib/discussionTeamChat.ts`) : appel non stream avec prompt **orchestrateur** + liste des membres (`loadTeamMembers`) + fil ; réponse JSON `responderId`, `brief`, `userNote`.
3. Création d’une bulle `assistant` avec `speakerLabel` et `routingNote`.
4. **`streamDiscussionReply`** : `system` = âme du membre choisi + consigne orchestrateur ; historique user/assistant en contexte ; streaming des tokens.

## Flux Mission équipe

1. Contexte + fichiers texte ; `loadAgentSouls()` lit les prompts par rôle.
2. `runMissionPipeline` enchaîne des `completeLlmChat` (pas de stream) avec `system` = âme du nœud ; après le brief orchestrateur, un appel optionnel propose un **titre de conversation** (sidebar).
3. Sortie finale : markdown ; téléchargement blob côté client.

Voir `docs/mission-orchestration.md`.

## Évolutions prévues (non codées)

- Paralléliser les branches (3 directeurs) avec limite de concurrence.
- Colonne droite : journal détaillé par agent, pièces jointes enrichies.
