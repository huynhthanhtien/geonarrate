import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const { BACKEND_PROXY_URL } = loadEnv(mode, process.cwd(), "BACKEND_PROXY_");
  const target = BACKEND_PROXY_URL || "http://127.0.0.1:8000";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: { "/api": target, "/healthz": target },
    },
  };
});
