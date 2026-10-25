import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// O build vai direto para a interface do Jarvis, que abre o Work num iframe.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../jarvis/ui/work",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    // Duas páginas: o Work (index.html) e o Brain (brain.html), com o three.js compartilhado.
    rollupOptions: {
      input: { main: "index.html", brain: "brain.html" },
    },
  },
});
