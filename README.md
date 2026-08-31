# Assistant OpenSpace

Une petite app macOS qui ouvre une **équipe virtuelle** — un orchestrateur, ses directeurs
de pôle, leurs spécialistes — et la fait travailler sur une mission jusqu'à en sortir **un
livrable Markdown unique**, rangé dans un dossier ordinaire.

C'est Claude Code, avec une fenêtre au lieu du terminal : chaque membre de l'organigramme
est un **sous-agent** du Claude Agent SDK, et son texte « âme et rôle » est son prompt
système. Tu écris la mission, l'équipe passe, tu récupères le document — puis tu discutes
avec eux pour le retoucher, version après version.

## Utilisation

L'app est installée dans `/Applications/Assistant OpenSpace.app` et épinglée au Dock.
Un clic l'ouvre, la croix la masque (elle reste dans le Dock), `⌘Q` la quitte.

| Raccourci | Effet |
|---|---|
| `↩` | envoyer |
| `⇧↩` | nouvelle ligne |
| `esc` | refuser la carte en attente, sinon interrompre |
| `⌘.` | interrompre |
| `⌘N` | nouvelle mission |
| `⌘L` | afficher / masquer les missions |
| `⌘D` | afficher / masquer l'équipe et les livrables |
| `⌘E` | gérer les équipes |
| `⌘⇧A` | joindre des fichiers |
| `⌘⇧O` | ouvrir le dossier des livrables |
| `⌘0` | largeur de fenêtre par défaut |

À l'ouverture, l'app **reprend la mission précédente** : elle se souvient de ce que vous
vous êtes dit ce matin. Le bouton `+` repart de zéro.

## L'ordre de travail

C'est toute la valeur de l'outil, et ce n'est pas une recommandation : c'est **imposé** par
des hooks `PreToolUse` (`src/agent/gardes.mjs`), parce que le prompt seul ne suffisait pas —
le modèle finissait toujours par écrire le document tout seul en résumant ce qu'il
« imaginait » que chaque pôle aurait dit.

1. **Cadrer et titrer.** L'orchestrateur reformule la demande et nomme la mission
   (`titrer_mission`) : c'est ce que tu reliras dans la liste dans trois semaines.
2. **Les spécialistes, en parallèle.** Un `Agent` par spécialiste, tous dans le même
   message. Chacun défriche son angle et rend une matière dense, finie par
   `## Points ouverts`. L'app ramène chaque convocation **au premier plan** : une
   convocation en arrière-plan finirait le tour avant que le membre ait répondu, et le
   directeur passerait sur du vide.
3. **Les directeurs, ensuite.** Un pôle convoqué **avant** ses spécialistes est **refusé**.
   Et son brief doit contenir **leurs textes entiers** : si le brief fait moins de 45 % de
   ce que ses spécialistes ont écrit, l'appel est refusé aussi — c'est exactement ce qu'un
   résumé ferait perdre. Le directeur recoupe, arbitre, complète : il intègre, il ne compile pas.
4. **Le livrable.** `rediger_livrable` est **refusé** tant qu'un pôle n'a rien rendu, et la
   liste des manquants est donnée au modèle, qui va les chercher. Même un « rien à signaler »
   doit venir du pôle concerné.
5. **On ne rend pas la main au milieu.** Une mission commencée puis abandonnée — des pôles
   convoqués, aucun document — ne te laisse rien. Un hook `Stop` renvoie l'orchestrateur au
   travail avec la liste de ce qui manque, jusqu'à quatre fois par message. Une simple
   discussion, elle, se termine normalement : rien ne se déclenche si personne n'a été convoqué.
6. **La discussion.** Une retouche ne remobilise personne : si la demande touche un métier,
   l'orchestrateur convoque **ce membre-là**, seul, et republie.

Les contributions ne sont pas déclarées par le modèle : elles sont **mesurées** à la sortie
de chaque `Agent`. Le générique du livrable (« Équipe mobilisée ») ne peut donc pas mentir.

## Les équipes

Tu en gardes **plusieurs**, dont une seule travaille : une refonte de site et un appel
d'offres ne se traitent pas avec les mêmes métiers. Le sélecteur en tête de la colonne de
droite dit laquelle est au travail ; **Gérer…** (ou `⌘E`) ouvre le gestionnaire.

- **Utiliser** bascule : c'est cette équipe-là que les missions suivantes feront travailler.
- **Dupliquer** copie l'organigramme et ses âmes pour le faire évoluer sans toucher à l'original.
- Le nom se change en place, dans la liste.
- **+ Nouvelle équipe** repart de l'équipe type ; **Partir de l'équipe actuelle** copie celle
  qui travaille. La dernière équipe ne se supprime pas — il en faut toujours une.

Changer d'équipe **repart sur un contexte neuf** : les sous-agents sont déclarés au démarrage
de la session. Les missions déjà écrites et leurs livrables ne bougent pas.

## L'organigramme

La colonne de droite est l'organigramme de l'équipe active, et c'est le seul vrai réglage de l'app.

- **`+`** sur l'orchestrateur ajoute un pôle, sur un pôle ajoute un spécialiste. Le nom se
  tape **directement sur la carte**, `↩` valide, `esc` annule : aucune fenêtre ne s'ouvre,
  on enchaîne. Double-clic sur un nom pour le corriger de la même façon.
- **Clic sur un membre** : sa fiche — nom, rattachement, et son texte **âme et rôle**, celui
  qui deviendra son prompt système. `⌘↩` enregistre, `esc` ferme.
- **Proposer une âme** : un appel court et isolé (un tour, aucun outil) écrit la fiche à ta
  place, en tenant compte de qui l'entoure dans l'équipe. Tu relis, tu corriges.
- Un membre qu'on vient de créer prend l'**identifiant de son vrai nom** dès qu'on le
  renomme (« Direction financière » → `direction-financiere`) : c'est ce que l'orchestrateur
  emploie pour le convoquer. Dès qu'il a une âme, l'identifiant se fige.
- **Glisser-déposer** pour rattacher ailleurs. Trois niveaux, pas quatre : un spécialiste
  n'encadre personne, et un pôle qui encadre ne peut pas devenir spécialiste.
- Pendant une mission, chaque membre porte son état en direct : *au travail*, *a rendu*,
  *en échec*.

Modifier l'organigramme **repart sur un contexte neuf** : les sous-agents sont déclarés au
démarrage de la session, une équipe changée en cours de route laisserait des sessions
branchées sur un organigramme qui n'existe plus. Le contexte de chaque mission, lui, est
enregistré : rien n'est perdu.

## Les sources que tu apportes

Le champ de saisie prend tout ce que tu lui donnes — c'est la matière de la mission.

- **Glisse tes fichiers** n'importe où dans la fenêtre, clique le trombone, ou fais `⌘⇧A` :
  images, PDF, audio, vidéo, tableurs, code, archives. Une capture **collée** depuis le
  presse-papiers est enregistrée comme les autres.
- **Colle des liens** dans le texte : ils sont listés au message comme des sources à ouvrir,
  et l'orchestrateur les lit avec `WebFetch` avant de répondre. Un lien glissé depuis le
  navigateur atterrit dans le champ.
- Chaque pièce est **copiée** dans les données de la mission : elle reste lisible même si tu
  déplaces l'original, et un fil rouvert dans trois semaines retrouve ses pièces. Jusqu'à
  512 Mo par fichier.
- Le message emporte les **chemins absolus** : `Read` ouvre images, PDF et tout ce qui est
  texte ; pour un audio ou une vidéo, l'agent passe par `Bash` (`ffprobe`, `ffmpeg`, `sips`).
  Si l'outil manque sur la machine, il le dit au lieu d'inventer.
- L'orchestrateur **transmet ces sources à l'équipe** : le chemin exact va dans le brief du
  membre concerné, qui l'ouvre lui-même. Un directeur artistique qui doit juger une maquette
  a besoin du fichier, pas d'une description.
- Une pièce sans un mot vaut une demande : « regarde ça ».

## Le livrable

Un `.md` ordinaire, dans `~/OpenSpace` (changeable dans les réglages ⚙).

- Le **sommaire** et le bloc **« À propos de ce livrable »** sont composés par l'app, pas par
  le modèle : une table des matières qui ment est pire que pas de table.
- Republier sur le même fichier crée une **nouvelle version**. L'ancienne part dans
  `Versions/`, consultable et restaurable. **Rien n'est écrasé, donc rien n'est à valider** —
  c'est ce qui permet de retoucher un document en discussion sans confirmer trois fois.
- La colonne **Livrables** montre ceux de la mission ouverte (ou tout le dossier), avec
  leurs versions, l'ouverture dans ton éditeur Markdown, l'export et le Finder.

## Les cartes de validation

En **autonomie** (par défaut), l'équipe mène la mission de bout en bout : convoquer,
publier, retoucher, tout part seul. Une seule carte subsiste — **supprimer un livrable**,
parce que ça emporte tout son historique — et le fichier part à la corbeille du Mac.

En mode **prudent**, une carte s'ouvre avant `Bash`, avant une écriture de fichier hors du
dossier des livrables, et avant un effacement. Au clavier, quand une carte attend : **`↩`
autorise**, **`esc` refuse**. `↩` n'autorise que si le champ de saisie est vide — sinon la
phrase en cours part comme message, elle ne valide rien par accident.

Les règles d'organisation, elles, ne sont **pas** des permissions : elles s'appliquent dans
les deux modes.

## Écrire pendant qu'ils travaillent

Le champ de saisie n'est jamais bloqué. Un message envoyé pendant un traitement est **fondu
dans le tour en cours** : l'orchestrateur le lit en route et refait son plan avec. La bulle
porte la mention *pris en compte à la prochaine étape*.

Le bouton reste **envoyer** tant qu'il y a du texte ; il ne devient **arrêter** que si le
champ est vide (sinon `esc` ou `⌘.`).

**Deux missions peuvent tourner en même temps** (`src/agent/pool.mjs`). Changer de mission
dans la colonne de gauche **n'interrompt rien** : ça ne change que ce qu'on regarde. Une
troisième demande attend son tour, et part dès qu'une place se libère.

## Réglages

| Réglage | Effet |
|---|---|
| **Orchestrateur** | le modèle de la session principale (Opus 5 par défaut) |
| **L'équipe travaille avec** | le modèle des sous-agents : le même, ou plus rapide pour une mission large |
| **Ampleur du livrable** | note (~1 200 mots) · document (~3 000) · dossier (~7 500) — cale aussi ce qu'on attend de chaque membre |
| **Langue de rédaction** | français par défaut |
| **Autonomie** | seul, ou avec des cartes avant les actions sensibles |
| **Dossier des livrables** | `~/OpenSpace` par défaut |

Changer l'ampleur, la langue, l'autonomie ou le modèle de l'équipe repart sur une mission
neuve : ces règles vivent dans les consignes du système.

## Architecture

```
src/main.mjs              processus principal Electron : fenêtre, IPC, permissions, config
src/preload.cjs           pont contextIsolation (aucun accès Node côté page)
src/agent/session.mjs     session Claude Agent SDK : options, routage, permissions, mesure des contributions
src/agent/prompt.mjs      les six règles de l'orchestrateur (PROMPT_VERSION à incrémenter si elles changent)
src/agent/equipe.mjs      l'organigramme devient des sous-agents (AgentDefinition, une âme par prompt)
src/agent/gardes.mjs      hooks PreToolUse : l'ordre de passage et le livrable nourri par l'équipe
src/agent/outils.mjs      serveur MCP interne : livrables, versions, titre, organigramme
src/agent/pool.mjs        deux missions de front, la file d'attente, la navigation qui n'interrompt rien
src/agent/ame.mjs         « Proposer une âme » : un appel isolé, un tour, aucun outil
src/agent/resume.mjs      les demandes de validation, en français lisible
src/espace/equipe.mjs     les équipes nommées, leurs organigrammes et leurs âmes ; celle qui est active
src/espace/pieces.mjs     les pièces jointes : copie, reconnaissance du type, chemins passés à l'agent
src/espace/livrables.mjs  les .md, le sommaire, le générique, les versions
src/espace/missions.mjs   un fichier par mission : le fil rejouable et la session à reprendre
src/espace/paths.mjs      où vivent les données et les livrables
src/espace/journal.mjs    journal technique (l'app lancée depuis le Dock n'a pas de terminal)
src/renderer/             la fenêtre : index.html, app.js, style.css, markdown.js
scripts/                  icône, build, installation, tests
```

Où vivent les choses :

| Quoi | Où |
|---|---|
| Livrables | `~/OpenSpace` (et `~/OpenSpace/Versions`) |
| Équipes, missions, pièces jointes, réglages | `~/Library/Application Support/Assistant OpenSpace` |
| Journal de bord | `~/Library/Application Support/Assistant OpenSpace/journal.log` |

Le fichier `equipes.json` est lisible et modifiable à la main (menu **Mission → Ouvrir le
fichier des équipes**) : c'est un JSON, il se sauvegarde et se copie d'une machine à l'autre.
Une installation qui vient d'une version précédente reprend son `equipe.json` et ses
compositions archivées : chacune devient une équipe de la bibliothèque.

## Développement

```bash
npm install
npm start          # lance l'app depuis les sources
npm test           # équipes, gardes, livrables, missions, pièces jointes — sans réseau
npm run selftest   # une vraie mission de bout en bout, dans un dossier temporaire
npm run build      # « Assistant OpenSpace.app » dans build/
npm run install-app # reconstruit, installe dans /Applications, épingle au Dock
npm run icon       # régénère assets/icon.icns (rendu CoreGraphics, scripts/make-icon.swift)
```

`npm test` ne touche ni au réseau ni à tes données : chaque script travaille dans un dossier
temporaire (`OPENSPACE_DATA_DIR`, `OPENSPACE_LIVRABLES`). `npm run selftest` démarre une
vraie session avec une équipe réduite à deux membres et vérifie l'ordre de passage complet —
spécialiste, puis directeur, puis livrable.

`OPENSPACE_DEBUG=1 npm start` renvoie la sortie d'erreur de Claude Code dans le terminal.

## Licence

Projet privé, usage local.
