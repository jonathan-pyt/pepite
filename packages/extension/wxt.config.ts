import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Pépite — analyse immobilière",
    permissions: ["storage", "sidePanel", "tabs"],
    host_permissions: [
      "https://data.geopf.fr/*",
      "https://files.data.gouv.fr/*",
      "https://*.io.cloud.ovh.net/*",
      "https://generativelanguage.googleapis.com/*",
      "https://api.anthropic.com/*",
      "https://api.openai.com/*",
    ],
  },
});
