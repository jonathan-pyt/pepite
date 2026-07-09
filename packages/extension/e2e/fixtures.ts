import { test as base, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";

// Fixtures officielles WXT/Playwright (wxt-dev/examples → playwright-e2e-testing) :
// contexte persistant avec l'extension buildée chargée, ID résolu via le
// service worker. Le Chromium de Playwright garde --load-extension (retiré de
// Chrome brandé ≥ 137).
const pathToExtension = path.resolve(".output/chrome-mv3");

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker");
    const extensionId = background.url().split("/")[2];
    await use(extensionId);
  },
});
export const expect = test.expect;
