import { test, expect, type Page } from "@playwright/test";

const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const PASSWORD = "correct-horse-battery";

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel(/name/i).fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
}

/** Logout lives in the header on desktop and behind the "More" sheet
 * (mobile bottom nav) or the Profile page on mobile. */
async function logout(page: Page) {
  const isMobile = (page.viewportSize()?.width ?? 1024) < 768;
  if (isMobile) {
    await page.getByRole("button", { name: /more/i }).click();
  }
  await page.getByRole("button", { name: /log out/i }).click();
}

/** Registration lands on onboarding - it is intentionally skippable. */
async function skipOnboarding(page: Page) {
  await page.waitForURL(/\/(app|onboarding)/, { timeout: 15 * 1000 });
  if (page.url().includes("/onboarding")) {
    await page.getByRole("button", { name: /skip/i }).click();
  }
  await page.waitForURL(/\/app/);
}

test.describe("authentication flow", () => {
  test("register -> onboard(skip) -> dashboard -> logout -> login", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await skipOnboarding(page);

    // Dashboard greets with "Good morning/evening, <name>" - assert the
    // overview card + a visible nav (sidebar on desktop, tab bar on mobile).
    await expect(page.locator("main")).toContainText(/good (morning|afternoon|evening)/i);
    await expect(page.getByRole("navigation").first()).toBeVisible();

    await logout(page);
    await expect(page).not.toHaveURL(/\/app/);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/app/);
  });

  test("protected routes redirect to login when logged out", async ({ page }) => {
    await page.goto("/app/tasks");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login with wrong password shows an error", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await skipOnboarding(page);
    await logout(page);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("wrong-password-123");
    await page.getByRole("button", { name: /log in/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });
});

test.describe("core modules", () => {
  test("tasks: quick add shows the new task", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await skipOnboarding(page);

    await page.goto("/app/tasks");
    await page.getByLabel("Task title").fill("E2E task");
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByText("E2E task")).toBeVisible();

    // Persistence: survives a full reload (server-side data, not just cache).
    await page.reload();
    await expect(page.getByText("E2E task")).toBeVisible();

    // Validation: empty submit shows feedback instead of a dead button.
    await page.getByLabel("Task title").fill("   ");
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("health: log a metric", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await skipOnboarding(page);

    await page.goto("/app/health");
    await page.getByRole("tab", { name: /weight/i }).click();
    await page.getByLabel("Value").fill("70");
    await page.getByRole("button", { name: /^log$/i }).click();
    // Scope to the logged-metric row (list items), not the dynamic hero
    // subtitle which also echoes the latest value.
    await expect(
      page.getByRole("listitem").filter({ hasText: /70\s*kg/i }).first(),
    ).toBeVisible();
  });
});
