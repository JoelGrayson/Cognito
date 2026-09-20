import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.PORT ?? "8787";
  return {
    plugins: [react()],
    server: {
      host: true,
      allowedHosts: [".ngrok-free.app", ".ngrok.app", ".ngrok.io"],
      port: 5173,
      proxy: { "/api": `http://localhost:${apiPort}` },
    },
  };
});
