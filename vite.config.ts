import { defineConfig } from "vite";

// GitHub Pages project site: https://bucinamazin.github.io/Parlaybot/
// Local dev leaves VITE_BASE unset so the app stays at /.
const base = process.env.VITE_BASE || "/";

export default defineConfig({
  base,
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
