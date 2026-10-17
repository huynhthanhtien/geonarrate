import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // dev: gọi API qua proxy để khỏi lo CORS
    proxy: { "/api": "http://localhost:8000", "/healthz": "http://localhost:8000" },
  },
});
