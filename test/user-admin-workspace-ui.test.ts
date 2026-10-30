import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const appJs = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const usersService = readFileSync(
  new URL("../src/modules/users/service.ts", import.meta.url),
  "utf8",
);

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
  userPackageOwnerId: "",
  userPackageContextId: "",
  userPackageAction: "",
  userAdminPlanLabel: (plan: string) => (plan === "PLAN_PREMIUM" ? "Premium" : "Başlangıç"),
  formatUserAdminDate: (value: unknown) => (value ? "tarih" : "Kaydedilmemiş"),
  formatUserAdminDateTime: (value: unknown) => (value ? "tarih-saat (İstanbul)" : "—"),
  renderUserEntitlementHistory: () => "Paket geçmişi",
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
          tenantId: "personal-context",
          tenantName: "Kişisel alan",
          tenantType: "INDIVIDUAL",
          tenantStatus: "ACTIVE",
          tenantDeleted: false,
          memberships: [{ status: "ACTIVE", deleted: false }],
          role: "STUDENT",
          membershipStatus: "ACTIVE",
          packageRight: {
            id: "admin-entitlement",
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
    expect(html).toContain("Premium");
    expect(html).toContain("Hak etkin");
    expect(html).toContain("Sınırsız alıştırma");
    expect(html).toContain("Yönetici tarafından tanımlandı");
    expect(html).toContain("Başlangıç");
    expect(html).toContain("Bitiş");
    expect(html).toContain("Süre ekle");
    expect(html).toContain("Paketi değiştir");
    expect(html).toContain("Erişimi sonlandır");
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
    expect(html).toContain("Hesap bağlamı bulunamadı");
    expect(html).toContain("Paket geçmişi");
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

  it("provides account-context filters and the new single-screen responsive profile workspace", () => {
    expect(indexHtml).toContain('id="user-membership-status-filter"');
    expect(indexHtml).toContain('id="user-management-subpage"');
    expect(indexHtml).toContain('data-user-segment="INDIVIDUAL"');
    expect(indexHtml).toContain('data-user-segment="ORGANIZATION"');
    expect(indexHtml).not.toContain("user-detail-modal-backdrop");
    expect(indexHtml).not.toContain("user-form-modal");
    expect(appJs).toContain('class="user-profile-workbench"');
    expect(appJs).not.toContain('<nav class="user-profile-tabs"');
    expect(styles).toContain("#page-users .user-profile-workbench");
    expect(styles).toContain("#page-users .user-profile-disclosure");
    expect(styles).toContain("#page-users .user-create-workspace");
    expect(styles).toContain("@media (max-width: 760px)");
    expect(styles).toContain(
      'grid-template-areas: "user user" "types types" "context context" "package access" "status status" "actions actions"',
    );
    expect(styles).not.toContain(".user-detail-drawer");
  });

  it("shows the package, actual access status, source and expiry in the user list summary", () => {
    const context = createContext(helpers);
    const render = runInContext(
      `${functionSource("function renderUserPackageSummary(", "function renderMembershipStatusSummary(")}; renderUserPackageSummary`,
      context,
    ) as (user: unknown) => string;
    const html = render({
      accountContexts: [
        {
          tenantType: "INDIVIDUAL",
          tenantStatus: "ACTIVE",
          tenantDeleted: false,
          memberships: [{ status: "ACTIVE", deleted: false }],
          packageRight: {
            plan: "PLAN_PREMIUM",
            source: "ADMIN",
            status: "ACTIVE",
            expiresAt: "2026-12-01T00:00:00.000Z",
          },
        },
      ],
      unlinkedPackageRights: [
        {
          plan: "PLAN_PREMIUM",
          source: "ADMIN",
          tenantName: "Eski alan",
        },
      ],
    });

    expect(html).toContain("Premium");
    expect(html).toContain("Hak etkin");
    expect(html).toContain("Yönetici tarafından tanımlandı");
    expect(html).toContain("Bitiş");
    expect(html).toContain("eşleşmeyen kayıt");
    expect(html).toContain("erişime uygulanmıyor");
  });

  it("opens account management with package access on the same screen, not behind legacy tabs", () => {
    const host = { innerHTML: "" };
    const context = createContext({
      $: () => host,
      userDetailTab: "general",
      userInitials: () => "ZA",
      escapeHtml: (value: unknown) => String(value ?? ""),
      userStatusBadge: () => "<status>Aktif</status>",
      renderUserPackageOverview: () => '<section id="package-access">Paket erişimi</section>',
      renderUserBillingOverview: () => '<section id="billing">Ödeme aboneliği</section>',
      renderUserOrganizationTab: () => '<section id="contexts">Hesap bağlantıları</section>',
      renderUserActivityTab: () => '<section id="history">İşlem geçmişi</section>',
      renderUserGeneralTab: () => '<section id="account-data">Hesap durumu</section>',
      canAccessPage: () => false,
      populateMembershipTenantSelect: () => undefined,
      platformRoleLabel: (role: string) => role,
    });
    const render = runInContext(
      `${functionSource("function renderUserDetail(", "function renderUserEntitlementHistory(")}; renderUserDetail`,
      context,
    ) as (user: unknown, notice?: string) => void;

    render({
      id: "user-1",
      displayName: "Zeynep",
      email: "zeynep@example.test",
      status: "ACTIVE",
      platformRole: null,
      memberships: [],
      accountContexts: [],
    });

    expect(host.innerHTML.indexOf('id="package-access"')).toBeLessThan(
      host.innerHTML.indexOf('id="account-data"'),
    );
    expect(host.innerHTML).toContain('id="billing"');
    expect(host.innerHTML).toContain('id="contexts"');
    expect(host.innerHTML).not.toContain("user-profile-tabs");
  });

  it("shows deleted tenant membership as no access even when its entitlement remains active", () => {
    const context = createContext(helpers);
    const render = runInContext(
      functionSource("function renderUserAccessSummary(", "function entitlementAdminStatusLabel(") +
        "; renderUserAccessSummary",
      context,
    ) as (user: unknown) => string;
    const html = render({
      accountContexts: [
        {
          tenantStatus: "ACTIVE",
          tenantDeleted: true,
          memberships: [{ status: "ACTIVE", deleted: false }],
          packageRight: { status: "ACTIVE" },
        },
      ],
    });
    expect(html).toContain("Erişim yok");
    expect(html).not.toContain("Hak etkin");
  });

  it("does not present active membership controls for a removed or unavailable context", () => {
    const context = createContext({
      ...helpers,
      setSelectedOption: () => "",
      membershipRoleOptions: () => "",
      membershipStatusBadge: () => '<span class="badge">Aktif</span>',
      generalStatusLabel: (status: string) => status,
    });
    const render = runInContext(
      `${functionSource("function renderUserOrganizationTab(", "function renderUserActivityTab(")}; renderUserOrganizationTab`,
      context,
    ) as (user: unknown) => string;
    const html = render({
      memberships: [
        {
          id: "removed-membership",
          role: "STUDENT",
          status: "ACTIVE",
          deleted: false,
          tenantId: "deleted-tenant",
          tenantName: "Kişisel alan (silindi)",
          tenantType: "INDIVIDUAL",
          tenantStatus: "ACTIVE",
          tenantDeleted: true,
        },
      ],
      branches: [],
      classAssignments: [],
      enrollments: [],
    });
    expect(html).toContain("silinmiş");
    expect(html).toContain("Bireysel çalışma alanı");
    expect(html).not.toContain("data-mem-status=");
    expect(html).not.toContain("data-mem-update=");
  });

  it("keeps an assigned package visible in the user list when its context is missing", () => {
    const context = createContext(helpers);
    const render = runInContext(
      functionSource(
        "function renderUserPackageSummary(",
        "function renderMembershipStatusSummary(",
      ) + "; renderUserPackageSummary",
      context,
    ) as (user: unknown) => string;
    const html = render({
      accountContexts: [],
      unlinkedPackageRights: [
        {
          plan: "PLAN_PREMIUM",
          source: "ADMIN",
          tenantName: "Kişisel alan",
        },
      ],
    });
    expect(html).toContain("Premium");
    expect(html).toContain("Kişisel alan · eşleşmeyen kayıt");
    expect(html).toContain("erişime uygulanmıyor");
  });

  it("keeps multi-context users visible in every relevant account context", () => {
    const context = createContext({
      ...helpers,
      renderUserAccountTypes: undefined,
      tenantTypeLabel: (type: string) => (type === "INDIVIDUAL" ? "Bireysel" : "Kurumsal"),
      MEMBERSHIP_STATUS_LABELS: { ACTIVE: "Aktif", PENDING: "Beklemede" },
    });
    const source = functionSource(
      "function renderUserAccountTypes(",
      "function renderUserAccessSummary(",
    );
    const render = runInContext(source + "; renderUserAccountTypes", context) as (
      user: unknown,
    ) => string;
    const html = render({
      platformRole: null,
      accountContexts: [
        {
          tenantType: "INDIVIDUAL",
          tenantName: "Kişisel alan",
          memberships: [{ status: "ACTIVE" }],
        },
        { tenantType: "ORGANIZATION", tenantName: "Okul", memberships: [{ status: "PENDING" }] },
      ],
    });
    expect(html).toContain("Bireysel");
    expect(html).toContain("Kurumsal");
    const renderMemberships = runInContext(
      `${functionSource("function renderMembershipStatusSummary(", "function renderUserAccessSummary(")}; renderMembershipStatusSummary`,
      context,
    ) as (user: unknown) => string;
    const memberships = renderMemberships({
      accountContexts: [
        { memberships: [{ status: "ACTIVE" }] },
        { memberships: [{ status: "PENDING" }] },
      ],
    });
    expect(memberships).toContain("Aktif");
    expect(memberships).toContain("Beklemede");

    const renderContexts = runInContext(
      `${functionSource("function renderUserContextSummary(", "function renderUserPackageSummary(")}; renderUserContextSummary`,
      context,
    ) as (user: unknown) => string;
    const contexts = renderContexts({
      accountContexts: [
        { tenantName: "Kişisel alan", tenantStatus: "ACTIVE", memberships: [{ status: "ACTIVE" }] },
        { tenantName: "Okul", tenantStatus: "ACTIVE", memberships: [{ status: "PENDING" }] },
      ],
    });
    expect(contexts).toContain("Kişisel alan");
    expect(contexts).toContain("Okul");
  });

  it("creates individuals without an institution and identifies shared organization package scope", () => {
    expect(appJs).toContain("accountType: userCreateAccountType");
    expect(appJs).toContain('userCreateAccountType === "ORGANIZATION"');
    expect(appJs).toContain('tenantId: $("user-create-tenant").value');
    expect(usersService).toContain("provisionPersonalContextInTransaction(tx, created.id)");
    expect(appJs).not.toContain('id="user-form-tenant"');
    expect(appJs).toContain('scope: "PERSONAL"');
    expect(appJs).toContain('method: "PATCH"');
    expect(appJs).not.toContain('id="tenant-form-type"');
  });

  it("shows an individual workspace read-only and omits its institution membership controls", () => {
    const context = createContext({
      ...helpers,
      setSelectedOption: () => "",
      membershipRoleOptions: () => "",
      membershipStatusBadge: () => '<span class="badge">Aktif</span>',
      generalStatusLabel: (status: string) => status,
    });
    const render = runInContext(
      `${functionSource("function renderUserOrganizationTab(", "function renderUserActivityTab(")}; renderUserOrganizationTab`,
      context,
    ) as (user: unknown) => string;
    const html = render({
      platformRole: null,
      memberships: [
        {
          id: "personal-membership",
          role: "STUDENT",
          status: "ACTIVE",
          deleted: false,
          tenantId: "personal-context",
          tenantName: "Kişisel",
          tenantType: "INDIVIDUAL",
          tenantStatus: "ACTIVE",
          tenantDeleted: false,
        },
      ],
      branches: [],
      classAssignments: [],
      enrollments: [],
    });
    expect(html).toContain("Bireysel çalışma alanı");
    expect(html).toContain("salt okunur");
    expect(html).not.toContain('id="membership-add-tenant"');
    expect(html).not.toContain("data-mem-update=");
    expect(html).not.toContain("data-mem-remove=");
  });

  it("does not expose personal-user actions on a shared organization package context", () => {
    const context = createContext(helpers);
    const render = runInContext(
      `${functionSource("function entitlementAdminStatusLabel(", "function userInitials(")}; ${functionSource("function renderUserPackageOverview(", "function renderUserBillingOverview(")}; renderUserPackageOverview`,
      context,
    ) as (user: unknown) => string;
    const html = render({
      id: "organization-user",
      accountContexts: [
        {
          tenantId: "school-tenant",
          tenantName: "Örnek Okul",
          tenantType: "ORGANIZATION",
          tenantStatus: "ACTIVE",
          tenantDeleted: false,
          memberships: [{ status: "ACTIVE", deleted: false }],
          packageRight: {
            id: "shared-right",
            plan: "PLAN_PREMIUM",
            source: "ADMIN",
            status: "ACTIVE",
            effectiveAt: "2026-10-01T00:00:00.000Z",
            expiresAt: "2027-10-01T00:00:00.000Z",
            features: [],
          },
        },
      ],
      entitlements: [],
    });
    expect(html).toContain("tüm kullanıcıların erişimini etkiler");
    expect(html).toContain('data-package-action="extend"');
    expect(html).toContain('data-package-action="change"');
    expect(html).toContain('data-package-action="end"');
  });

  it("keeps a deleted personal context visible as history without presenting active access", () => {
    const context = createContext(helpers);
    const render = runInContext(
      `${functionSource("function entitlementAdminStatusLabel(", "function userInitials(")}; ${functionSource("function renderUserPackageOverview(", "function renderUserBillingOverview(")}; renderUserPackageOverview`,
      context,
    ) as (user: unknown) => string;
    const html = render({
      id: "deleted-context-user",
      accountContexts: [
        {
          tenantId: "deleted-personal-context",
          tenantName: "Kişisel alan (silindi)",
          tenantType: "INDIVIDUAL",
          tenantStatus: "ACTIVE",
          tenantDeleted: true,
          memberships: [{ status: "ACTIVE", deleted: false }],
          packageRight: {
            id: "historical-entitlement",
            plan: "PLAN_PREMIUM",
            source: "ADMIN",
            status: "INACTIVE",
            effectiveAt: "2026-10-01T00:00:00.000Z",
            expiresAt: null,
            features: ["Öğrenme yolu"],
          },
        },
      ],
      entitlements: [],
    });
    expect(html).toContain("Premium");
    expect(html).toContain("Hak pasif");
    expect(html).toContain('data-personal-context-restore="deleted-personal-context"');
    expect(html).not.toContain('data-package-action="start"');
  });

  it("requires a visible preview and a separate confirmation for package actions", () => {
    const context = createContext({
      ...helpers,
      userPackageOwnerId: "personal-user",
      userPackageAction: "change",
    });
    const render = runInContext(
      `${functionSource("function entitlementAdminStatusLabel(", "function userInitials(")}; ${functionSource("function renderUserPackageOverview(", "function renderUserBillingOverview(")}; renderUserPackageOverview`,
      context,
    ) as (user: unknown) => string;
    const html = render({
      id: "personal-user",
      accountContexts: [
        {
          tenantId: "personal-context",
          tenantName: "Kişisel alan",
          tenantType: "INDIVIDUAL",
          tenantStatus: "ACTIVE",
          tenantDeleted: false,
          memberships: [{ status: "ACTIVE", deleted: false }],
          packageRight: {
            id: "current-entitlement",
            plan: "PLAN_FREE",
            source: "ADMIN",
            status: "ACTIVE",
            effectiveAt: "2026-10-01T00:00:00.000Z",
            expiresAt: "2027-01-01T00:00:00.000Z",
            features: [],
          },
        },
      ],
      entitlements: [],
    });
    expect(html).toContain('data-package-form="change"');
    expect(html).toContain("data-package-preview hidden");
    expect(html).toContain(">Önizle</button>");
  });

  it("does not send a package mutation until the preview is explicitly confirmed", async () => {
    const calls: Array<{ path: string; options: { method: string; body: string } }> = [];
    const form = {
      dataset: { packageForm: "change", confirmed: "false" },
      querySelector(selector: string) {
        if (selector === 'button[type="submit"]') return button;
        if (selector === "[data-package-preview]") return preview;
        return null;
      },
    };
    const button = { textContent: "Önizle", disabled: false };
    const preview = { hidden: true, innerHTML: "", textContent: "" };
    class TestFormData {
      get(name: string) {
        return {
          plan: "PLAN_PREMIUM",
          effectiveAt: "2026-11-15",
          expiresAt: "2027-11-15",
        }[name];
      }
    }
    const statusElement = { textContent: "", classList: { toggle: () => undefined } };
    const context = createContext({
      ...helpers,
      FormData: TestFormData,
      document: { querySelector: () => statusElement },
      userDetailCurrent: {
        id: "personal-user",
        accountContexts: [
          {
            tenantId: "personal-context",
            tenantType: "INDIVIDUAL",
            tenantStatus: "ACTIVE",
            tenantDeleted: false,
            memberships: [{ status: "ACTIVE", deleted: false }],
            packageRight: { id: "old-entitlement", plan: "PLAN_FREE", expiresAt: null },
          },
        ],
      },
      userPackageContextId: "personal-context",
      entitlementAdminApi: async (path: string, options: { method: string; body: string }) => {
        calls.push({ path, options });
        return { ok: true };
      },
      parseResponse: async (response: unknown) => response,
      setUserPackageActionStatus: () => undefined,
      openUserDetail: async () => undefined,
      loadUsers: async () => undefined,
    });
    const submit = runInContext(
      `${functionSource("function adminDateInputValue(", "function setUserDetailLoading(")}; submitUserPackageAction`,
      context,
    ) as (event: { preventDefault(): void; target: typeof form }) => Promise<void>;
    const event = { preventDefault: () => undefined, target: form };

    await submit(event);
    expect(calls).toHaveLength(0);
    expect(form.dataset.confirmed).toBe("true");
    expect(preview.hidden).toBe(false);
    expect(preview.innerHTML).toContain("Başlangıç → Premium");
    expect(button.textContent).toBe("Onayla ve kaydet");

    await submit(event);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/old-entitlement/change-plan");
    expect(calls[0].options.method).toBe("POST");
  });

  it("sends a shared entitlement to its organization tenant rather than to one user", async () => {
    const calls: Array<{ path: string; options: { method: string; body: string } }> = [];
    const form = {
      dataset: { packageForm: "start", confirmed: "true" },
      querySelector: () => ({ textContent: "Onayla ve kaydet", disabled: false }),
    };
    class TestFormData {
      get(name: string) {
        return { plan: "PLAN_PREMIUM", effectiveAt: "2026-11-15", expiresAt: "" }[name];
      }
    }
    const context = createContext({
      ...helpers,
      FormData: TestFormData,
      document: {
        querySelector: () => ({ textContent: "", classList: { toggle: () => undefined } }),
      },
      userDetailCurrent: {
        id: "org-member-user",
        accountContexts: [
          {
            tenantId: "school-tenant",
            tenantType: "ORGANIZATION",
            tenantStatus: "ACTIVE",
            tenantDeleted: false,
            packageRight: { id: null, plan: "PLAN_FREE" },
          },
        ],
      },
      userPackageContextId: "school-tenant",
      entitlementAdminApi: async (path: string, options: { method: string; body: string }) => {
        calls.push({ path, options });
        return { ok: true };
      },
      parseResponse: async (response: unknown) => response,
      setUserPackageActionStatus: () => undefined,
      openUserDetail: async () => undefined,
      loadUsers: async () => undefined,
    });
    const submit = runInContext(
      `${functionSource("function adminDateInputValue(", "function setUserDetailLoading(")}; submitUserPackageAction`,
      context,
    ) as (event: { preventDefault(): void; target: typeof form }) => Promise<void>;

    await submit({ preventDefault: () => undefined, target: form });

    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!.options.body)).toMatchObject({
      tenantId: "school-tenant",
      scope: "ORGANIZATION",
      plan: "PLAN_PREMIUM",
    });
    expect(JSON.parse(calls[0]!.options.body)).not.toHaveProperty("userId");
  });

  it("treats today's package start as immediate and never calls an unbounded expiry unsaved", () => {
    const context = createContext({ ...helpers });
    const run = runInContext(
      `${functionSource("function formatUserAdminDate(value)", "function formatUserAdminPayment(")}; ${functionSource("function adminDateInputValue(", "function resetUserPackageActionPreview(")}; ({formatUserAdminDate, adminDateInputValue, toAdminDate})`,
      context,
    ) as {
      formatUserAdminDate(value: null): string;
      adminDateInputValue(): string;
      toAdminDate(value: string): string;
    };
    const before = Date.now();
    const startsAt = new Date(run.toAdminDate(run.adminDateInputValue())).getTime();
    expect(Math.abs(startsAt - before)).toBeLessThan(1000);
    expect(run.formatUserAdminDate(null)).not.toBe("Kaydedilmemiş");
  });

  it("interprets package date-only values in the Istanbul business timezone", () => {
    const context = createContext({ ...helpers });
    const run = runInContext(
      `${functionSource("function adminDateInputValue(", "function setUserDetailLoading(")}; ({adminDateInputValue, toAdminDate})`,
      context,
    ) as {
      adminDateInputValue(value: string): string;
      toAdminDate(value: string): string;
    };

    expect(run.adminDateInputValue("2026-10-31T21:30:00.000Z")).toBe("2026-11-01");
    expect(run.toAdminDate("2026-11-01")).toBe("2026-10-31T21:00:00.000Z");
  });

  it("shows audit values before and after manual entitlement changes", () => {
    const context = createContext({
      ...helpers,
      formatUserAdminDate: (value: unknown) => String(value ?? "Kaydedilmemiş"),
    });
    const render = runInContext(
      `${functionSource("function renderUserActivityTab(", "function setUserPackageActionStatus(")}; renderUserActivityTab`,
      context,
    ) as (activity: unknown[]) => string;
    const html = render([
      {
        action: "UPDATE",
        entityType: "ENTITLEMENT",
        before: { plan: "PLAN_PREMIUM", expiresAt: "2026-12-01" },
        after: { plan: "PLAN_PREMIUM", expiresAt: "2027-01-01", active: true },
        actor: { displayName: "Yönetici" },
        createdAt: "2026-10-31",
      },
      {
        action: "UPDATE",
        entityType: "ENTITLEMENT",
        before: { plan: "PLAN_FREE" },
        after: { plan: "PLAN_PREMIUM", active: true },
        actor: { displayName: "Yönetici" },
        createdAt: "2026-10-31",
      },
    ]);
    expect(html).toContain("Önceki bitiş: 2026-12-01 → Yeni bitiş: 2027-01-01");
    expect(html).toContain("Başlangıç paketi Premium ile değiştirildi");
    expect(html).toContain("Önceki paket: Başlangıç → Yeni paket: Premium");
    expect(html).toContain("İşlemi yapan: Yönetici");
  });
});
