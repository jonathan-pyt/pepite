import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { TabState } from "@/lib/messages";
import {
  ensureTabState,
  getTabState,
  hydrateTabStates,
  removeTabState,
  resetTabStatesForTests,
  setTabState,
} from "./tab-states";

const LISTING_URL = "https://www.leboncoin.fr/ad/ventes_immobilieres/2921970357";

// fake-browser n'implémente pas sendMessage : stubs posés après chaque reset.
let tabsSendMessage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeBrowser.reset();
  resetTabStatesForTests();
  (fakeBrowser.runtime as unknown as { sendMessage: unknown }).sendMessage = vi
    .fn()
    .mockResolvedValue(undefined);
  tabsSendMessage = vi.fn().mockResolvedValue(undefined);
  (fakeBrowser.tabs as unknown as { sendMessage: unknown }).sendMessage = tabsSendMessage;
});

describe("setTabState", () => {
  it("persiste le snapshot dans storage.session (survie à la mort du SW)", async () => {
    const state: TabState = { status: "detected" };
    setTabState(1, state);
    const stored = await fakeBrowser.storage.session.get("tabStates");
    expect(stored["tabStates"]).toEqual({ "1": state });
  });
});

describe("hydrateTabStates", () => {
  it("restaure les états persistés après la mort du service worker", async () => {
    await fakeBrowser.storage.session.set({
      tabStates: { "2": { status: "error", error: "boom" } },
    });
    await hydrateTabStates();
    expect(getTabState(2)).toEqual({ status: "error", error: "boom" });
  });

  it("la Map RAM (plus fraîche) garde la priorité sur le snapshot", async () => {
    await fakeBrowser.storage.session.set({
      tabStates: { "3": { status: "error", error: "périmé" } },
    });
    setTabState(3, { status: "detected" });
    await hydrateTabStates();
    expect(getTabState(3)).toEqual({ status: "detected" });
  });
});

describe("removeTabState", () => {
  it("hydrate avant de supprimer : le snapshot n'est pas écrasé par une Map vide", async () => {
    await fakeBrowser.storage.session.set({
      tabStates: { "1": { status: "detected" }, "2": { status: "quick-done" } },
    });
    await removeTabState(1);
    const stored = await fakeBrowser.storage.session.get("tabStates");
    expect(stored["tabStates"]).toEqual({ "2": { status: "quick-done" } });
  });
});

describe("ensureTabState", () => {
  it("état non-idle mémorisé → pas de REDETECT (sinon re-appel LLM à chaque ouverture)", () => {
    setTabState(5, { status: "error", error: "extraction échouée" });
    ensureTabState(5, LISTING_URL);
    expect(tabsSendMessage).not.toHaveBeenCalled();
  });

  it("sans état sur une page d'annonce → REDETECT au content script", () => {
    ensureTabState(6, LISTING_URL);
    expect(tabsSendMessage).toHaveBeenCalledWith(6, { type: "REDETECT" });
  });

  it("URL absente ou hors sites d'annonces → rien", () => {
    ensureTabState(7, undefined);
    ensureTabState(7, "https://exemple.fr/page");
    expect(tabsSendMessage).not.toHaveBeenCalled();
  });
});
