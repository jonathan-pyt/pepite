import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CacheEntry, Listing, Report, Repository } from "@pepite/core";

interface PepiteDB extends DBSchema {
  listings: { key: string; value: Listing };
  reports: { key: string; value: Report; indexes: { "by-url": string } };
  cache: { key: string; value: CacheEntry<unknown> };
}

let dbPromise: Promise<IDBPDatabase<PepiteDB>> | null = null;

function getDb(): Promise<IDBPDatabase<PepiteDB>> {
  dbPromise ??= openDB<PepiteDB>("pepite", 1, {
    upgrade(db) {
      db.createObjectStore("listings", { keyPath: "url" });
      const reports = db.createObjectStore("reports", { keyPath: "id" });
      reports.createIndex("by-url", "listingUrl");
      db.createObjectStore("cache");
    },
  });
  return dbPromise;
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
  async listReports() {
    return (await getDb()).getAll("reports");
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
