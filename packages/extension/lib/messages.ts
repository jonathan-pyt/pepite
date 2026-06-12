import { browser } from "wxt/browser";
import type { GeoPoint, Listing, QuickAnalysis } from "@pepite/core";

export type TabStatus =
  | "idle"
  | "detected"
  | "quick-running"
  | "quick-done"
  | "full-running"
  | "full-done"
  | "error";

export interface TabState {
  status: TabStatus;
  listing?: Listing;
  quick?: QuickAnalysis;
  point?: GeoPoint;
  reportId?: string;
  error?: string;
}

export type PepiteRequest =
  | { type: "LISTING_DETECTED"; listing: Listing }
  | { type: "EXTRACT_GENERIC"; url: string; pageText: string }
  | { type: "GET_TAB_STATE"; tabId?: number }
  | { type: "RUN_FULL_ANALYSIS"; tabId: number }
  | { type: "CORRECT_LOCATION"; tabId: number; address: string }
  | { type: "GENERATE_NEGOTIATION_EMAILS"; reportId: string }
  | { type: "OPEN_SIDE_PANEL" };

export type PepiteContentRequest =
  | { type: "REDETECT" }
  // Localisation corrigée depuis le side panel : le background pousse le
  // nouveau quick au badge (les broadcasts runtime.sendMessage n'atteignent
  // pas les content scripts).
  | { type: "QUICK_UPDATED"; quick: QuickAnalysis };

export type PepiteEvent = { type: "TAB_STATE_CHANGED"; tabId: number; state: TabState };

export function sendRequest<T>(message: PepiteRequest): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}
