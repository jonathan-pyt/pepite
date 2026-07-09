import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { extractListingGeneric, geocode, type Listing, type QuickAnalysis } from "@pepite/core";
import { hasLlmPermission } from "@/lib/llm-permission";
import type { PepiteRequest } from "@/lib/messages";
import { idbRepository } from "@/lib/repository-idb";
import { getSettings, type Settings } from "@/lib/settings";
import { EXTRACTION_FAILED_MESSAGE, handleMessage, onRuntimeMessage } from "./handlers";
import { runListingPipeline } from "./pipeline";
import { getTabState, resetTabStatesForTests, setTabState } from "./tab-states";

vi.mock("@pepite/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pepite/core")>()),
  extractListingGeneric: vi.fn(),
  generateNegotiationEmails: vi.fn(),
  analyzeListing: vi.fn(),
  geocode: vi.fn(),
}));

vi.mock("./pipeline", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pipeline")>()),
  runListingPipeline: vi.fn(),
  resolvePoint: vi.fn(),
}));

vi.mock("@/lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settings")>()),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/llm-permission", () => ({ hasLlmPermission: vi.fn() }));

vi.mock("@/lib/repository-idb", () => ({
  idbRepository: {
    getCache: vi.fn().mockResolvedValue(undefined),
    setCache: vi.fn().mockResolvedValue(undefined),
    getListingByUrl: vi.fn().mockResolvedValue(undefined),
    saveListing: vi.fn().mockResolvedValue(undefined),
    saveReport: vi.fn().mockResolvedValue(undefined),
    getReport: vi.fn().mockResolvedValue(undefined),
  },
}));

function settings(overrides: Partial<Settings> = {}): Settings {
  return { provider: "google", apiKey: "k", model: "gemini-2.5-flash", baseURL: "", searchProfile: "", ...overrides };
}

function fakeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    url: "https://www.leboncoin.fr/ad/ventes_immobilieres/111",
    site: "leboncoin",
    title: "Maison T4",
    price: 250000,
    surface: 90,
    location: { rawAddress: "Nantes 44000" },
    description: "",
    photos: [],
    extractedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Listing;
}

const quick = { verdict: "correct" } as unknown as QuickAnalysis;
const sender = { tab: { id: 4, url: "https://www.leboncoin.fr/ad/ventes_immobilieres/111" } };

beforeEach(() => {
  vi.clearAllMocks();
  fakeBrowser.reset();
  resetTabStatesForTests();
  (fakeBrowser.runtime as unknown as { sendMessage: unknown }).sendMessage = vi
    .fn()
    .mockResolvedValue(undefined);
  (fakeBrowser.tabs as unknown as { sendMessage: unknown }).sendMessage = vi
    .fn()
    .mockResolvedValue(undefined);
  vi.mocked(getSettings).mockResolvedValue(settings());
  vi.mocked(hasLlmPermission).mockResolvedValue(true);
});

describe("onRuntimeMessage", () => {
  it("répond exactement une fois même quand le handler lève (spinner infini sinon)", async () => {
    setTabState(4, { status: "quick-done", listing: fakeListing(), quick });
    vi.mocked(geocode).mockRejectedValue(new Error("géocodeur en panne"));
    const sendResponse = vi.fn();

    const isAsync = onRuntimeMessage(
      { type: "CORRECT_LOCATION", tabId: 4, address: "12 rue X" },
      sender,
      sendResponse,
    );
    expect(isAsync).toBe(true); // décidé en synchrone

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ error: "géocodeur en panne" });
  });
});

describe("handleMessage — EXTRACT_GENERIC", () => {
  const req: PepiteRequest = { type: "EXTRACT_GENERIC", url: "https://exemple.fr/annonce", pageText: "texte" };

  it("sans clé API : refuse sans déclencher d'appel LLM", async () => {
    vi.mocked(getSettings).mockResolvedValue(settings({ apiKey: "" }));
    await expect(handleMessage(req, sender)).resolves.toEqual({ error: "NO_API_KEY" });
    expect(extractListingGeneric).not.toHaveBeenCalled();
  });

  it("origine IA non accordée : NO_HOST_PERMISSION sans appel LLM", async () => {
    vi.mocked(hasLlmPermission).mockResolvedValue(false);
    await expect(handleMessage(req, sender)).resolves.toEqual({ error: "NO_HOST_PERMISSION" });
    expect(extractListingGeneric).not.toHaveBeenCalled();
  });

  it("garde qualité — prix dérisoire : EXTRACTION_FAIBLE et état d'erreur mémorisé", async () => {
    vi.mocked(extractListingGeneric).mockResolvedValue(fakeListing({ price: 3000 }));
    await expect(handleMessage(req, sender)).resolves.toEqual({ error: "EXTRACTION_FAIBLE" });
    expect(getTabState(4)).toEqual({ status: "error", error: EXTRACTION_FAILED_MESSAGE });
    expect(runListingPipeline).not.toHaveBeenCalled();
  });

  it("garde qualité — ni surface, ni pièces, ni type : même refus", async () => {
    vi.mocked(extractListingGeneric).mockResolvedValue(
      fakeListing({ surface: undefined, rooms: undefined, propertyType: undefined }),
    );
    await expect(handleMessage(req, sender)).resolves.toEqual({ error: "EXTRACTION_FAIBLE" });
    expect(getTabState(4)?.status).toBe("error");
  });

  it("extracteur en échec : EXTRACTION_FAIBLE, le message d'erreur brut ne fuit pas", async () => {
    vi.mocked(extractListingGeneric).mockRejectedValue(new Error("NoObjectGenerated"));
    await expect(handleMessage(req, sender)).resolves.toEqual({ error: "EXTRACTION_FAIBLE" });
    expect(getTabState(4)?.error).toBe(EXTRACTION_FAILED_MESSAGE);
  });

  it("listing exploitable : délègue au pipeline partagé", async () => {
    vi.mocked(extractListingGeneric).mockResolvedValue(fakeListing());
    vi.mocked(runListingPipeline).mockResolvedValue(quick);
    await expect(handleMessage(req, sender)).resolves.toEqual(quick);
    expect(runListingPipeline).toHaveBeenCalledWith(4, expect.objectContaining({ price: 250000 }));
  });
});

describe("handleMessage — RUN_FULL_ANALYSIS", () => {
  it("sans analyse rapide préalable : erreur dédiée", async () => {
    await expect(
      handleMessage({ type: "RUN_FULL_ANALYSIS", tabId: 9 }, sender),
    ).resolves.toEqual({ error: "Aucune annonce analysée sur cet onglet" });
  });

  it("gardes clé/permission : l'état n'est jamais passé à full-running", async () => {
    setTabState(9, { status: "quick-done", listing: fakeListing(), quick });

    vi.mocked(getSettings).mockResolvedValue(settings({ apiKey: "" }));
    await expect(
      handleMessage({ type: "RUN_FULL_ANALYSIS", tabId: 9 }, sender),
    ).resolves.toEqual({ error: "NO_API_KEY" });
    expect(getTabState(9)?.status).toBe("quick-done");

    vi.mocked(getSettings).mockResolvedValue(settings());
    vi.mocked(hasLlmPermission).mockResolvedValue(false);
    await expect(
      handleMessage({ type: "RUN_FULL_ANALYSIS", tabId: 9 }, sender),
    ).resolves.toEqual({ error: "NO_HOST_PERMISSION" });
    expect(getTabState(9)?.status).toBe("quick-done");
  });
});

describe("handleMessage — GET_TAB_STATE", () => {
  it("onglet idle sur une page d'annonce : répond idle et demande une re-détection", async () => {
    (fakeBrowser.tabs as unknown as { query: unknown }).query = vi.fn().mockResolvedValue([sender.tab]);
    await expect(handleMessage({ type: "GET_TAB_STATE" }, {})).resolves.toEqual({
      tabId: 4,
      state: { status: "idle" },
    });
    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(4, { type: "REDETECT" });
  });

  it("état mémorisé : le retourne sans re-détection", async () => {
    (fakeBrowser.tabs as unknown as { query: unknown }).query = vi.fn().mockResolvedValue([sender.tab]);
    const state = { status: "quick-done" as const, listing: fakeListing(), quick };
    setTabState(4, state);
    await expect(handleMessage({ type: "GET_TAB_STATE" }, {})).resolves.toEqual({
      tabId: 4,
      state,
    });
    expect(fakeBrowser.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

describe("handleMessage — divers", () => {
  it("type de message inconnu : null (pas d'appelant suspendu)", async () => {
    await expect(
      handleMessage({ type: "INCONNU" } as unknown as PepiteRequest, sender),
    ).resolves.toBeNull();
  });

  it("SAVE_USER_NOTES avec espaces seuls : champ retiré, pipeline non relancé", async () => {
    setTabState(4, { status: "quick-done", listing: fakeListing({ userNotes: "ancienne note" } as Partial<Listing>), quick });
    const res = await handleMessage({ type: "SAVE_USER_NOTES", tabId: 4, notes: "   " }, sender);
    expect(res).toMatchObject({ state: { status: "quick-done" } });
    expect(getTabState(4)?.listing?.userNotes).toBeUndefined();
    expect(idbRepository.saveListing).toHaveBeenCalledWith(
      expect.not.objectContaining({ userNotes: expect.anything() }),
    );
    expect(runListingPipeline).not.toHaveBeenCalled();
  });

  it("GENERATE_NEGOTIATION_EMAILS sans rapport : erreur explicite", async () => {
    await expect(
      handleMessage({ type: "GENERATE_NEGOTIATION_EMAILS", reportId: "absent" }, sender),
    ).resolves.toEqual({ error: "Rapport introuvable" });
  });
});
