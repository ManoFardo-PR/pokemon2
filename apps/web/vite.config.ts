import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webPort = Number(process.env.WEB_PORT) || 3000;
const apiPort = Number(process.env.API_PORT) || 3001;

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
      "/health": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
