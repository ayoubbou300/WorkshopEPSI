import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En développement (npm run dev), l'API FastAPI est attendue sur localhost:8000.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8000", ws: true },
      "/health": "http://localhost:8000",
    },
  },
});
