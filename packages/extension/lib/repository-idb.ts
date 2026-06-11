import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CacheEntry, Listing, Report, Repository, RestyleCost } from "@pepite/core";

/** Restyle IA persisté (avant/après + estimation travaux) pour une annonce. */
export interface RestyleRecord {
  id: string;
  listingUrl: string;
  photoUrl: string;
  styleLabel: string;
  image: Blob;
  cost?: RestyleCost;
  createdAt: string;
}

interface PepiteDB extends DBSchema {
  listings: { key: string; value: Listing };
  reports: { key: string; value: Report; indexes: { "by-url": string } };
  cache: { key: string; value: CacheEntry<unknown> };
  restyles: { key: string; value: RestyleRecord; indexes: { "by-url": string } };
}

let dbPromise: Promise<IDBPDatabase<PepiteDB>> | null = null;

function getDb(): Promise<IDBPDatabase<PepiteDB>> {
  dbPromise ??= openDB<PepiteDB>("pepite", 2, {
    upgrade(db, oldVersion) {
      // v1 — stores d'origine (installation neuve : oldVersion === 0)
      if (oldVersion < 1) {
        db.createObjectStore("listings", { keyPath: "url" });
        const reports = db.createObjectStore("reports", { keyPath: "id" });
        reports.createIndex("by-url", "listingUrl");
        db.createObjectStore("cache");
      }
      // v2 — restyles IA (migration depuis v1 : stores existants préservés)
      if (oldVersion < 2) {
        const restyles = db.createObjectStore("restyles", { keyPath: "id" });
        restyles.createIndex("by-url", "listingUrl");
      }
    },
  });
  return dbPromise;
}

export async function saveRestyle(restyle: RestyleRecord): Promise<void> {
  await (await getDb()).put("restyles", restyle);
}

export async function listRestylesByUrl(listingUrl: string): Promise<RestyleRecord[]> {
  return (await getDb()).getAllFromIndex("restyles", "by-url", listingUrl);
}

export async function deleteRestyle(id: string): Promise<void> {
  await (await getDb()).delete("restyles", id);
}

/**
 * Vide uniquement le store `cache` (données marché, quartier, risques…).
 * Les rapports, restyles et annonces sont préservés.
 */
export async function clearCache(): Promise<void> {
  await (await getDb()).clear("cache");
}

export const idbRepository: Repository = {
  async saveListing(listing) {
    await (await getDb()).put("listings", listing);
  },
  async getListingByUrl(url) {
    return (await getDb()).get("listings", url);
  },
  async saveReport(report) {
    await (await getDb()).put("reports", report);
  },
  async getReport(id) {
    return (await getDb()).get("reports", id);
  },
  async deleteReport(id) {
    await (await getDb()).delete("reports", id);
  },
  async listReports() {
    return (await getDb()).getAll("reports");
  },
  async getLatestReportByUrl(listingUrl) {
    const reports = await (await getDb()).getAllFromIndex("reports", "by-url", listingUrl);
    if (reports.length === 0) return undefined;
    return reports.reduce((latest, r) => (r.createdAt > latest.createdAt ? r : latest));
  },
  async getCache<T>(key: string): Promise<T | undefined> {
    const entry = (await (await getDb()).get("cache", key)) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      await (await getDb()).delete("cache", key);
      return undefined;
    }
    return entry.value;
  },
  async setCache<T>(key: string, value: T, ttlMs: number) {
    await (await getDb()).put("cache", { value, expiresAt: Date.now() + ttlMs }, key);
  },
};
