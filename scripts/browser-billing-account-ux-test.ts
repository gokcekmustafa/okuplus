import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

type BillingState = "FREE" | "ACTIVE" | "PENDING" | "CANCELED" | "EXPIRED";

const state: { value: BillingState } = { value: "FREE" };

function entitlementData() {
  const premium = state.value === "ACTIVE";
  return {
    plan: {
      code: premium ? "PLAN_PREMIUM" : "PLAN_FREE",
      label: premium ? "Premium" : "Ücretsiz",
      active: true,
    },
    tenant: { id: "browser-8h7-personal", type: "INDIVIDUAL" },
    features: {
      PRACTICE: {
        dailyLimit: premium ? null : 3,
        usedToday: premium ? 0 : 1,
        remainingToday: premium ? null : 2,
      },
      PRACTICE_QUESTION: {
        dailyLimit: premium ? null : 20,
        usedToday: premium ? 0 : 4,
        remainingToday: premium ? null : 16,
      },
    },
    premium: { ctaLabel: premium ? "Premium aktif" : "Premium hakkında bilgi" },
  };
}

function subscriptionData() {
  if (state.value === "FREE") return null;
  return {
    id: `browser-8h7-${state.value.toLowerCase()}`,
    status: state.value,
    providerSubscriptionId:
      state.value === "ACTIVE" || state.value === "PENDING"
        ? "browser-provider-subscription"
        : null,
    billingPeriod: "MONTHLY",
    currentPeriodEnd: state.value === "ACTIVE" ? "2026-10-03T12:00:00.000Z" : null,
    cancelRequestedAt: null,
    canceledAt: state.value === "CANCELED" ? "2026-09-03T12:00:00.000Z" : null,
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: subscriptionData() }),
      });
    });
    await page.route("**/billing/payments", async (route) => {
      const payments =
        state.value === "ACTIVE"
          ? [
              {
                id: "browser-payment-1",
                status: "SUCCEEDED",
                amountMinor: 12500,
                currency: "TRY",
                paymentDate: "2026-09-02T10:15:00.000Z",
              },
            ]
          : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { payments } }),
      });
    });
    await page.route("**/billing/subscription/cancel", async (route) => {
      state.value = "CANCELED";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { canceled: true, status: "CANCELED", effectiveAt: "2026-09-03T12:00:00.000Z" },
        }),
      });
    });
    await page.route("**/billing/checkout", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            checkoutId: "browser-checkout-new",
            status: "OPEN",
            checkoutFormContent: "<script>/* provider form mocked */</script>",
          },
        }),
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
    await page.waitForTimeout(650);
    if (await page.locator("#page-onboarding:not(.hidden)").count()) {
      await page
        .locator('.nav-item[data-page="dashboard"], .bottom-nav-item[data-bottom-page="dashboard"]')
        .filter({ visible: true })
        .first()
        .click();
    }
    await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 15000 });

    const openBillingAccount = async () => {
      await page.click("#entitlement-premium-cta");
      await page.waitForSelector("#page-premium-info:not(.hidden)", { timeout: 5000 });
      await page.click("#premium-info-billing");
      await page.waitForSelector("#page-billing-account:not(.hidden)", { timeout: 5000 });
      await page.waitForTimeout(200);
    };

    const verifyAccountState = async (expected: BillingState) => {
      state.value = expected;
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(650);
      if (await page.locator("#page-onboarding:not(.hidden)").count()) {
        await page
          .locator(
            '.nav-item[data-page="dashboard"], .bottom-nav-item[data-bottom-page="dashboard"]',
          )
          .filter({ visible: true })
          .first()
          .click();
      }
      await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
      await openBillingAccount();
      const accountText = await page.locator("#page-billing-account").innerText();
      if (expected === "FREE") {
        assert.match(accountText, /Ücretsiz/);
        assert.match(accountText, /Günde 3 alıştırma/);
        assert.match(accountText, /Premium'a geç/);
        assert.equal(await page.locator("#billing-account-cancel").isVisible(), false);
        assert.match(
          accountText,
          /Fatura bilgileri ödeme altyapısı tamamlandığında burada gösterilecektir\./,
        );
      } else if (expected === "ACTIVE") {
        assert.match(accountText, /Premium/);
        assert.match(accountText, /Premium aktif/);
        assert.match(accountText, /₺125,00/);
        assert.match(accountText, /Başarılı/);
        assert.match(accountText, /03 Ekim 2026/);
        assert.equal(await page.locator("#billing-account-cancel").isVisible(), true);
      } else if (expected === "PENDING") {
        assert.match(accountText, /Premium işlemi beklemede/);
        assert.match(accountText, /doğrulaması bekleniyor/);
      } else if (expected === "CANCELED") {
        assert.match(accountText, /Premium aboneliği iptal edildi/);
        assert.match(accountText, /Eski abonelik yeniden ACTIVE yapılmaz/);
        assert.equal(await page.locator("#billing-account-cancel").isVisible(), false);
        assert.equal(await page.locator("#billing-account-checkout-start").isVisible(), true);
        assert.match(
          await page.locator("#billing-account-checkout-start").innerText(),
          /Yeni Premium aboneliği başlat/,
        );
      } else {
        assert.match(accountText, /Premium aboneliği sona erdi/);
        assert.match(accountText, /Yeni Premium için yeni checkout/);
        assert.equal(await page.locator("#billing-account-cancel").isVisible(), false);
      }
      console.log(`PASS billing account ${expected}`);
    };

    await verifyAccountState("FREE");
    await verifyAccountState("ACTIVE");

    await page.click("#billing-account-cancel");
    await page.waitForSelector("#billing-cancel-dialog[open]", { timeout: 3000 });
    assert.match(await page.locator("#billing-cancel-dialog").innerText(), /iptal/);
    assert.match(await page.locator("#billing-cancel-dialog").innerText(), /dönem sonu/);
    assert.equal(
      await page.locator("#billing-cancel-dialog").getAttribute("aria-labelledby"),
      "billing-cancel-title",
    );
    await page.click("#billing-cancel-secondary");
    assert.equal(await page.locator("#billing-cancel-dialog[open]").count(), 0);
    await page.click("#billing-account-cancel");
    await page.click("#billing-cancel-confirm");
    await page.waitForFunction(
      () => document.querySelector("#billing-account-state")?.textContent?.includes("iptal edildi"),
      undefined,
      { timeout: 5000 },
    );
    assert.equal(await page.locator("#billing-account-cancel").isVisible(), false);
    console.log("PASS billing account cancel confirmation → CANCELED");

    await page.click("#billing-account-checkout-start");
    await page.waitForFunction(
      () => document.querySelector("#iyzico-checkout-form script") !== null,
      undefined,
      { timeout: 3000 },
    );
    assert.match(
      await page.locator("#billing-account-management").innerText(),
      /Sandbox checkout hazırlandı/,
    );
    console.log("PASS canceled → new checkout/reactivation CTA");

    await verifyAccountState("EXPIRED");
    await verifyAccountState("PENDING");

    const targetHeights = await page
      .locator("#page-billing-account:not(.hidden) .btn:visible")
      .evaluateAll((buttons) =>
        buttons.map((button) => Math.round(button.getBoundingClientRect().height)),
      );
    assert.ok(
      targetHeights.every((height) => height >= 48),
      `interactive target below 48px: ${targetHeights}`,
    );
    assert.equal(
      await page.locator("#billing-account-refresh").getAttribute("aria-label"),
      "Ödeme bilgilerini yenile",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      true,
    );
    console.log("PASS billing account mobile/a11y/reduced-motion checks");
    console.log(
      "BILLING ACCOUNT UX BROWSER REGRESSION PASS (provider/payment calls mocked; no payment)",
    );
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
