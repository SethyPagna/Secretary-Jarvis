import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const BACKEND = process.env.JARVIS_DASHBOARD_URL ?? "http://127.0.0.1:9119";

/**
 * In production the Python desktop backend injects a one-shot session token
 * into `index.html` (see `jarvis_cli/web_server.py`). The Vite dev server
 * serves its own `index.html`, so unless we forward that token, protected
 * `/api/*` calls return 401.
 *
 * This plugin fetches the running desktop backend's `index.html` on each dev
 * page load, scrapes the `window.__JARVIS_SESSION_TOKEN__` assignment, and
 * re-injects it into the dev HTML. No-op in production builds.
 */
function jarvisDevToken(): Plugin {
  const TOKEN_RE = /window\.__JARVIS_SESSION_TOKEN__\s*=\s*"([^"]+)"/;

  return {
    name: "jarvis:dev-session-token",
    apply: "serve",
    async transformIndexHtml() {
      try {
        const res = await fetch(BACKEND, { headers: { accept: "text/html" } });
        const html = await res.text();
        const match = html.match(TOKEN_RE);
        if (!match) {
          console.warn(
            `[jarvis] Could not find session token in ${BACKEND} - ` +
              `is the JARVIS desktop backend running? /api calls will 401.`,
          );
          return;
        }
        return [
          {
            tag: "script",
            injectTo: "head",
            children: `window.__JARVIS_SESSION_TOKEN__="${match[1]}";`,
          },
        ];
      } catch (err) {
        console.warn(
          `[jarvis] Desktop backend at ${BACKEND} unreachable - ` +
            `start JARVIS or set JARVIS_DASHBOARD_URL. ` +
            `(${(err as Error).message})`,
        );
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), jarvisDevToken()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@": path.resolve(__dirname, "..", "src"),
    },
    // When @jarvis_managed-research/ui is symlinked via `file:../../design-language`,
    // Node's module resolution would pick up shared deps from
    // design-language/node_modules/*, giving us two copies and breaking hooks
    // (useRef-of-null), webgl contexts, etc. Force packages that exist in both
    // places to use the desktop app's copy.
    //
    // Do not list packages here that only exist in the design system
    // (nanostores, @nanostores/react). Vite dedupe errors out when it cannot
    // find them at the project root.
    dedupe: [
      "react",
      "react-dom",
      "@react-three/fiber",
      "@observablehq/plot",
      "three",
      "leva",
      "gsap",
    ],
  },
  build: {
    outDir: "../jarvis_cli/web_dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (
            id.includes("/three/") ||
            id.includes("@react-three") ||
            id.includes("/leva/") ||
            id.includes("/gsap/")
          ) {
            return "orb-runtime";
          }

          if (id.includes("@xterm/")) {
            return "terminal-runtime";
          }

          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router-dom/")
          ) {
            return "react-runtime";
          }
        },
      },
    },
    chunkSizeWarningLimit: 1100,
  },
  server: {
    proxy: {
      "/api": {
        target: BACKEND,
        ws: true,
      },
      // Same host as the JARVIS desktop backend must serve these. Vite has no
      // dashboard-plugins/* files, so plugin scripts would otherwise 404 or
      // receive index.html in dev.
      "/dashboard-plugins": BACKEND,
    },
  },
});
