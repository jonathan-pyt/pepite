import type { Listing, Report } from "../types";

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface Repository {
  saveListing(listing: Listing): Promise<void>;
  getListingByUrl(url: string): Promise<Listing | undefined>;
  saveReport(report: Report): Promise<void>;
  getReport(id: string): Promise<Report | undefined>;
  deleteReport(id: string): Promise<void>;
  listReports(): Promise<Report[]>;
  getCache<T>(key: string): Promise<T | undefined>;
  setCache<T>(key: string, value: T, ttlMs: number): Promise<void>;
  getLatestReportByUrl(listingUrl: string): Promise<Report | undefined>;
}
