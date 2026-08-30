import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bieniciAdId, fetchBienici, parseBieniciAd } from "./bienici";

/**
 * Payload réel de https://www.bienici.com/realEstateAd.json?id=immo-facile-57156771
 * capturé le 2026-08-28 (champs de contact retirés).
 */
const fixture = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures/bienici-realEstateAd.json"),
    "utf8",
  ),
) as Record<string, unknown>;

const REAL_URL =
  "https://www.bienici.com/annonce/vente/le-tampon/appartement/3pieces/immo-facile-57156771";

describe("bieniciAdId", () => {
  it("extrait l'identifiant du dernier segment d'une URL d'annonce", () => {
    expect(bieniciAdId(REAL_URL)).toBe("immo-facile-57156771");
  });

  it("tolère une barre oblique finale et une query string", () => {
    expect(bieniciAdId(`${REAL_URL}/?utm_source=x`)).toBe("immo-facile-57156771");
  });

  it("renvoie null hors page d'annonce", () => {
    expect(bieniciAdId("https://www.bienici.com/recherche/achat/le-tampon")).toBeNull();
  });
});

describe("parseBieniciAd", () => {
  it("extrait les champs principaux du payload réel", () => {
    const listing = parseBieniciAd(fixture, REAL_URL);
    expect(listing.site).toBe("bienici");
    expect(listing.url).toBe(REAL_URL);
    expect(listing.title).toBe(
      "LE TAMPON CENTRE-VILLE : T3, 2 chambres, résidence sécurisée avec garage",
    );
    expect(listing.price).toBe(139900);
    expect(listing.surface).toBe(67.8);
    expect(listing.rooms).toBe(3);
    expect(listing.bedrooms).toBe(2);
    expect(listing.propertyType).toBe("Appartement");
    expect(listing.description).toMatch(/PRMI/);
  });

  it("extrait la localisation, le quartier et les coordonnées floutées", () => {
    const { location } = parseBieniciAd(fixture, REAL_URL);
    expect(location.city).toBe("Le Tampon");
    expect(location.postalCode).toBe("97430");
    expect(location.district).toBe("Centre-ville");
    expect(location.rawAddress).toBe("Le Tampon 97430 Centre-ville");
    expect(location.lat).toBeCloseTo(-21.2736, 3);
    expect(location.lon).toBeCloseTo(55.5245, 3);
    // blurInfo est un disque de 50 m : précision approximative, pas une adresse.
    expect(location.precision).toBe("district");
  });

  it("ignore les classes DPE/GES non renseignées (« NS », « VI »)", () => {
    const listing = parseBieniciAd(fixture, REAL_URL);
    expect(listing.dpe).toBeUndefined();
    expect(listing.ges).toBeUndefined();
  });

  it("ignore une publicationDate à l'époque Unix et retombe sur modificationDate", () => {
    // L'annonce réelle porte publicationDate = 1970-01-01T00:00:00.000Z (import auto).
    expect(parseBieniciAd(fixture, REAL_URL).publishedAt).toBe("2026-08-27T14:29:07.018Z");
  });

  it("préfère publicationDate quand elle est réelle", () => {
    const ad = { ...fixture, publicationDate: "2026-06-02T09:00:00.000Z" };
    expect(parseBieniciAd(ad, REAL_URL).publishedAt).toBe("2026-06-02T09:00:00.000Z");
  });

  it("collecte les URLs de photos", () => {
    const { photos } = parseBieniciAd(fixture, REAL_URL);
    expect(photos.length).toBeGreaterThan(0);
    expect(photos[0]).toMatch(/^https:\/\/file\.bienici\.com\/photo\//);
  });

  it("expose les caractéristiques exploitables en attributs", () => {
    const attrs = parseBieniciAd(fixture, REAL_URL).attributes ?? [];
    const byLabel = Object.fromEntries(attrs.map((a) => [a.label, a.value]));
    expect(byLabel["Étage"]).toBe("2 sur 5");
    expect(byLabel["Ascenseur"]).toBe("oui");
    expect(byLabel["Année de construction"]).toBe("2007");
    expect(byLabel["Charges de copropriété"]).toBe("1 159 €/an");
    expect(byLabel["Lots de copropriété"]).toBe("360");
    expect(byLabel["Parking fermé"]).toBe("1");
    expect(byLabel["Salles d'eau"]).toBe("2");
    expect(byLabel["WC"]).toBe("1");
    expect(byLabel["Honoraires"]).toBe("à la charge du vendeur");
    expect(byLabel["Référence"]).toBe("7648KE");
  });

  it("signale une copropriété en procédure et tait l'absence de procédure", () => {
    const sain = parseBieniciAd(fixture, REAL_URL).attributes ?? [];
    expect(sain.some((a) => a.label === "Procédure copropriété")).toBe(false);

    const enProcedure = parseBieniciAd(
      {
        ...fixture,
        isCondominiumInProcedure: true,
        condominiumDetailedProcedure: "Mandat ad hoc",
      },
      REAL_URL,
    ).attributes;
    expect(enProcedure).toContainEqual({ label: "Procédure copropriété", value: "Mandat ad hoc" });
  });

  it("n'invente pas d'attribut pour un champ absent", () => {
    const { yearOfConstruction, ...ad } = fixture;
    const attrs = parseBieniciAd(ad, REAL_URL).attributes ?? [];
    expect(attrs.some((a) => a.label === "Année de construction")).toBe(false);
  });

  it("mappe propertyType « house » sur Maison", () => {
    const listing = parseBieniciAd({ ...fixture, propertyType: "house" }, REAL_URL);
    expect(listing.propertyType).toBe("Maison");
  });

  it("jette quand le payload n'a pas de prix exploitable", () => {
    const { price, ...ad } = fixture;
    expect(() => parseBieniciAd(ad, REAL_URL)).toThrow(/prix/i);
  });

  it("jette quand le payload n'est pas un objet", () => {
    expect(() => parseBieniciAd("nope", REAL_URL)).toThrow(/payload/i);
  });
});

describe("fetchBienici", () => {
  it("interroge realEstateAd.json avec l'identifiant de l'URL", async () => {
    const calls: string[] = [];
    const fetchFn = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const listing = await fetchBienici(REAL_URL, { fetchFn });

    expect(calls).toEqual([
      "https://www.bienici.com/realEstateAd.json?id=immo-facile-57156771",
    ]);
    expect(listing.price).toBe(139900);
    expect(listing.url).toBe(REAL_URL);
  });

  it("jette quand l'URL ne porte pas d'identifiant d'annonce", async () => {
    const fetchFn = (async () => new Response("{}")) as typeof fetch;
    await expect(
      fetchBienici("https://www.bienici.com/recherche/achat/le-tampon", { fetchFn }),
    ).rejects.toThrow(/identifiant/i);
  });

  it("jette sur réponse HTTP en erreur", async () => {
    const fetchFn = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    await expect(fetchBienici(REAL_URL, { fetchFn })).rejects.toThrow(/404/);
  });
});
