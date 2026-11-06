import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const appJs = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const designSystem = readFileSync(new URL("../public/design-system.css", import.meta.url), "utf8");

function functionSource(start: string, end: string): string {
  const startIndex = appJs.indexOf(start);
  const endIndex = appJs.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) throw new Error(`UI function boundary missing: ${start}`);
  return appJs.slice(startIndex, endIndex);
}

describe("Superadmin kullanıcı yönetimi", () => {
  it("kurum, bireysel ve platform hesaplarını aynı kullanıcı satırında doğru bağlamlarla gösterir", () => {
    const userData = [
      {
        id: "mixed-user",
        displayName: "Karışık Hesap",
        email: "mixed@example.test",
        platformRole: null,
        status: "ACTIVE",
        membershipCount: 1,
        roleConnections: [
          {
            tenantName: "Örnek Okul",
            tenantType: "ORGANIZATION",
            tenantStatus: "ACTIVE",
            role: "TEACHER",
            status: "ACTIVE",
          },
        ],
        accountContexts: [
          {
            tenantId: "personal-context",
            tenantType: "INDIVIDUAL",
            packageRight: { plan: "PLAN_PREMIUM", status: "ACTIVE" },
          },
        ],
        unlinkedPackageRights: [],
      },
      {
        id: "personal-user",
        displayName: "Bireysel Hesap",
        email: "personal@example.test",
        platformRole: null,
        status: "ACTIVE",
        membershipCount: 0,
        roleConnections: [],
        accountContexts: [
          {
            tenantId: "personal-only-context",
            tenantType: "INDIVIDUAL",
            packageRight: { plan: "PLAN_FREE", status: "ACTIVE" },
          },
        ],
        unlinkedPackageRights: [],
      },
      {
        id: "platform-user",
        displayName: "Platform Hesabı",
        email: "platform@example.test",
        platformRole: "CONTENT_EDITOR",
        status: "ACTIVE",
        membershipCount: 0,
        roleConnections: [],
        accountContexts: [],
        unlinkedPackageRights: [],
      },
    ];
    const elements = {
      "user-list-body": { innerHTML: "" },
      "user-page-info": { textContent: "" },
      "user-list-title": { textContent: "" },
      "user-list-description": { textContent: "" },
      "user-list-extra-heading": { textContent: "" },
      "user-segment-tabs": { classList: { toggle: vi.fn() } },
      "user-create-btn": { classList: { toggle: vi.fn() } },
      "user-prev-btn": { disabled: false },
      "user-next-btn": { disabled: false },
    };
    const context = createContext({
      userData,
      userTotal: userData.length,
      userPage: 1,
      USER_PAGE_SIZE: 20,
      userSegment: "ORGANIZATION",
      userListState: "ACTIVE",
      $: (id: keyof typeof elements) => elements[id],
      document: { querySelectorAll: () => [] },
      escapeHtml: (value: unknown) =>
        String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
      platformRoleLabel: (role: string) => (role === "CONTENT_EDITOR" ? "İçerik editörü" : role),
      userStatusBadge: () => "Hesap aktif",
      planLabel: (plan: string) => (plan === "PLAN_PREMIUM" ? "Premium" : "Başlangıç"),
      MEMBERSHIP_ROLE_LABELS: { TEACHER: "Öğretmen" },
      MEMBERSHIP_STATUS_LABELS: { ACTIVE: "Aktif" },
      Math,
    });
    const source = [
      functionSource("function renderUserAccountType(", "const INDIVIDUAL_ALLOWED_ROLES"),
      functionSource("function renderUserList()", "function renderUserAccountType("),
    ].join("\n");
    runInContext(`${source}; renderUserList`, context)();

    const output = elements["user-list-body"].innerHTML;
    const mixedRow = output.split("<tr>")[1]!;
    expect(mixedRow).toContain("Kurumsal");
    expect(mixedRow).toContain("Örnek Okul");
    expect(mixedRow).toContain("Kişisel çalışma alanı");
    expect(mixedRow).toContain("Öğretmen");
    expect(mixedRow).toContain("Premium");
    const personalRow = output.split("<tr>")[2]!;
    expect(personalRow).toContain("Kişisel çalışma alanı");
    expect(personalRow).toContain("Başlangıç");
    expect(output).toContain("İçerik editörü");
  });

  it("silinen kullanıcıları ayrı listede, geri yükleme ve ek onaylı kalıcı silme işlemleriyle gösterir", () => {
    const userData = [
      {
        id: "deleted-user",
        displayName: "Silinmiş Hesap",
        email: "deleted@example.test",
        status: "ACTIVE",
        platformRole: null,
        deletedAt: "2026-10-31T10:00:00.000Z",
        accountContexts: [],
        roleConnections: [],
        unlinkedPackageRights: [],
      },
    ];
    const elements = {
      "user-list-body": { innerHTML: "" },
      "user-page-info": { textContent: "" },
      "user-list-title": { textContent: "" },
      "user-list-description": { textContent: "" },
      "user-list-extra-heading": { textContent: "" },
      "user-segment-tabs": { classList: { toggle: vi.fn() } },
      "user-create-btn": { classList: { toggle: vi.fn() } },
      "user-prev-btn": { disabled: false },
      "user-next-btn": { disabled: false },
    };
    const context = createContext({
      userData,
      userTotal: 1,
      userPage: 1,
      USER_PAGE_SIZE: 20,
      userSegment: "ORGANIZATION",
      userListState: "DELETED",
      $: (id: keyof typeof elements) => elements[id],
      document: { querySelectorAll: () => [] },
      escapeHtml: (value: unknown) => String(value),
      platformRoleLabel: (role: string) => role,
      userStatusBadge: () => "Etkin",
      planLabel: (plan: string) => plan,
      MEMBERSHIP_ROLE_LABELS: {},
      MEMBERSHIP_STATUS_LABELS: {},
      Math,
      Date,
    });
    const source = [
      functionSource("function renderUserAccountType(", "const INDIVIDUAL_ALLOWED_ROLES"),
      functionSource("function renderUserList()", "function renderUserAccountType("),
    ].join("\n");
    runInContext(`${source}; renderUserList`, context)();

    expect(elements["user-list-title"].textContent).toBe("Silinen Kullanıcılar");
    expect(elements["user-list-extra-heading"].textContent).toBe("Silinme tarihi");
    expect(elements["user-segment-tabs"].classList.toggle).toHaveBeenCalledWith("hidden", true);
    expect(elements["user-create-btn"].classList.toggle).toHaveBeenCalledWith("hidden", true);
    expect(elements["user-list-body"].innerHTML).toContain('data-user-restore-id="deleted-user"');
    expect(elements["user-list-body"].innerHTML).toContain(
      'data-user-permanent-delete-id="deleted-user"',
    );
    expect(elements["user-list-body"].innerHTML).toContain("Silindi");
    expect(elements["user-list-body"].innerHTML).toContain("Silinme tarihi");
  });

  it("kalıcı silme onay düğmesini yalnızca istenen ifade tam girildiğinde etkinleştirir", () => {
    const confirmation = { value: "" };
    const submit = { disabled: true };
    const context = createContext({
      $: (id: string) =>
        ({
          "permanent-user-delete-confirmation": confirmation,
          "permanent-user-delete-submit": submit,
        })[id],
      permanentDeleteSaving: false,
    });
    const updateConfirmation = runInContext(
      `${functionSource("function updatePermanentDeleteConfirmation()", "async function submitPermanentUserDelete(")}; updatePermanentDeleteConfirmation`,
      context,
    ) as () => void;

    updateConfirmation();
    expect(submit.disabled).toBe(true);
    confirmation.value = "KALICI SIL";
    updateConfirmation();
    expect(submit.disabled).toBe(true);
    confirmation.value = "KALICI SİL";
    updateConfirmation();
    expect(submit.disabled).toBe(false);
    context.permanentDeleteSaving = true;
    updateConfirmation();
    expect(submit.disabled).toBe(true);
  });

  it("kullanıcı ayrıntısındaki yinelenen düzenleme düğmesini kaldırır ve yönetim geçmişini Türkçeleştirir", () => {
    expect(indexHtml).not.toContain('id="user-detail-edit"');
    expect(appJs).not.toContain('$("user-detail-edit")');
    const helperSource = functionSource(
      "function userAuditEventLabel(item)",
      "async function loadUsers()",
    );
    const label = runInContext(
      `${helperSource}\nuserAuditEventLabel`,
      createContext({}),
    ) as (item: { action: string; entityType: string }) => string;

    expect(label({ action: "UPDATE", entityType: "ENTITLEMENT" })).toBe(
      "Paket erişimi güncellendi",
    );
    expect(label({ action: "DELETE", entityType: "USER_SOFT_DELETE" })).toBe(
      "Kullanıcı silinenlere taşındı",
    );
    expect(label({ action: "UNKNOWN", entityType: "UNKNOWN" })).toBe("Yönetim kaydı işlendi");
  });

  it("bireysel kullanıcı oluştururken kurum alanını kapatır ve kurum hesabında zorunlu kılar", () => {
    const options = [
      { value: "ACTIVE", disabled: false },
      { value: "INVITED", disabled: false },
      { value: "SUSPENDED", disabled: false },
    ];
    const accountType = { value: "INDIVIDUAL" };
    const tenant = { required: true };
    const role = { required: true };
    const organizationFields = {
      classList: {
        toggle: (name: string, hidden: boolean) => (organizationFields.hidden = hidden),
      },
      hidden: false,
    };
    const status = { value: "INVITED", options };
    const context = createContext({
      userFormMode: "create",
      $: (id: string) =>
        ({
          "user-form-account-type": accountType,
          "user-form-organization-membership": organizationFields,
          "user-form-tenant": tenant,
          "user-form-role": role,
          "user-form-status": status,
        })[id],
    });
    runInContext(
      `${functionSource("function updateUserFormAccountType(", "async function populateUserFormTenantSelect(")}; updateUserFormAccountType`,
      context,
    )();
    expect(organizationFields.hidden).toBe(true);
    expect(tenant.required).toBe(false);
    expect(role.required).toBe(false);
    expect(status.value).toBe("ACTIVE");
    expect(options.slice(1).every((option) => option.disabled)).toBe(true);

    accountType.value = "ORGANIZATION";
    runInContext("updateUserFormAccountType()", context);
    expect(organizationFields.hidden).toBe(false);
    expect(tenant.required).toBe(true);
    expect(role.required).toBe(true);
    expect(options.every((option) => !option.disabled)).toBe(true);
  });

  it("bireysel kullanıcı formu kurum veya üyelik alanı göndermeden mevcut API'ye kaydeder", async () => {
    const fields = {
      "user-form-name": { value: "Yeni Öğrenci" },
      "user-form-email": { value: "student@example.test" },
      "user-form-status": { value: "ACTIVE" },
      "user-form-phone": { value: "" },
      "user-form-birthyear": { value: "" },
      "user-form-password": { value: "secure-test-password" },
      "user-form-account-type": { value: "INDIVIDUAL" },
      "user-form-tenant": {
        value: "must-not-be-used",
        selectedOptions: [{ dataset: { type: "ORGANIZATION" } }],
      },
      "user-form-role": { value: "TEACHER" },
      "user-form-error": { classList: { add: vi.fn(), remove: vi.fn() }, textContent: "" },
    };
    const userApi = vi.fn(async () => ({ ok: true }));
    const context = createContext({
      userFormMode: "create",
      userSegment: "ORGANIZATION",
      userPage: 4,
      USER_PAGE_SIZE: 20,
      $: (id: string) => fields[id as keyof typeof fields],
      userApi,
      parseResponse: async () => ({
        id: "created-user",
        memberships: [],
        personalContexts: [{ tenantId: "personal-1" }],
      }),
      closeUserForm: vi.fn(),
      setUserFormLoading: vi.fn(),
      loadUsers: vi.fn(async () => {}),
      escapeHtml: (value: unknown) => String(value),
    });
    const submit = runInContext(
      `${functionSource("async function submitUserForm(", "async function openUserDetail(")}; submitUserForm`,
      context,
    ) as (event: { preventDefault: () => void }) => Promise<void>;
    await submit({ preventDefault: vi.fn() });

    const [, options] = userApi.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(options.body)).toEqual({
      displayName: "Yeni Öğrenci",
      email: "student@example.test",
      status: "ACTIVE",
      accountType: "INDIVIDUAL",
      password: "secure-test-password",
    });
    expect(JSON.parse(options.body)).not.toHaveProperty("tenantId");
    expect(JSON.parse(options.body)).not.toHaveProperty("membershipRole");
  });

  it("paket işlemlerinde mevcut API'nin kapsam ayrımını ve değişmez geçmiş işlemlerini kullanır", () => {
    const context = createContext({ encodeURIComponent });
    const builder = runInContext(
      `${functionSource("function buildUserEntitlementRequest(", "async function submitUserEntitlementForm(")}; buildUserEntitlementRequest`,
      context,
    ) as (input: Record<string, unknown>) => {
      path: string;
      method: string;
      payload: Record<string, unknown>;
    };
    const personal = builder({
      action: "start",
      userId: "user-1",
      scope: "PERSONAL",
      plan: "PLAN_PREMIUM",
      effectiveAt: "2026-11-01T09:00",
      expiresAt: "",
      tenantId: "must-not-be-sent",
    });
    expect(personal).toMatchObject({ method: "POST", path: "" });
    expect(personal.payload).toMatchObject({
      scope: "PERSONAL",
      userId: "user-1",
      plan: "PLAN_PREMIUM",
    });
    expect(personal.payload).not.toHaveProperty("tenantId");
    expect(personal.payload).not.toHaveProperty("source");

    const organization = builder({
      action: "start",
      userId: "must-not-be-sent",
      scope: "ORGANIZATION",
      plan: "PLAN_FREE",
      tenantId: "organization-1",
    });
    expect(organization.payload).toEqual({
      scope: "ORGANIZATION",
      plan: "PLAN_FREE",
      tenantId: "organization-1",
    });
    expect(organization.payload).not.toHaveProperty("userId");

    expect(
      builder({ action: "extend", id: "grant-1", expiresAt: "2027-01-01T09:00" }),
    ).toMatchObject({
      path: "/grant-1",
      method: "PATCH",
      payload: { expiresAt: expect.any(String) },
    });
    expect(
      builder({
        action: "change",
        id: "grant-1",
        plan: "PLAN_FREE",
        effectiveAt: "2026-12-01T09:00",
      }),
    ).toMatchObject({
      path: "/grant-1/change-plan",
      method: "POST",
      payload: { plan: "PLAN_FREE", effectiveAt: expect.any(String) },
    });
    expect(builder({ action: "end", id: "grant-1" })).toEqual({
      path: "/grant-1",
      method: "PATCH",
      payload: { active: false },
    });
    expect(() => builder({ action: "start", scope: "ORGANIZATION", plan: "PLAN_FREE" })).toThrow(
      "Paket için kurum seçin.",
    );
  });

  it("silinmiş bireysel alan kurtarmasında 409 hatasını aynı kartta gösterir", async () => {
    expect(appJs).toContain("/personal-context/restore");
    expect(appJs).toContain("function beginPersonalContextRestore(");
    expect(appJs).toContain("data-personal-context-restore-confirm=");
    expect(appJs).toContain("data-personal-context-restore-cancel=");
    expect(appJs).toContain("data-personal-context-recovery-status");
    expect(appJs).toContain("Başka bir kullanıcı işlemi sürüyor. Tamamlanınca tekrar deneyin.");
    expect(
      functionSource(
        "async function restoreUserPersonalContext(",
        "async function populateMembershipTenantSelect(",
      ),
    ).not.toContain("window.confirm(");
    expect(appJs).toContain("Öğrenci profili ve ilerleme kayıtları korunur.");
    expect(appJs).toContain(
      "Aynı kişisel çalışma alanı geri yüklendi. Mevcut öğrenci kayıtları korundu.",
    );

    const message = "Açık hesap silme talebi var; kişisel alan geri yüklenmedi";
    const localStatus = { textContent: "", dataset: {} as Record<string, string> };
    const globalStatus = { textContent: "", dataset: {} as Record<string, string> };
    const panel = {
      querySelector: (selector: string) =>
        selector === "[data-personal-context-recovery-status]" ? localStatus : null,
    };
    const button = {
      disabled: false,
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      closest: (selector: string) => (selector === ".personal-context-recovery" ? panel : null),
    };
    let request: { path: string; method: string; body: string } | null = null;
    const context = createContext({
      userDetailCurrent: { id: "user-1", status: "ACTIVE" },
      userEntitlementSaving: false,
      $: (id: string) => (id === "user-profile-action-status" ? globalStatus : null),
      userApi: (path: string, options: { method: string; body: string }) => {
        request = { path, ...options };
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ error: { message } }),
          headers: { get: () => null },
        });
      },
      parseResponse: async (response: {
        ok: boolean;
        json: () => Promise<{ error?: { message?: string } }>;
      }) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "İstek başarısız");
        return body;
      },
      openUserDetail: vi.fn(),
      loadUsers: vi.fn(),
      encodeURIComponent,
      JSON,
    });
    const restoreSource = functionSource(
      "function setPersonalContextRecoveryStatus(",
      "function personalContextRecoveryPrompt(",
    );
    const requestSource = functionSource(
      "async function restoreUserPersonalContext(",
      "async function populateMembershipTenantSelect(",
    );
    const restore = runInContext(
      `${restoreSource}\n${requestSource}\nrestoreUserPersonalContext`,
      context,
    ) as (tenantId: string, target: typeof button) => Promise<void>;

    await restore("personal-tenant-1", button);

    expect(request).toMatchObject({
      path: "/user-1/personal-context/restore",
      method: "POST",
      body: JSON.stringify({ tenantId: "personal-tenant-1" }),
    });
    expect(localStatus.textContent).toBe(message);
    expect(localStatus.dataset.state).toBe("error");
    expect(globalStatus.textContent).toBe("");
    expect(button.disabled).toBe(false);
  });

  it("kişisel alan üyelik durumunu ham HTML yerine rozet olarak üretir", () => {
    const helperSource = functionSource(
      "function personalContextMembershipBadge(",
      "async function loadUsers()",
    );
    const context = createContext({
      membershipStatusBadge: (status: string) =>
        `<span class="badge badge-success">${status === "ACTIVE" ? "Aktif" : status}</span>`,
    });
    const renderBadge = runInContext(
      `${helperSource}\npersonalContextMembershipBadge`,
      context,
    ) as (value: { membershipDeleted: boolean; membershipStatus: string }) => string;

    expect(renderBadge({ membershipDeleted: false, membershipStatus: "ACTIVE" })).toBe(
      '<span class="badge badge-success">Aktif</span>',
    );
    expect(renderBadge({ membershipDeleted: true, membershipStatus: "REMOVED" })).toBe(
      '<span class="badge badge-danger">Üyelik kaldırıldı</span>',
    );
    expect(appJs).toContain("· ${membershipState}</dd>");
    expect(appJs).not.toContain("escapeHtml(membershipState)");
  });

  it("yeni tam ekran profilde mevcut paket, ödeme aboneliği ve gerçek ödeme kayıtlarını ayrı sunar", () => {
    expect(indexHtml).toContain('id="user-detail-modal"');
    expect(indexHtml).toContain('class="user-profile-workspace hidden"');
    expect(appJs).toContain('id="user-current-access-title"');
    expect(appJs).toContain('id="billing-title"');
    expect(appJs).toContain("Henüz doğrulanmış ödeme kaydı yok");
    expect(appJs).toContain("Otomatik yenileme bilgisi bu kayıtta sunulmuyor.");
    expect(designSystem).toContain(".app.superadmin-shell .user-current-access-card");
  });
});
