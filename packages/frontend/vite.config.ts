import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@rr/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  define: {
    "import.meta.env.VITE_API_BASE": JSON.stringify(
      process.env.VITE_API_BASE ?? "https://reducedrecipes.com"
    ),
  },
});
