import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

type BillingState = "FREE" | "ACTIVE" | "CANCELED" | "EXPIRED";

const state: { value: BillingState } = { value: "FREE" };

function entitlementData() {
  const premium = state.value === "ACTIVE";
  return {
    plan: {
      code: premium ? "PLAN_PREMIUM" : "PLAN_FREE",
      label: premium ? "Premium" : "Ücretsiz",
      active: true,
    },
    tenant: { id: "browser-billing-personal", type: "INDIVIDUAL" },
    features: {
      PRACTICE: {
        dailyLimit: premium ? null : 3,
        usedToday: 0,
        remainingToday: premium ? null : 3,
      },
      PRACTICE_QUESTION: {
        dailyLimit: premium ? null : 20,
        usedToday: 0,
        remainingToday: premium ? null : 20,
      },
    },
    premium: { ctaLabel: premium ? "Premium aktif" : "Premium hakkında bilgi" },
  };
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.route("**/account/entitlements", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: entitlementData() }),
      });
    });
    await page.route("**/billing/catalog", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            checkoutEnabled: true,
            plans: [{ billingPeriod: "MONTHLY", configured: true }],
          },
        }),
      });
    });
    await page.route("**/billing/subscription", async (route) => {
      const status = state.value === "FREE" ? null : state.value;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: status ? { status } : null }),
      });
    });

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.fill("#login-email", "demo@okuplus.dev");
    await page.fill("#login-password", "demo-pass-123");
    const loginResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/login") && response.request().method() === "POST",
    );
    await page.click("#login-submit");
    assert.equal((await loginResponse).status(), 200);
    await page.waitForFunction(
      () => document.querySelector("#view-app")?.classList.contains("hidden") === false,
      undefined,
      { timeout: 15000 },
    );
    await page.waitForTimeout(750);
    if (await page.locator("#page-onboarding:not(.hidden)").count()) {
      await page
        .locator(
          '.nav-item[data-page="dashboard"]:visible, .bottom-nav-item[data-bottom-page="dashboard"]:visible',
        )
        .first()
        .click();
    }
    await page.waitForTimeout(750);
    await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 15000 });

    const verifyState = async (expected: BillingState, label: string): Promise<void> => {
      state.value = expected;
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(750);
      if (await page.locator("#page-onboarding:not(.hidden)").count()) {
        await page
          .locator(
            '.nav-item[data-page="dashboard"]:visible, .bottom-nav-item[data-bottom-page="dashboard"]:visible',
          )
          .first()
          .click();
      }
      await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
      await page.waitForSelector("#entitlement-card:not(.hidden)", { timeout: 10000 });
      const entitlementText = await page.locator("#entitlement-card").innerText();
      if (expected === "ACTIVE") {
        assert.match(entitlementText, /Premium/);
        assert.match(entitlementText, /Premium aktif/);
      } else {
        assert.match(entitlementText, /Ücretsiz/);
      }
      await page.click("#entitlement-premium-cta");
      await page.waitForSelector("#page-premium-info:not(.hidden)", { timeout: 5000 });
      assert.equal(await page.locator("#premium-checkout-start").isEnabled(), true);
      const statusText = await page.locator("#billing-sandbox-status").innerText();
      const expectedStatus =
        expected === "FREE"
          ? "Henüz bir sandbox aboneliği yok."
          : {
              ACTIVE: "Premium aktif",
              CANCELED: "Abonelik iptal edildi",
              EXPIRED: "Premium sona erdi",
            }[expected];
      assert.equal(statusText, expectedStatus);
      assert.equal(
        await page.locator("#premium-subscription-cancel").isVisible(),
        expected === "ACTIVE",
      );
      console.log(`PASS billing browser state ${label}`);
    };

    await verifyState("FREE", "FREE → Premium CTA → sandbox billing surface");
    await verifyState("ACTIVE", "ACTIVE → Premium UI");
    await verifyState("CANCELED", "CANCELED → free UI / cancel hidden");
    await verifyState("EXPIRED", "EXPIRED → free UI / cancel hidden");
    console.log(
      "BILLING LIFECYCLE BROWSER STATE REGRESSION PASS (provider calls mocked; no payment)",
    );
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
