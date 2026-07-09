import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { geocode, type Listing } from "@pepite/core";
import { idbRepository } from "@/lib/repository-idb";
import { runListingPipeline } from "./pipeline";
import { getTabState, resetTabStatesForTests, setTabState } from "./tab-states";

vi.mock("@pepite/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pepite/core")>()),
  geocode: vi.fn(),
  fetchCommuneSales: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/repository-idb", () => ({
  idbRepository: {
    getCache: vi.fn().mockResolvedValue(undefined),
    setCache: vi.fn().mockResolvedValue(undefined),
    getListingByUrl: vi.fn().mockResolvedValue(undefined),
    saveListing: vi.fn().mockResolvedValue(undefined),
  },
}));

function fakeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    url: "https://www.leboncoin.fr/ad/ventes_immobilieres/111",
    site: "leboncoin",
    title: "Maison T4",
    price: 250000,
    location: { rawAddress: "Nantes 44000" },
    description: "",
    photos: [],
    extractedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Listing;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeBrowser.reset();
  resetTabStatesForTests();
  (fakeBrowser.runtime as unknown as { sendMessage: unknown }).sendMessage = vi
    .fn()
    .mockResolvedValue(undefined);
  vi.mocked(idbRepository.getListingByUrl).mockResolvedValue(undefined);
  vi.mocked(geocode).mockResolvedValue(null);
});

describe("runListingPipeline", () => {
  it("ré-applique la localisation corrigée et les notes persistées avant l'analyse", async () => {
    const listing = fakeListing();
    const savedLocation = {
      rawAddress: "12 rue Corrigée, 44000 Nantes",
      locationCorrected: true,
    };
    vi.mocked(idbRepository.getListingByUrl).mockResolvedValue(
      fakeListing({ location: savedLocation, userNotes: "toiture à vérifier" } as Partial<Listing>),
    );

    const quick = await runListingPipeline(1, listing);
    expect(quick).not.toBeNull();
    const state = getTabState(1);
    expect(state?.status).toBe("quick-done");
    expect(state?.listing?.location).toEqual(savedLocation);
    expect(state?.listing?.userNotes).toBe("toiture à vérifier");
    expect(idbRepository.saveListing).toHaveBeenCalledWith(
      expect.objectContaining({ location: savedLocation, userNotes: "toiture à vérifier" }),
    );
  });

  it("résultat périmé (autre annonce a pris l'onglet) → null, l'état de la nouvelle annonce est préservé", async () => {
    const listingA = fakeListing({ url: "https://www.leboncoin.fr/ad/ventes_immobilieres/111" });
    const listingB = fakeListing({ url: "https://www.leboncoin.fr/ad/ventes_immobilieres/222" });
    let resolveGeocode!: (v: null) => void;
    vi.mocked(geocode).mockReturnValueOnce(
      new Promise((r) => (resolveGeocode = r)),
    );

    const pending = runListingPipeline(1, listingA);
    // Laisse le pipeline atteindre le géocodage, puis B prend la main.
    await vi.waitFor(() => expect(geocode).toHaveBeenCalled());
    setTabState(1, { status: "quick-running", listing: listingB });
    resolveGeocode(null);

    await expect(pending).resolves.toBeNull();
    expect(getTabState(1)?.listing?.url).toBe(listingB.url);
  });

  it("échec de l'analyse rapide → état error avec le message, retour null", async () => {
    vi.mocked(geocode).mockRejectedValue(new Error("géocodeur indisponible"));
    const quick = await runListingPipeline(1, fakeListing());
    expect(quick).toBeNull();
    expect(getTabState(1)).toMatchObject({ status: "error", error: "géocodeur indisponible" });
  });
});
