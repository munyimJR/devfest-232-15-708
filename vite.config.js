import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" keeps every asset path relative, so the build works on any static host.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  // pdf-lib alone is ~500 kB minified; the whole app is one ~270 kB gzip bundle.
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    include: ["tests/**/*.test.js"],
    environment: "node",
  },
});
