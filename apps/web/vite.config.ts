import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Use relative asset paths so Electron file:// loads packaged assets correctly.
  base: "./",
  plugins: [react()],
  server: {
    port: 5174
  }
});
