# Devbook — OpenSpace Localhost

Journal de développement : à **mettre à jour à chaque changement notable** (fonctionnalité, dette technique, incident, décision d’architecture).

---

## 2026-05-10 — Mistral AI (défaut) et bascule Ollama

### Objectif

Permettre d’utiliser l’**API Mistral** (cloud) en plus d’**Ollama** local, avec **Mistral par défaut** et la **clé API** saisie dans **Paramètres** (localStorage). Trafic navigateur via `/api/mistral` (proxy Vite / nginx) pour le même motif que Ollama : CORS et déploiement unifié.

### Décisions

- **Routeur** : `src/lib/llmChat.ts` (`completeLlmChat` / `streamLlmChat`) selon `LlmProvider` ; client Mistral dans `src/lib/mistral.ts` (OpenAI-compatible `/v1/chat/completions` + SSE stream).
- **Réglages** : `AppSettings` étendu (`llmProvider`, `mistralApiKey`, `mistralChatModel`) dans `src/lib/appSettingsStorage.ts` ; UI dans `SettingsModal`.
- **Clé** : stockée **uniquement côté navigateur** ; le proxy relaie l’en-tête `Authorization` vers `https://api.mistral.ai`.

### Fichiers clés

- `vite.config.ts`, `nginx.conf` — proxy `/api/mistral` → `api.mistral.ai`.
- `src/App.tsx` — chargement modèles selon fournisseur, `refreshLlmModels` après enregistrement des paramètres.

### Changelog (condensé)

| Date | Changement |
|------|------------|
| 2026-05-10 | LLM : Mistral AI (défaut) + Ollama local ; clé API dans Paramètres ; proxies `/api/mistral` et doc |
| 2026-05-10 | Mistral : choix du modèle uniquement dans Paramètres (`mistralChatModel`) ; barre du chat réservée au sélecteur Ollama |
| 2026-05-10 | UI : typographie Plus Jakarta Sans, palette / rayons / ombres harmonisés, colonnes latérales vitrées, onglets et bulles de chat affinés |
| 2026-05-10 | Mission : zone glisser-déposer + clic pour fichiers .txt / .md (remplace le bouton « Ajouter des fichiers ») |
| 2026-05-10 | Mission : actions « Lancer / Arrêter » alignées à droite |
| 2026-05-10 | Équipe : « Nouveau membre » à droite du titre « Organisation » |
| 2026-05-10 | Équipe : colonne Organisation pleine hauteur à gauche de l’activité (`shell-org`, `TeamWorkspaceProvider`) |
| 2026-05-10 | Archives équipe : confirmation Restaurer / Supprimer via modale `ConfirmDialog` (plus de `window.confirm`) |
| 2026-05-10 | Archives équipe : accès par icône coffre → modale (nom, liste, actions) ; modale âme au-dessus (`modal-overlay--soul`) |
| 2026-05-10 | Mentions `@` : combobox (↑ ↓ Entrée) dans Discussion et Mission équipe ; préfixe brief mission (`buildMissionMentionPrefix`) ; sync équipe via `openspace-team-updated` |
| 2026-05-10 | Discussion : file d’attente au-dessus du compositeur (compteur, repli, édition, retrait) ; envoi séquentiel après réponse ou « Arrêter » |
| 2026-05-10 | Chat projet : plus d’onglets Mission / Discussion ; mission au départ puis passage auto en discussion après livrable ; libellé de phase non cliquable |
| 2026-05-10 | Discussion : persistance `missionUserBrief` + contexte routage/stream/fusion ; consignes anti-recopie du livrable dans le chat |
| 2026-05-10 | Mistral : retries 429/502/503 + `Retry-After` ; pause mission entre étapes ; pause courte routage → stream |
| 2026-05-10 | UI : `.chat-input` pleine largeur (`width: 100%`, `box-sizing`) + file discussion `align-items: stretch` |
| 2026-05-10 | Discussion : suppression du paragraphe d’aide sous le livrable (`discussion-routing-hint`) |
| 2026-05-10 | Discussion : suppression du message vide (`chat-empty`) au-dessus du fil |

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
| 2026-03-28 | Équipe : arbre éditable (ajout, DnD), seeds Ollama depuis la modale, pipeline aligné sur l’arbre |
| 2026-03-28 | Docker : image nginx + build Vite, port 3004, proxy Ollama vers hôte |
| 2026-03-28 | Ollama : liste de modèles filtrée (exclut embedding, ex. nomic-embed-text) |
| 2026-03-28 | Discussion : routage par orchestrateur, réponse du membre le plus qualifié |
| 2026-05-09 | Équipe : archives nommées (arbre + âmes), restauration depuis `openspace-team-archives-v1` |
| 2026-05-09 | Docker dev : `docker-compose.dev.yml` + Vite sur 3004 (HMR), proxy Ollama via `OPENSPACE_OLLAMA_PROXY_TARGET` |
| 2026-05-09 | Paramètres : engrenage sidebar, prompts seed Ollama éditables (`openspace-app-settings-v1`) |
| 2026-05-09 | Gabarit seed par défaut : structure type OpenClaw (contexte / mission / format / contraintes) |
| 2026-05-09 | Gabarit seed : orientation assistant métier (Rôle + Pratiques et standards), sans persona |
| 2026-05-10 | Activité : téléchargement du livrable .md (mission terminée ou discussion avec livrable) ; utilitaire `downloadMarkdown` ; prompts mission — angles « hors premier jet » |
| 2026-05-10 | Mission : rapport final sans section annexes / fiches contributeurs (prompt orchestrateur final) |
| 2026-05-10 | Changement de conversation : Activité / mission alignés sur le projet (key mission, reset état, abort discussion) |
| 2026-05-10 | Mission : titre de conversation (sidebar) proposé par l’orchestrateur après le brief initial |

---

## 2026-03-28 — Discussion orchestrée

### Objectif

Le mode **Discussion** ne parle plus au modèle de façon anonyme : l’utilisateur s’adresse à **l’équipe**, l’**orchestrateur** choisit **qui répond** (ou répond pour synthèse / compte rendu), avec textes « âme » depuis l’onglet Équipe.

### Fichiers

- `src/lib/discussionTeamChat.ts`, `src/components/ChatPanel.tsx`, `src/types.ts`, `src/index.css`, docs.

---

## 2026-03-28 — Docker (nginx, port 3004)

### Objectif

Exécuter l’app dans un conteneur, **accessible sur le port 3004**, avec relais vers **Ollama sur l’hôte** comme en dev Vite.

### Décisions

- **Multi-stage** : `node:22-alpine` pour `npm ci` + `npm run build`, puis `nginx:alpine` pour servir `dist/` et proxy `/api/ollama/` → `host.docker.internal:11434`.
- **`docker-compose.yml`** : `extra_hosts` pour Linux (`host-gateway`).
- **`.dockerignore`** : exclut `node_modules`, `dist`, etc.

### Fichiers

- `Dockerfile`, `nginx.conf`, `docker-compose.yml`, `.dockerignore`, `docs/docker.md`

### Complément — exFAT / `._.cursor`

Docker lit les xattr sur tous les chemins du contexte : les fichiers `._*` sur exFAT provoquent `operation not permitted`. Script `scripts/docker-up.sh` + `npm run docker:up` suppriment ces fichiers avant `docker compose`.

---

## 2026-03-28 — Équipe dynamique + génération de seed

### Objectif

Créer des **membres** sous l’orchestrateur, les **réorganiser par glisser-déposer** (sous l’orchestrateur ou sous un agent), ouvrir la **modale** pour l’âme/rôle, et **générer un seed** via Ollama à partir du **nom** et de la **place** dans l’équipe.

### Décisions

- Stockage plat `TreeMember` + `openspace-team-tree-v1` ; affichage en arbre via `membersToDisplayTree`.
- **Profondeur max** : orchestrateur → pilier → sous-agent (pas de sous-sous-agent). Un nœud qui a des **enfants** ne peut pas être déposé sous un agent.
- **Souls** : `saveAgentSouls` persiste **toutes** les clés (ids UUID inclus).
- **Mission** : `runMissionPipeline` itère sur les enfants directs de l’orchestrateur puis leurs enfants (0 à N sous-agents par pilier).

### Fichiers touchés

- `src/lib/teamTreeStorage.ts`, `src/lib/teamTreeDisplay.ts`, `src/lib/generateMemberSeed.ts`, `src/components/TeamOrganisationAside.tsx`, `TeamCentrePanel.tsx`, `TeamWorkspaceContext.tsx`, `src/components/AgentSoulModal.tsx`, `src/orchestration/pipeline.ts`, `src/App.tsx`, `src/index.css`, docs.

---

## 2026-03-28 — Mission équipe (orchestration Ollama)

### Objectif

À partir d’un **contexte** et de **fichiers texte**, exécuter dans le navigateur un pipeline multi-étapes : orchestrateur, trois directeurs avec délégation aux sous-agents, synthèses, puis **document Markdown** type README, **téléchargeable**.

### Décisions

- **`completeLlmChat`** (`stream: false`) pour enchaîner les étapes sans parser plusieurs streams (Ollama ou Mistral).
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

- `src/components/TeamOrganisationAside.tsx`, `TeamCentrePanel.tsx`, `TeamWorkspaceContext.tsx`, `src/components/AgentSoulModal.tsx`, `src/data/teamSeeds.ts`, `src/lib/teamSoulsStorage.ts`, `src/index.css`

---

## 2026-03-28 (suite) — Arbre hiérarchique (onglet Équipe)

### Objectif

Afficher un organigramme lisible : **Orchestrateur** en tête, trois **agents** (Directeur Artistique, CTO, Directeur juridique), puis des **sous-agents** par branche.

### Décisions

- Structure de données **`TEAM_HIERARCHY`** dans `teamSeeds` / arbre Équipe (pas encore branchée sur Ollama).
- Sous-agents : **Designer UI / UX** (sous DA), **Développeur** (sous CTO), **DPO** (sous Directeur juridique) — un sous-agent par branche pour l’instant.
- Présentation : liste imbriquée `role="tree"` / `treeitem`, repères visuels (bordure gauche, cartes par nœud).

### Fichiers touchés

- `src/components/TeamOrganisationAside.tsx`, `TeamCentrePanel.tsx`, `TeamWorkspaceContext.tsx`, `src/index.css`

---

## 2026-05-09 — Archives d’équipe

### Objectif

Pouvoir **sauvegarder des compositions** (organigramme + textes « âme ») sous un **nom**, les consulter dans une liste et **restaurer** l’équipe active sans perdre les variantes précédentes.

### Décisions

- Persistance navigateur : `localStorage` clé **`openspace-team-archives-v1`** — tableau d’entrées `{ id, name, createdAt, members, souls }`.
- Chaque archive est une **copie figée** au moment de l’archivage ; **Restaurer** remplace l’équipe active (`openspace-team-tree-v1` + `openspace-team-souls-v1` via les effets existants du panneau).
- Les âmes restaurées reprennent les valeurs archivées ; pour un membre sans entrée dans l’archive (migration rare), retombée sur les seeds `AGENT_SOUL_SEEDS` si l’id est connu.

### Fichiers touchés

- `src/lib/teamArchiveStorage.ts`, `src/components/TeamArchiveSection.tsx`, `src/components/TeamOrganisationAside.tsx`, `TeamCentrePanel.tsx`, `TeamWorkspaceContext.tsx`, `src/index.css`

---

## 2026-05-09 — Paramètres et prompts « Générer un seed »

### Objectif

Permettre de **personnaliser les messages** envoyés à Ollama pour la **génération de seed** (fiche âme / rôle), depuis une **modale Paramètres** ouverte via une icône à côté du titre OpenSpace.

### Décisions

- Persistance **`openspace-app-settings-v1`** : `seedSystemPrompt`, `seedUserTemplate` avec placeholders `{{memberLabel}}` et `{{place}}`.
- `generateMemberSoulSeed` lit `loadAppSettings()` à chaque appel.

### Fichiers touchés

- `src/lib/appSettingsStorage.ts`, `src/lib/generateMemberSeed.ts`, `src/components/SettingsModal.tsx`, `src/components/Sidebar.tsx`, `src/App.tsx`, `src/index.css`

---

## 2026-05-09 — Docker : Vite avec HMR sur le port 3004

### Objectif

Trouver sur **http://localhost:3004** les changements du code **en temps réel** sans `docker compose build` à chaque modification.

### Décisions

- **`docker-compose.dev.yml`** : service `openspace-dev` (`node:22-alpine`), volume projet + volume nommé pour `node_modules`, commande `npm ci && npm run dev`.
- **`vite.config.ts`** : `server.host: true` ; proxy Ollama configurable par **`OPENSPACE_OLLAMA_PROXY_TARGET`** (Docker → `host.docker.internal:11434`) ; **`CHOKIDAR_USEPOLLING`** pour la fiabilité du watch sur certains montages ; **`OPENSPACE_DOCKER_DEV`** pour la config HMR côté navigateur (`localhost:3004`).
- Scripts npm : `docker:dev`, `docker:dev:d`, `docker:dev:down`.

### Fichiers touchés

- `docker-compose.dev.yml`, `vite.config.ts`, `package.json`, `docs/docker.md`, `docs/ollama.md`, `README.md`

---

## 2026-05-10 — Livrable depuis Activité + prompts « angles oubliés »

### Objectif

Rapprocher l’UI du flux « recherche multi-agents → cahier des charges Markdown » : accès au téléchargement depuis la colonne **Activité** (sidebar et bandeau inline), et renforcer les consignes orchestrateur / spécialistes pour explorer ce que l’utilisateur n’a pas dit dans son premier message.

### Fichiers

- `src/lib/downloadMarkdown.ts` — `triggerMarkdownDownload`, `markdownFilenameFromConversationTitle`
- `src/components/ActivitySidebar.tsx`, `src/App.tsx`, `src/components/ChatPanel.tsx`, `src/components/MissionWorkspace.tsx`, `src/index.css`
- `src/orchestration/pipeline.ts` — brief orchestrateur + consignes sous-agent / pôle solo

---

## 2026-05-10 — Rapport final sans fiches contributeurs

### Objectif

Le document généré en fin de mission ne doit plus imposer une section **Annexes — fiches contributeurs** : la matière reste dans le corps du rapport (analyses par domaine).

### Fichiers

- `src/orchestration/pipeline.ts` — `buildFinalDocumentPrompt`

---

## 2026-05-10 — Titre de conversation après brief mission

### Objectif

Dès le début d’une mission, renommer automatiquement l’entrée dans la **liste des conversations** (sidebar) avec un titre court généré par l’orchestrateur, à partir du brief initial et du contexte.

### Fichiers

- `src/lib/discussionTeamChat.ts` — `generateMissionConversationTitle`
- `src/orchestration/pipeline.ts` — option `onConversationTitleSuggested`, comptage d’étapes
- `src/components/MissionWorkspace.tsx`, `src/components/ChatPanel.tsx`
- `docs/mission-orchestration.md`, `docs/architecture.md`

---

## 2026-05-10 — Activité synchronisée sur la conversation active

### Objectif

Nouveau projet ou changement de conversation : la colonne **Activité** (mission / discussion) et le formulaire **Mission équipe** ne doivent plus afficher l’état du projet précédent.

### Décisions

- `MissionWorkspace` remonté par `key={conversation.id}` (état contexte / résultat / progression isolés par conversation).
- Au changement de `conversation.id` : annulation des envois Discussion en cours, réinitialisation streaming / routage ; si la conversation est vide, retour sur l’onglet **Mission équipe**.
- En mode Mission, réinitialisation explicite de `rightActivity` vers une mission « vide » jusqu’à ce que le nouveau `MissionWorkspace` pousse la progression.
- `MissionWorkspace` : `useEffect` de cleanup qui appelle `abort()` sur le contrôleur pour interrompre une mission si le composant est démonté (changement de projet).

### Fichiers

- `src/components/ChatPanel.tsx`, `src/components/MissionWorkspace.tsx`

---

## Modèle de mise à jour

Pour chaque session ou PR significative, ajouter une sous-section datée avec : **objectif**, **décisions**, **fichiers touchés**, **dette / suivis**.
