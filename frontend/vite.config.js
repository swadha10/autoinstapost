import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/drive": "http://localhost:8000",
      "/caption": "http://localhost:8000",
      "/instagram": "http://localhost:8000",
      "/schedule": "http://localhost:8000",
      "/temp": "http://localhost:8000",
    },
  },
});
