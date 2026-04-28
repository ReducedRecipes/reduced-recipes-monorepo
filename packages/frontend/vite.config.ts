import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

const rootPkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
);

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
    "__APP_VERSION__": JSON.stringify(rootPkg.version),
  },
});
