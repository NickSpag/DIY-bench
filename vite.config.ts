import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { diyBenchPlugin } from "./tools/vite-plugin.ts";

export default defineConfig({
  root: "app",
  plugins: [react(), diyBenchPlugin()],
  server: { host: "127.0.0.1", port: 5180, strictPort: false },
  build: { outDir: "../dist", emptyOutDir: true, target: "es2023" },
  // Every dependency is listed up front, so the first page load never triggers a
  // "new dependencies optimized, reloading" full reload.
  optimizeDeps: {
    include: [
      "react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime",
      "zustand", "marked", "three", "@react-three/fiber", "@react-three/drei",
    ],
  },
});
