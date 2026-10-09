import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: { main: "web/index.html", wallets: "web/wallet-integrations.html", siLab: "web/si-lab.html" } }
  }
});
