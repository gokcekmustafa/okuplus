import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const appJs = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

function functionSource(start: string, end: string): string {
  const startIndex = appJs.indexOf(start);
  const endIndex = appJs.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) throw new Error(`UI function boundary missing: ${start}`);
  return appJs.slice(startIndex, endIndex);
}

const helpers = {
  escapeHtml: (value: unknown) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;"),
  tenantTypeLabel: (type: string) => (type === "INDIVIDUAL" ? "Bireysel" : "Kurum"),
  planLabel: (plan: string) => (plan === "PLAN_PREMIUM" ? "Ücretli Paket" : "Ücretsiz Paket"),
  entitlementSourceLabel: (source: string) =>
    ({ DEFAULT: "Varsayılan paket", ADMIN: "Yönetici tarafından tanımlandı" })[source] ?? source,
  billingPaymentStatusLabel: (status: string) => ({ SUCCEEDED: "Başarılı" })[status] ?? status,
  MEMBERSHIP_STATUS_LABELS: { ACTIVE: "Aktif", PENDING: "Beklemede" },
  MEMBERSHIP_ROLE_LABELS: { STUDENT: "Öğrenci" },
};

describe("Superadmin user workspace P0", () => {
  it("renders a prominent entitlement card with real dates, source, status and policy features", () => {
    const context = createContext(helpers);
    const render = runInContext(
      `${functionSource("function entitlementAdminStatusLabel(", "function userInitials(")}; ${functionSource("function renderUserPackageOverview(", "function renderUserBillingOverview(")}; renderUserPackageOverview`,
      context,
    ) as (user: unknown) => string;
    const html = render({
      accountContexts: [
        {
          tenantName: "Kişisel alan",
          tenantType: "INDIVIDUAL",
          role: "STUDENT",
          membershipStatus: "ACTIVE",
          packageRight: {
            plan: "PLAN_PREMIUM",
            source: "ADMIN",
            status: "ACTIVE",
            effectiveAt: "2026-10-01T00:00:00.000Z",
            expiresAt: "2027-10-01T00:00:00.000Z",
            features: ["Sınırsız alıştırma", "Öğrenme yolu"],
          },
        },
      ],
    });
    expect(html).toContain("Kişisel alan");
    expect(html).toContain("Ücretli Paket");
    expect(html).toContain("Hak etkin");
    expect(html).toContain("Sınırsız alıştırma");
    expect(html).toContain("Yönetici tarafından tanımlandı");
    expect(html).toContain("Başlangıç");
    expect(html).toContain("Bitiş");
  });

  it("does not invent a context or hide a package when no membership is present", () => {
    const context = createContext(helpers);
    const render = runInContext(
      `${functionSource("function entitlementAdminStatusLabel(", "function userInitials(")}; ${functionSource("function renderUserPackageOverview(", "function renderUserBillingOverview(")}; renderUserPackageOverview`,
      context,
    ) as (user: unknown) => string;
    const html = render({
      accountContexts: [],
      entitlements: [
        {
          id: "orphan-entitlement",
          tenantName: "Kişisel alan",
          tenantType: "INDIVIDUAL",
          plan: "PLAN_PREMIUM",
          source: "ADMIN",
          adminStatus: "EXPIRED",
        },
      ],
    });
    expect(html).toContain("kişisel alan veya kurum üyeliği bulunmuyor");
    expect(html).toContain("ÜYELİK BAĞLAMI YOK");
    expect(html).toContain("Süresi dolmuş");
    expect(html).not.toContain("Varsayılan ücretsiz hak");
  });

  it("keeps billing subscription and payment records separate without inventing renewal state", () => {
    const context = createContext(helpers);
    const render = runInContext(
      `${functionSource("function renderUserBillingOverview(", "function formatUserAdminDate(")}; ${functionSource("function formatUserAdminDate(", "function renderUserDetail(")}; renderUserBillingOverview`,
      context,
    ) as (user: unknown) => string;
    const html = render({
      billingSubscriptions: [
        {
          tenantName: "Kişisel alan",
          tenantType: "INDIVIDUAL",
          status: "ACTIVE",
          billingPeriod: "MONTHLY",
          currentPeriodStart: "2026-10-01T00:00:00.000Z",
          currentPeriodEnd: "2026-11-01T00:00:00.000Z",
          cancelRequestedAt: null,
          canceledAt: null,
        },
      ],
      billingPayments: [
        {
          tenantName: "Kişisel alan",
          status: "SUCCEEDED",
          amountMinor: 12900,
          currency: "TRY",
          occurredAt: "2026-10-01T00:00:00.000Z",
        },
      ],
    });
    expect(html).toContain("Abonelik ve ödeme");
    expect(html).toContain("Aktif");
    expect(html).toContain("Otomatik yenileme bilgisi kayıtta yok");
    expect(html).toContain("Son ödeme kayıtları");
    expect(html).toContain("₺129,00");
    expect(html).not.toContain("providerSubscriptionId");
  });

  it("provides context and membership filters and a responsive right-side detail workspace", () => {
    expect(indexHtml).toContain('id="user-tenant-type-filter"');
    expect(indexHtml).toContain('id="user-membership-status-filter"');
    expect(indexHtml).toContain("user-detail-modal-backdrop");
    expect(indexHtml).toContain("user-detail-drawer");
    expect(styles).toContain(".user-detail-modal-backdrop");
    expect(styles).toContain("justify-content: flex-end;");
    expect(styles).toContain("@media (max-width: 760px)");
    expect(styles).toContain("width: 100vw;");
  });
});
