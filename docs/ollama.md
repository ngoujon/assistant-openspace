# Intégration Ollama

Pour **Mistral AI** (défaut possible dans l’app), voir `docs/mistral.md` et **Paramètres** dans l’UI.

## Contexte

L’application parle à l’API HTTP d’Ollama, normalement exposée sur **`http://127.0.0.1:11434`**.

## Proxy de développement (Vite)

La cible du proxy est **`http://127.0.0.1:11434`** par défaut. Sous **Docker dev** (`docker-compose.dev.yml`), la variable d’environnement **`OPENSPACE_OLLAMA_PROXY_TARGET`** est fixée à `http://host.docker.internal:11434` pour joindre Ollama sur la machine hôte depuis le conteneur.

Dans `vite.config.ts`, les requêtes vers :

- `GET /api/ollama/api/tags` → liste des modèles
- `POST /api/ollama/api/chat` → chat (stream activé côté client)

sont réécrites vers le chemin équivalent sur le port `11434`.

Le code client utilise la constante de base `/api/ollama` dans `src/lib/ollama.ts`.

## Modèles proposés dans l’UI

La liste démarre depuis `/api/tags`, puis exclut les modèles **sans chat** : noms contenant `embed` / `rerank`, ou capacités Ollama `embedding` sans `completion` (via `/api/show`). Ainsi `nomic-embed-text` n’apparaît pas dans la liste **Paramètres** (choix du modèle Ollama).

## Dépannage

| Symptôme | Piste |
|----------|--------|
| Bannière « Ollama indisponible » | Vérifier `ollama serve` / app Ollama lancée ; `curl http://127.0.0.1:11434/api/tags` |
| Liste de modèles vide | `ollama pull <modèle>` |
| Erreur au premier message | Modèle non choisi dans **Paramètres** ou nom incorrect ; vérifier la liste Ollama |
| Stream qui s’arrête net | Réseau, modèle trop lourd, ou annulation utilisateur (bouton Arrêter) |

## Production / hors Vite

Pour un déploiement derrière un seul domaine, il faudra un reverse proxy (nginx, Caddy, etc.) qui mappe le même préfixe vers `127.0.0.1:11434`, ou un petit backend Node qui relaye les appels — **non implémenté** dans cette version.
