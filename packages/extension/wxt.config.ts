import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Pépite — analyse immobilière",
    description:
      "Score prix vs marché (DVF), analyse IA et aide à la négociation sur les annonces Leboncoin, SeLoger, Bien'ici et Citya.",
    permissions: ["storage", "sidePanel", "tabs"],
    host_permissions: [
      "https://data.geopf.fr/*",
      "https://files.data.gouv.fr/*",
      "https://*.io.cloud.ovh.net/*",
      "https://generativelanguage.googleapis.com/*",
      "https://api.anthropic.com/*",
      "https://api.openai.com/*",
      "https://overpass-api.de/*",
      "https://overpass.osm.ch/*",
      "https://www.georisques.gouv.fr/*",
      "https://www.data.gouv.fr/*",
      "https://static.data.gouv.fr/*",
    ],
  },
});
