# Intégration Mistral AI

## Contexte

L’application peut appeler l’API HTTP **Mistral** (`https://api.mistral.ai`) au format **OpenAI-compatible** (`/v1/models`, `/v1/chat/completions` avec `stream: true` ou `false`).

## Proxy (Vite / nginx)

En développement, `vite.config.ts` mappe le préfixe **`/api/mistral`** vers l’origine API (par défaut `https://api.mistral.ai`). Le client envoie **`Authorization: Bearer <clé>`** ; le proxy transmet la requête sans exposer la clé à un autre domaine côté navigateur que l’origine de l’UI.

En **Docker** (`nginx.conf`), un bloc équivalent relaie `/api/mistral/` vers Mistral en reprenant l’en-tête `Authorization` du client.

Variable optionnelle (tests / endpoint alternatif) : **`OPENSPACE_MISTRAL_API_ORIGIN`** dans `vite.config.ts`.

## Clé API

La clé est **saisie et stockée dans le navigateur** (Paramètres → section « Fournisseur LLM », `localStorage` avec les autres réglages d’app). Elle n’est **pas** lue depuis un `.env` côté build front : pour un secret uniquement serveur, il faudrait un backend qui injecte la clé (non prévu dans cette version).

## Limite de débit (429)

L’API Mistral applique des **quotas** (requêtes par minute / par mois selon l’offre). Une **mission équipe** enchaîne de nombreux appels : en cas de `429` / surcharge (`502` / `503`), le client **`src/lib/mistral.ts`** relance automatiquement après une attente (en-tête **`Retry-After`** si présent, sinon backoff exponentiel, jusqu’à 6 essais). Le pipeline mission insère en outre une **pause courte** entre deux étapes Mistral pour limiter les rafales.

Si l’erreur persiste : attendre quelques minutes, passer sur **Ollama en local** (Paramètres), ou monter de plan côté Mistral.

## Dépannage

| Symptôme | Piste |
|----------|--------|
| Bannière « clé API » / liste vide | Ouvrir Paramètres, coller la clé depuis [console.mistral.ai](https://console.mistral.ai/) |
| 401 | Clé révoquée ou copiée incorrectement |
| « Rate limit » / 429 après attentes | Quotas dépassés — patienter, Ollama local, ou offre supérieure |
| Stream qui s’arrête | Annulation utilisateur, réseau, ou quota / erreur API (message dans la bannière ou l’erreur de chat) |
