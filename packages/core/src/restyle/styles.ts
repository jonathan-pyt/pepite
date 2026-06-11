/** Preset de style déco proposé dans le studio Restyle IA. */
export interface RestyleStyle {
  /** Nom affiché — sert aussi d'identifiant de preset. */
  nom: string;
  /** Paire de couleurs hex pour les pastilles du chip (maquette screen7). */
  colors: [string, string];
  /** Description du style en français, injectée dans le prompt Gemini. */
  description: string;
}

export const RESTYLE_STYLES: RestyleStyle[] = [
  {
    nom: "Scandinave",
    colors: ["#e8e2d6", "#b8a88f"],
    description:
      "Style scandinave : bois clair (chêne, bouleau), murs blanc cassé, textiles en laine et lin aux tons écrus et beiges, mobilier épuré aux lignes douces, luminaires en papier ou rotin, quelques plantes vertes. Ambiance lumineuse, chaleureuse et apaisante.",
  },
  {
    nom: "Industriel",
    colors: ["#4a4a4f", "#a0522d"],
    description:
      "Style industriel : briques apparentes ou enduit brut, structures et luminaires en métal noir type atelier (suspensions à abat-jour métallique, ampoules à filament apparent), bois recyclé aux teintes brunes, canapé en cuir cognac. Palette anthracite, rouille et brun, réchauffée par des textiles sobres : plaid en grosse maille, tapis sombre à poils ras. Ambiance loft urbain au caractère affirmé.",
  },
  {
    nom: "Minimaliste",
    colors: ["#f2f1ee", "#c9c9c4"],
    description:
      "Style minimaliste : palette monochrome blanc cassé et grège, surfaces lisses sans ornement, mobilier bas aux lignes géométriques nettes, rangements intégrés discrets, très peu d'objets décoratifs. Éclairage indirect et architectural (spots encastrés, lampe sculpturale unique), textiles unis et mats — rideaux tombant au sol, tapis ras ton sur ton. Ambiance épurée, calme, presque galerie d'art.",
  },
  {
    nom: "Haussmannien moderne",
    colors: ["#e9e4da", "#1f3a5f"],
    description:
      "Style haussmannien moderne : moulures et corniches mises en valeur, parquet point de Hongrie, murs clairs rehaussés d'un pan bleu nuit profond, mobilier contemporain design, grand miroir ancien au-dessus d'une cheminée en marbre si présente. Suspension design ou lustre revisité au centre du plafond, appliques et touches de laiton, rideaux en velours ou lin épais. Ambiance parisienne chic, contraste classique-contemporain.",
  },
  {
    nom: "Bohème",
    colors: ["#d9b48f", "#7a8b6f"],
    description:
      "Style bohème : matières naturelles (rotin, jute, macramé), textiles à motifs ethniques superposés, palette terracotta, ocre et vert olive, abondance de plantes vertes, tapis berbères, mobilier chiné dépareillé. Suspensions en rotin ou bambou tressé, lampes d'appoint à lumière chaude, coussins et plaids accumulés sur le canapé. Ambiance voyageuse, décontractée et chaleureuse.",
  },
  {
    nom: "Japandi",
    colors: ["#ded5c4", "#3d3a34"],
    description:
      "Style japandi : fusion entre épure japonaise et chaleur scandinave, bois clair et bois fumé, mobilier bas aux lignes horizontales, palette sable, taupe et brun foncé, céramiques artisanales, paravents ou cloisons ajourées en bois. Luminaires en papier washi ou bambou à lumière douce, textiles naturels — lin froissé, coton lavé, jeté de lit ton pierre. Ambiance zen, sobre et naturelle.",
  },
  {
    nom: "Campagne chic",
    colors: ["#ece5d3", "#8f9c7a"],
    description:
      "Style campagne chic : poutres et bois patiné, palette crème, beige et vert sauge, mobilier de ferme revisité, vaisselier et céramique blanche, bouquets de fleurs séchées, pierre naturelle. Suspensions en osier ou lanternes en métal vieilli, textiles généreux en lin lavé et coton gaufré — rideaux légers, nappes et coussins aux rayures discrètes. Ambiance maison de campagne raffinée et apaisante.",
  },
];

/** Retrouve un preset par son nom exact, ou `undefined` s'il n'existe pas. */
export function getRestyleStyle(nom: string): RestyleStyle | undefined {
  return RESTYLE_STYLES.find((s) => s.nom === nom);
}
