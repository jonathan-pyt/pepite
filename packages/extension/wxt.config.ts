import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { HOST_PERMISSIONS } from "./lib/host-permissions";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // WXT cible MV2 par défaut pour Firefox : on force MV3 partout
  // (sans effet sur Chrome, déjà MV3 par défaut).
  manifestVersion: 3,
  hooks: {
    // Firefox ne connaît pas use_dynamic_url (généré par WXT pour Chrome) et
    // affiche « An unexpected property was found » à l'install : on retire la
    // clé du manifest Firefox.
    "build:manifestGenerated": (wxt, manifest) => {
      if (wxt.config.browser !== "firefox") return;
      for (const entry of manifest.web_accessible_resources ?? []) {
        if (typeof entry === "object" && "use_dynamic_url" in entry) {
          delete entry.use_dynamic_url;
        }
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: "Pépite — analyse immobilière",
    description:
      "Score prix vs marché (DVF), analyse IA et aide à la négociation sur les annonces Leboncoin, SeLoger, Bien'ici et Citya.",
    // Icône d'outils active (épinglable) ; sur Chrome, le clic ouvre le side
    // panel via setPanelBehavior(openPanelOnActionClick) déjà posé au démarrage.
    action: {
      default_title: "Pépite — analyse immobilière",
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
      },
    },
    // Firefox n'a pas l'API sidePanel (la sidebar passe par sidebar_action,
    // que WXT génère depuis l'entrypoint sidepanel) : la permission n'y existe pas.
    permissions:
      browser === "firefox" ? ["storage", "tabs"] : ["storage", "sidePanel", "tabs"],
    host_permissions: HOST_PERMISSIONS,
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "pepite@jonathan-pyt.github.io",
          // storage.session ≥ 115, MV3/sidebar stables — marge prise à 121.
          strict_min_version: "121.0",
          // Déclaration AMO : le développeur ne collecte aucune donnée (cf. PRIVACY.md).
          data_collection_permissions: { required: ["none"] },
        },
      },
    }),
  }),
});
