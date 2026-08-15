import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // tsconfig.json usa jsx: "preserve" (para el compilador de Next), pero
  // Vite (rolldown/oxc en esta versión) necesita transformarlo él mismo
  // al correr bajo Vitest — sin esto, cualquier archivo .tsx que un test
  // importe directamente (p.ej. un Server Component) falla a parsear.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "node",
  },
});
