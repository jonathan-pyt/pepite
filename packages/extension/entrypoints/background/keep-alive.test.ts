import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { withKeepAlive } from "./keep-alive";

let getPlatformInfo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fakeBrowser.reset();
  getPlatformInfo = vi.fn().mockResolvedValue({ os: "mac" });
  (fakeBrowser.runtime as unknown as { getPlatformInfo: unknown }).getPlatformInfo =
    getPlatformInfo;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withKeepAlive", () => {
  it("pinge l'API toutes les 20 s pendant l'opération, puis s'arrête", async () => {
    let resolve!: (v: string) => void;
    const pending = new Promise<string>((r) => (resolve = r));
    const result = withKeepAlive(() => pending);

    await vi.advanceTimersByTimeAsync(45_000);
    expect(getPlatformInfo).toHaveBeenCalledTimes(2);

    resolve("ok");
    await expect(result).resolves.toBe("ok");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getPlatformInfo).toHaveBeenCalledTimes(2); // interval nettoyé
  });

  it("nettoie l'interval même quand l'opération échoue", async () => {
    await expect(withKeepAlive(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getPlatformInfo).not.toHaveBeenCalled();
  });
});
