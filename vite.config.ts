import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { devtools } from "@tanstack/devtools-vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    // Dev-only TanStack devtools overlay.
    // consolePiping off: its browser↔terminal console relay reflects Vite's own
    // client-log forwarding back and forth (one client console.error echoes forever
    // as nested [Server]/[vite] (client) lines). Overlay/source features unaffected.
    ...(command === "serve" ? [devtools({ consolePiping: { enabled: false } })] : []),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    viteReact(),
    tailwindcss(),
    tsConfigPaths(),
    // Production server bundle for a Node host (VPS): run `npm start`.
    ...(command === "build" ? [nitro({ preset: "node-server" })] : []),
  ],
  server: { host: "::", port: 8080 },
}));
