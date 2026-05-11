# Intégration Mistral AI

## Contexte

L’application peut appeler l’API HTTP **Mistral** (`https://api.mistral.ai`) au format **OpenAI-compatible** (`/v1/models`, `/v1/chat/completions` avec `stream: true` ou `false`).

## Proxy (Vite / nginx)

En développement, `vite.config.ts` mappe le préfixe **`/api/mistral`** vers l’origine API (par défaut `https://api.mistral.ai`). Le client envoie **`Authorization: Bearer <clé>`** ; le proxy transmet la requête sans exposer la clé à un autre domaine côté navigateur que l’origine de l’UI.

En **Docker** (`nginx.conf`), un bloc équivalent relaie `/api/mistral/` vers Mistral en reprenant l’en-tête `Authorization` du client.

Variable optionnelle (tests / endpoint alternatif) : **`OPENSPACE_MISTRAL_API_ORIGIN`** dans `vite.config.ts`.

## Clé API

La clé est **saisie et stockée dans le navigateur** (Paramètres → section « Fournisseur LLM », `localStorage` avec les autres réglages d’app). Elle n’est **pas** lue depuis un `.env` côté build front : pour un secret uniquement serveur, il faudrait un backend qui injecte la clé (non prévu dans cette version).

## Température (Paramètres)

Avec **Mistral AI** sélectionné, un curseur **Température (0 à 1)** règle la variabilité des réponses pour le chat, les missions, la fusion du livrable en discussion et la génération de seeds (`mistralTemperature` dans les paramètres persistés). **Ollama** conserve ses températures internes (non exposées dans cette modale).

## Limite de débit (429)

L’API Mistral applique des **quotas** (requêtes par minute / par mois selon l’offre). Une **mission équipe** enchaîne de nombreux appels : en cas de `429` / surcharge (`502` / `503`), le client **`src/lib/mistral.ts`** relance automatiquement après une attente (en-tête **`Retry-After`** si présent, sinon backoff exponentiel, jusqu’à 6 essais).

Côté **espacement des requêtes** (Mistral uniquement), les constantes dans **`src/lib/llmRateLimit.ts`** pilotent : pause après chaque étape mission (`MISTRAL_MISSION_INTER_STEP_MS`), après le titre sidebar avant les pôles (`MISTRAL_MISSION_AFTER_TITLE_MS`), entre consignes pilier et travail sous-agent (`MISTRAL_MISSION_LEAD_TO_SUB_MS`), et en discussion entre routage → stream et stream → fusion livrable (`MISTRAL_DISCUSSION_*`).

Si l’erreur persiste : attendre quelques minutes, passer sur **Ollama en local** (Paramètres), ou monter de plan côté Mistral.

## Dépannage

| Symptôme | Piste |
|----------|--------|
| Bannière « clé API » / liste vide | Ouvrir Paramètres, coller la clé depuis [console.mistral.ai](https://console.mistral.ai/) |
| 401 | Clé révoquée ou copiée incorrectement |
| « Rate limit » / 429 après attentes | Quotas dépassés — patienter, Ollama local, ou offre supérieure |
| Stream qui s’arrête | Annulation utilisateur, réseau, ou quota / erreur API (message dans la bannière ou l’erreur de chat) |
