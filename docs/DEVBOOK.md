# Devbook — OpenSpace Localhost

Journal de développement : à **mettre à jour à chaque changement notable** (fonctionnalité, dette technique, incident, décision d’architecture).

---

## 2026-05-10 — Discussion : réponses fil plus concises (3–7 lignes)

### Objectif

Resserrer les consignes routage / stream : plafond **3–7 lignes** dans le fil (au lieu de 5–10), style **télégraphique**, **1–3 questions** max en fin ; constantes exportées `DISCUSSION_FIL_LINES_*` pour aligner prompts et mentions multiples.

### Fichiers

- `src/lib/discussionTeamChat.ts`, `src/components/ChatPanel.tsx`, `docs/DEVBOOK.md`

---

## 2026-05-10 — Compositeur @ : miroir mesuré sur le littéral + curseur hors mention

### Objectif

Corriger la **sensation de zone cassée** après insertion d’une mention : le miroir utilisait une largeur en `ch` (mauvaise avec une police proportionnelle), ce qui **décalait** le curseur par rapport au texte transparent. Le badge repose sur une **copie invisible** du `@[…]` ; le curseur est **repoussé** s’il tombe à l’intérieur d’une mention verrouillée ; **← / →** traversent une mention comme un bloc.

### Fichiers

- `src/components/MentionRichText.tsx`, `src/components/MentionComboboxTextarea.tsx`, `src/index.css`

---

## 2026-05-10 — Mission : rôle pilier / sous-agents (doc + prompt)

### Objectif

Documenter et renforcer le **rôle du pilier après les sous-agents** : synchronisation et ajustements **sans réduction** du contenu, **deuxième lecture** IA avec **vision globale** de tous les livrables du pôle avant le document final.

### Fichiers

- `docs/mission-orchestration.md`, `src/orchestration/pipeline.ts`, `README.md`

---

## 2026-05-10 — Activité : pastille membre, texte d’action seul, couleurs par pôle

### Objectif

Frise mission / discussion : **pastille** = libellé d’**agent ou sous-agent** (résolu via l’arbre équipe) avec **teinte stable** par pôle et variantes pour les sous-agents ; **description** = uniquement le **texte d’action** (sans préfixe « Nom — »). Lignes `Intervenant : …` classées à part avec libellé court.

### Fichiers

- `src/lib/memberStepColors.ts`, `src/lib/parseMissionProgressLine.ts`, `src/components/ActivitySidebar.tsx`, `src/index.css`

---

## 2026-05-10 — Conversations : plus de renommage auto (mission / discussion)

### Objectif

Le **titre** dans la sidebar (liste des conversations) **ne change plus** après la mission (plus d’appel LLM « titre orchestrateur ») ni après les échanges en **Discussion** (plus de titre dérivé du transcript).

### Fichiers

- `src/components/ChatPanel.tsx`, `src/components/MissionWorkspace.tsx`, `src/App.tsx`, `docs/architecture.md`, `docs/mission-orchestration.md`

---

## 2026-05-10 — Seeds équipe : spécialisation stricte + prises de position techniques

### Objectif

Prompts par défaut **Générer un seed** : domaine **principal** déduit du libellé, **hors-périmètre explicite** (ex. backend sans marketing), sous-agent **plus étroit** ; **arguments et choix techniques assumés** dans la discipline ; toujours sans persona fictionnelle.

### Fichiers

- `src/lib/appSettingsStorage.ts`, `src/components/SettingsModal.tsx`, `src/lib/generateMemberSeed.ts` (commentaire)

---

## 2026-05-10 — Discussion : bulles en Markdown (GFM)

### Objectif

Afficher le contenu des messages de **discussion** avec mise en forme Markdown (titres, listes, code, tableaux, citations) tout en conservant les mentions `@[Libellé]` en pastilles.

### Fichiers

- `src/components/DiscussionMessageBody.tsx` (nouveau), `src/components/ChatPanel.tsx`, `src/index.css`, `package.json` (`react-markdown`, `remark-gfm`)

---

## 2026-05-10 — Compositeur @ : miroir aligné + Activité discussion sur un seul fil

### Objectif

- Corriger le **décalage** entre le textarea transparent et le miroir des mentions : le miroir utilisait des badges plus courts que le littéral `@[…]`, ce qui changeait les césures ; affichage métrique + sync `scrollTop` après changement de valeur.
- En mode **Discussion**, afficher **une seule** frise d’étapes (historique mission + session courante) sans bloc ni titre « Discussion (cette session) ».

### Fichiers

- `src/components/MentionRichText.tsx`, `src/components/MentionComboboxTextarea.tsx`, `src/components/ActivitySidebar.tsx`, `src/index.css`

---

## 2026-05-10 — Mission → Discussion : conserver le contexte + transition

### Objectif

À la fin de mission, **reprendre le texte « Contexte »** dans le compositeur Discussion ; bandeau d’aide + animation d’entrée ; défilement doux vers le champ ; reprise du `missionUserBrief` à l’ouverture d’un projet sans messages encore.

### Fichiers

- `src/components/ChatPanel.tsx`, `src/index.css`

---

## 2026-05-10 — Modèle Ollama : sélection dans Paramètres

### Objectif

Aligner Ollama sur Mistral : le **modèle de chat** est choisi dans **Paramètres** (`ollamaChatModel` en localStorage), listé via `fetchOllamaModels` ; suppression du sélecteur dans la barre du chat.

### Fichiers

- `src/lib/appSettingsStorage.ts`, `src/components/SettingsModal.tsx`, `src/App.tsx`, `src/components/ChatPanel.tsx`, `README.md`, `docs/ollama.md`

---

## 2026-05-10 — Mistral AI (défaut) et bascule Ollama

### Objectif

Permettre d’utiliser l’**API Mistral** (cloud) en plus d’**Ollama** local, avec **Mistral par défaut** et la **clé API** saisie dans **Paramètres** (localStorage). Trafic navigateur via `/api/mistral` (proxy Vite / nginx) pour le même motif que Ollama : CORS et déploiement unifié.

### Décisions

- **Routeur** : `src/lib/llmChat.ts` (`completeLlmChat` / `streamLlmChat`) selon `LlmProvider` ; client Mistral dans `src/lib/mistral.ts` (OpenAI-compatible `/v1/chat/completions` + SSE stream).
- **Réglages** : `AppSettings` étendu (`llmProvider`, `mistralApiKey`, `mistralChatModel`, `ollamaChatModel`) dans `src/lib/appSettingsStorage.ts` ; UI dans `SettingsModal`.
- **Clé** : stockée **uniquement côté navigateur** ; le proxy relaie l’en-tête `Authorization` vers `https://api.mistral.ai`.

### Fichiers clés

- `vite.config.ts`, `nginx.conf` — proxy `/api/mistral` → `api.mistral.ai`.
- `src/App.tsx` — chargement modèles selon fournisseur, `refreshLlmModels` après enregistrement des paramètres.

### Changelog (condensé)

| Date | Changement |
|------|------------|
| 2026-05-10 | Conversations : **plus de renommage automatique** après mission ni après discussion (titre sidebar stable) |
| 2026-05-10 | Seeds équipe (défaut) : **spécialisation** métier stricte, hors-sujet explicite, positions techniques ; aide Paramètres mise à jour |
| 2026-05-10 | Mission : doc + prompt **pilier après sous-agents** — synchro sans compression, double lecture, vision globale du pôle |
| 2026-05-10 | Activité : étape **analyse directe** (sans sous-agent) — pastille **membre** uniquement (plus de libellé « Pôle ») ; parse tolérant `—` / `–` / ` - ` |
| 2026-05-10 | Compositeur @ : miroir **sans crochets** — pastille sur **copie invisible du littéral** `@[…]` (plus d’approximation `ch`) + curseur repoussé hors mention + flèches ← → en bloc |
| 2026-05-10 | Discussion : rendu **Markdown** (GFM) dans les bulles — titres, listes, code, tableaux ; mentions `@[…]` conservées ; liens http(s) / relatifs sûrs |
| 2026-05-10 | Discussion : réponses fil **3–7 lignes max**, style télégraphique, **1–3 questions** en fin ; routage / stream / mentions multiples alignés |
| 2026-05-10 | Activité : étapes « neutres » (gris) → pastille **SYSTEME** à la place du point ou d’une pastille vide |
| 2026-05-10 | Compositeur @ : miroir aligné sur le littéral `@[…]` + sync scroll ; Activité discussion : une seule timeline (mission + session) |
| 2026-05-10 | LLM : Mistral AI (défaut) + Ollama local ; clé API dans Paramètres ; proxies `/api/mistral` et doc |
| 2026-05-10 | Mistral : choix du modèle uniquement dans Paramètres (`mistralChatModel`) |
| 2026-05-10 | Ollama : choix du modèle dans Paramètres (`ollamaChatModel`) — plus de sélecteur dans la barre du chat |
| 2026-05-10 | UI : typographie Plus Jakarta Sans, palette / rayons / ombres harmonisés, colonnes latérales vitrées, onglets et bulles de chat affinés |
| 2026-05-10 | Mission : zone glisser-déposer + clic pour fichiers .txt / .md (remplace le bouton « Ajouter des fichiers ») |
| 2026-05-10 | Mission : actions « Lancer / Arrêter » alignées à droite |
| 2026-05-10 | UI : suppression de l’onglet Équipe et de la barre d’onglets (contenu toujours le chat) ; modale âme montée à côté du `ChatPanel` |
| 2026-05-10 | Mentions @ : insertion `@[Libellé]` (plus d’id seul) ; mention verrouillée (pas d’édition partielle, suppression du bloc) ; routage / mission inchangés côté résolution |
| 2026-05-10 | Layout : colonne « Échanges en cours » retirée ; statuts discussion + .md dans **Activité** (bouton téléchargement en bas) |
| 2026-05-10 | Layout : Organisation + Échanges en cours + Activité toujours à droite du contenu (plus réservé à l’onglet Équipe) ; `TeamWorkspaceProvider` global ; `ExchangesSidebar` |
| 2026-05-10 | Activité : ne plus écraser l’état mission/discussion en visitant l’onglet Équipe ; affichage dérivé + mode chat initial selon la conversation |
| 2026-05-10 | Équipe : libellé bouton « Nouveau membre » (sans « sous orchestrateur ») |
| 2026-05-10 | Équipe : archives (icône coffre) à droite du titre « Organisation » ; panneau central sans ce bouton |
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
| 2026-05-10 | Activité (discussion) : texte au-dessus du bouton téléchargement livrable retiré |
| 2026-05-10 | Discussion : `setConversationMessages(id, …)` pour que les mises à jour async ciblent toujours la bonne conversation (évite un fil vide au retour) ; animation `.chat-phase-surface` sans état initial `opacity: 0` |
| 2026-05-10 | Mentions `@[Libellé]` : rendu type badge dans le compositeur (miroir sous le textarea) et dans les bulles de discussion (`MentionRichText`, `splitBracketMentionsForVisual`) |
| 2026-05-10 | Discussion : si livrable + `missionUserBrief` mais fil vide, premier message utilisateur = brief mission (note « Mission équipe ») ; titre sidebar préservé s’il n’est plus « Nouveau projet » ; prompts sans doubler le brief (`missionBriefUnlessEchoedInHistory`) |
| 2026-05-10 | Activité (discussion) : frise d’étapes cumulative (`discussionProgress`) + `MissionStepTimeline` ; journal à chaque envoi (routage, intervenant, stream, fusion) ; reset au changement de projet ; parse mission enrichi pour lignes discussion |
| 2026-05-10 | Mistral : pauses mission / discussion centralisées (`llmRateLimit.ts`) — inter-étape ~780 ms, après titre, entre pilier et sous-agent, routage→stream et stream→fusion |
| 2026-05-10 | Discussion : consignes anti-chatbot (chat minimal, .md prioritaire) ; fusion orchestrateur interprète messages courts + fil multi-intervenants ; plusieurs `@[…]` → routage orchestrateur avec `multiMentionRoutingHint` (un orateur, angles combinés) |

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

## 2026-05-10 — Activité mission persistée par projet

### Objectif

Conserver l’**historique des étapes** de la colonne Activité au **rafraîchissement** et au **changement de projet** : snapshot `missionActivitySnapshot` sur chaque `Conversation` (localStorage), réhydratation du panneau mission et bloc « Mission (historique) » en mode Discussion.

### Fichiers

- `src/types.ts`, `src/lib/storage.ts`, `src/App.tsx`, `src/components/ChatPanel.tsx`, `src/components/ActivitySidebar.tsx`, `src/index.css`

---

## 2026-05-10 — Discussion : fusion livrable automatique, sans bandeau « Livrable lié »

### Objectif

Retirer l’aperçu / actions **Livrable lié** au-dessus du fil ; après chaque tour discussion (stream terminé), si un Markdown existe, lancer **`applyDiscussionToArtifact`** sans message orchestrateur supplémentaire ; le chat porte un **résumé court** des retouches (prompts), le détail reste dans le fichier téléchargé depuis **Activité**.

### Fichiers

- `src/components/ChatPanel.tsx`, `src/lib/discussionTeamChat.ts`, `src/lib/discussionMention.ts` (suppression intention textuelle « appliquer… »)
- `src/index.css`, `README.md`, `docs/architecture.md`

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

> **Évolution** : comportement **désactivé** ensuite — plus de titre LLM après mission ni après discussion (entrée DEVBOOK « Conversations : plus de renommage auto »). L’option `onConversationTitleSuggested` reste dans `runMissionPipeline` pour un usage programmatique éventuel ; l’UI ne l’utilise plus.

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
