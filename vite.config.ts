import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { diyBenchPlugin } from "./tools/vite-plugin.ts";

export default defineConfig({
  root: "app",
  plugins: [react(), diyBenchPlugin()],
  server: { host: "127.0.0.1", port: 5180, strictPort: false },
  build: { outDir: "../dist", emptyOutDir: true },
});
