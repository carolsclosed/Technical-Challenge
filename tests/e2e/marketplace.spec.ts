import { test, expect } from "@playwright/test";

test("multi-store cart, login, cash-only submission, customer tracking", async ({
  page,
}) => {
  test.setTimeout(120000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good food. Your favourite places." }),
  ).toBeVisible();
  // Use immutable seeded IDs; local users may edit the stores' display names.
  const firstStore = page.locator(
    'a[href="/bairro-kitchen/stores/20000000-0000-4000-8000-000000000001"]',
  );
  const firstStoreName = await firstStore.getByRole("heading").innerText();
  await firstStore.click();
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: "Added to cart", exact: true }),
  ).toBeDisabled();
  await page.goto("/verde-co/stores/20000000-0000-4000-8000-000000000003");
  const secondStoreName = await page
    .getByRole("heading", { level: 1 })
    .innerText();
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: "Added to cart", exact: true }),
  ).toBeDisabled();
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: firstStoreName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: secondStoreName, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Review order" }).click();
  await expect(page).toHaveURL(/auth\/sign-in/);
  await page.getByLabel("Email", { exact: true }).fill("customer@mesa.test");
  await page.getByLabel("Password", { exact: true }).fill("LocalMesa!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/checkout/);
  await page.getByLabel("Name", { exact: true }).fill("Browser Customer");
  await page.getByLabel("Phone number").fill("+351912345678");
  await page.getByLabel("Street address").fill("Rua da Prata 100");
  await page.getByLabel("City", { exact: true }).fill("Lisboa");
  await page.getByLabel("State / Region").fill("Lisboa");
  await page.getByLabel("Postal code").fill("1100-420");
  await expect(
    page.getByText(
      "Cash on delivery. Each store fulfills its order separately.",
    ),
  ).toBeVisible();
  await expect(page.locator('input[autocomplete="cc-number"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { name: firstStoreName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: secondStoreName, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("0 of 2 stores delivered")).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel order", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".badge.cancelled")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test("search updates without submitting and clearing restores stores", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByRole("textbox", {
    name: "Find a store or merchant",
  });
  const cards = page.locator(".store-card");
  const originalCount = await cards.count();
  await search.fill("Bairro");
  await expect(page).toHaveURL(/\?q=Bairro$/);
  await expect(cards.first()).toBeVisible();
  await expect
    .poll(async () =>
      (await cards.allTextContents()).every((text) => text.includes("Bairro")),
    )
    .toBe(true);
  await search.fill("NoMatchingStore12345");
  await expect(page).toHaveURL(/\?q=NoMatchingStore12345$/);
  await expect(cards).toHaveCount(0);
  await search.clear();
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(cards).toHaveCount(originalCount);
});

test("locale/theme and responsive marketplace", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Language").selectOption("pt-PT");
  await expect(
    page.getByRole("heading", {
      name: "Boa comida. Os seus lugares favoritos.",
    }),
  ).toBeVisible();
  await page.getByLabel("Tema").selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Boa comida. Os seus lugares favoritos.",
    }),
  ).toBeVisible();
  for (const theme of ["dark", "light"]) {
    await page.getByLabel("Tema").selectOption(theme);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      await expect(
        page.getByRole("link", { name: "Carrinho 0", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/marketplace-${theme}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  }
});

test("merchant password alone cannot enter dashboard", async ({ page }) => {
  await page.goto("/auth/sign-in?next=/bairro-kitchen/dashboard");
  await page.getByLabel("Email", { exact: true }).fill("operator@mesa.test");
  await page.getByLabel("Password", { exact: true }).fill("LocalMesa!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/auth\/mfa/);
  await expect(
    page.getByRole("heading", { name: "Secure your account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Become a partner/ }),
  ).toHaveCount(0);
});
