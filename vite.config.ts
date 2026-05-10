import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** En local : Ollama sur la machine. Sous Docker dev : sur l’hôte via host.docker.internal (voir docker-compose.dev.yml). */
const ollamaProxyTarget =
  process.env.OPENSPACE_OLLAMA_PROXY_TARGET ?? "http://127.0.0.1:11434";

const mistralApiOrigin =
  process.env.OPENSPACE_MISTRAL_API_ORIGIN ?? "https://api.mistral.ai";

/** Même config pour `npm run dev` et `npm run preview` (le preview n’hérite pas du proxy dev). */
const llmDevProxy = {
  "/api/ollama": {
    target: ollamaProxyTarget,
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api\/ollama/, ""),
  },
  "/api/mistral": {
    target: mistralApiOrigin,
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/api\/mistral/, ""),
  },
} as const;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  preview: {
    port: 3004,
    strictPort: true,
    proxy: { ...llmDevProxy },
  },
  server: {
    host: true,
    port: 3004,
    strictPort: true,
    watch:
      process.env.CHOKIDAR_USEPOLLING === "true"
        ? { usePolling: true, interval: 300 }
        : undefined,
    hmr:
      process.env.OPENSPACE_DOCKER_DEV === "true"
        ? { host: "localhost", port: 3004, clientPort: 3004 }
        : undefined,
    proxy: { ...llmDevProxy },
  },
});
