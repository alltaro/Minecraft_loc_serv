import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const apiPort = process.env.MINEPANEL_API_PORT ?? "3031";
const webPort = Number(process.env.MINEPANEL_WEB_PORT ?? 1421);

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: true,
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: false,
        headers: {
          // Le navigateur n'envoie pas toujours Origin pour une requête
          // same-origin ; le proxy local authentifie alors cette requête.
          origin: "http://localhost:1420",
        },
      },
    },
  },
});
