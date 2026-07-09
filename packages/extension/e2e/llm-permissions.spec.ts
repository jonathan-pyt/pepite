import { expect, test } from "./fixtures";

// Les callbacks page.evaluate s'exécutent dans la page extension, où chrome existe.
declare const chrome: {
  permissions: { contains(q: { origins: string[] }): Promise<boolean> };
};

// Flux optional_host_permissions des réglages : contrairement au profil de dev
// WXT (qui accorde http://localhost/* pour le HMR), la build de prod ne granté
// aucune origine IA — les avertissements sont donc tous observables.
test("réglages : avertissements et demande d'accès réseau IA", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.locator("#provider")).toBeVisible();

  const missingWarning = page.getByText("Accès réseau au fournisseur d'IA non accordé");

  // Sans clé ni endpoint (onboarding) : aucun appel LLM possible → aucun avertissement.
  await expect(missingWarning).toHaveCount(0);

  // Clé renseignée sur Google : origine non accordée → avertissement.
  await page.fill("#api-key", "cle-de-test");
  await expect(missingWarning).toBeVisible();
  expect(
    await page.evaluate(() =>
      chrome.permissions.contains({ origins: ["https://generativelanguage.googleapis.com/*"] }),
    ),
  ).toBe(false);

  // Fournisseur OpenAI : le champ endpoint apparaît.
  await page.click("#provider");
  await page.click('[role="option"]:has-text("OpenAI")');
  await expect(page.locator("#openai-base-url")).toBeVisible();

  // Endpoint invalide → erreur dédiée sous le champ.
  await page.fill("#openai-base-url", "pas-une-url");
  await expect(page.getByText("URL invalide")).toBeVisible();

  // Endpoint Ollama cloud : avertissement tant que l'origine n'est pas accordée.
  await page.fill("#openai-base-url", "https://ollama.com/v1");
  await expect(missingWarning).toBeVisible();

  // Le clic Enregistrer déclenche permissions.request sans exception ; le
  // dialogue natif ne peut pas être accepté par l'automation, on vérifie
  // seulement l'absence de crash et la persistance de l'état « non accordé ».
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.click('button:has-text("Enregistrer")');
  await page.waitForTimeout(1500);
  expect(pageErrors).toEqual([]);
  expect(
    await page.evaluate(() => chrome.permissions.contains({ origins: ["https://ollama.com/*"] })),
  ).toBe(false);
});
