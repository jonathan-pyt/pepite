import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

// Setup officiel WXT (https://wxt.dev/guide/essentials/unit-testing) :
// polyfill de l'API extension via @webext-core/fake-browser, alias et
// auto-imports du projet appliqués aux tests.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // Les specs e2e/ sont à Playwright (pnpm e2e), pas à vitest.
    exclude: ["e2e/**", "node_modules/**", ".output/**"],
  },
});
