import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

function functionSource(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) throw new Error(`UI function boundary missing: ${start}`);
  return source.slice(startIndex, endIndex);
}

function analyticsStudentFlowSource(includeFetcher = false): string {
  return [
    ...(includeFetcher
      ? [
          functionSource(
            "async function fetchAnalyticsStudentDetail(",
            "function handleAnalyticsStudentClick(",
          ),
        ]
      : []),
    functionSource(
      "function setAnalyticsStudentButtonLoading(",
      "function handleAnalyticsStudentClick(",
    ),
    functionSource("function handleAnalyticsStudentClick(", "function showAnalyticsStudentError("),
    functionSource(
      "function showAnalyticsStudentError(",
      "async function openAnalyticsStudentWorkspace(",
    ),
    functionSource(
      "async function openAnalyticsStudentWorkspace(",
      "async function loadAnalyticsStudentDetail(",
    ),
    functionSource(
      "async function loadAnalyticsStudentDetail(",
      "async function loadAnalyticsPage(",
    ),
  ].join("\n");
}

describe("admin student workspace and question editing UI", () => {
  it("labels account contexts and platform role without exposing raw markup", () => {
    const context = createContext({
      MEMBERSHIP_ROLE_LABELS: { STUDENT: "Öğrenci", TEACHER: "Öğretmen" },
      MEMBERSHIP_STATUS_LABELS: { ACTIVE: "Aktif" },
      escapeHtml: (value: unknown) =>
        String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
      platformRoleLabel: () => "Platform yöneticisi",
      tenantTypeLabel: (type: string) => (type === "INDIVIDUAL" ? "Bireysel" : "Kurumsal"),
      planLabel: (plan: string) => (plan === "PLAN_PREMIUM" ? "Ücretli Paket" : "Ücretsiz Paket"),
      entitlementSourceLabel: (source: string) => source,
    });
    const renderers = runInContext(
      `${functionSource("function renderUserAccountTypes(", "function userInitials(")}; ({renderUserAccountTypes, renderUserContextSummary})`,
      context,
    ) as {
      renderUserAccountTypes: (user: unknown) => string;
      renderUserContextSummary: (user: unknown) => string;
    };
    const user = {
      platformRole: "SUPER_ADMIN",
      accountContexts: [
        {
          tenantName: "<Örnek Kurum>",
          tenantType: "ORGANIZATION",
          memberships: [{ role: "STUDENT", status: "ACTIVE", deleted: false }],
        },
      ],
    };
    const typesHtml = renderers.renderUserAccountTypes(user);
    const contextHtml = renderers.renderUserContextSummary(user);
    expect(typesHtml).toContain("Platform");
    expect(typesHtml).toContain("Kurumsal");
    expect(contextHtml).toContain("Öğrenci · Aktif");
    expect(contextHtml).toContain("&lt;Örnek Kurum&gt;");
    expect(contextHtml).not.toContain("<Örnek Kurum>");
  });

  it("shows every account context and its own package in the user list", () => {
    const context = createContext({
      MEMBERSHIP_ROLE_LABELS: { STUDENT: "Öğrenci", PARENT: "Veli" },
      MEMBERSHIP_STATUS_LABELS: { ACTIVE: "Aktif", PENDING: "Beklemede" },
      escapeHtml: (value: unknown) => String(value),
      tenantTypeLabel: (type: string) => (type === "INDIVIDUAL" ? "Bireysel" : "Kurum"),
      planLabel: (plan: string) => (plan === "PLAN_PREMIUM" ? "Ücretli Paket" : "Ücretsiz Paket"),
      entitlementSourceLabel: (source: string) => source,
    });
    const renderers = runInContext(
      `${functionSource("function renderUserContextSummary(", "function renderUserAccessSummary(")}; ${functionSource("function accountContextMembershipSummary(", "function userInitials(")}; ({renderUserContextSummary, renderUserPackageSummary, renderMembershipStatusSummary})`,
      context,
    ) as {
      renderUserContextSummary: (user: unknown) => string;
      renderUserPackageSummary: (user: unknown) => string;
      renderMembershipStatusSummary: (user: unknown) => string;
    };
    const user = {
      accountContexts: [
        {
          tenantName: "Kişisel alan",
          tenantType: "INDIVIDUAL",
          memberships: [{ role: "STUDENT", status: "ACTIVE", deleted: false }],
          packageRight: { plan: "PLAN_PREMIUM", source: "ADMIN" },
        },
        {
          tenantName: "Örnek Okul",
          tenantType: "ORGANIZATION",
          memberships: [{ role: "PARENT", status: "PENDING", deleted: false }],
          packageRight: { plan: "PLAN_FREE", source: "DEFAULT" },
        },
      ],
    };
    const html = [
      renderers.renderUserContextSummary(user),
      renderers.renderUserPackageSummary(user),
      renderers.renderMembershipStatusSummary(user),
    ].join("\n");
    expect(html).toContain("Kişisel alan");
    expect(html).toContain("Örnek Okul");
    expect(html).toContain("Ücretli Paket");
    expect(html).toContain("Ücretsiz Paket");
    expect(html).toContain("Beklemede");
  });

  it("opens the matching shared student profile from the analytics row", async () => {
    const openStudentDetail = vi.fn(async () => true);
    const data = { student: { profileId: "profile-1" } };
    const fetchDetail = vi.fn(async () => data);
    const context = createContext({
      analyticsRequest: 7,
      analyticsStudentDetailRequest: 0,
      fetchAnalyticsStudentDetail: fetchDetail,
      openStudentDetail,
      $: () => ({ textContent: "", classList: { add() {}, remove() {} } }),
    });
    runInContext(
      `${functionSource("async function openAnalyticsStudentWorkspace(", "async function loadAnalyticsStudentDetail(")}; openAnalyticsStudentWorkspace`,
      context,
    );
    await runInContext("openAnalyticsStudentWorkspace('student-1', {requestId:7})", context);
    expect(openStudentDetail).toHaveBeenCalledExactlyOnceWith("profile-1", {
      analyticsData: data,
      isCurrent: expect.any(Function),
    });
    expect(fetchDetail).toHaveBeenCalledExactlyOnceWith("student-1");
  });

  it("handles an analytics details-button click using the row's student identity", () => {
    const loadDetail = vi.fn();
    const context = createContext({ loadAnalyticsStudentDetail: loadDetail });
    const handleClick = runInContext(
      `${functionSource("function handleAnalyticsStudentClick(", "function showAnalyticsStudentError(")}; handleAnalyticsStudentClick`,
      context,
    ) as (event: unknown) => void;

    handleClick({
      target: {
        closest(selector: string) {
          return selector === "[data-analytics-student]"
            ? { disabled: false, dataset: { analyticsStudent: "student-user-7" } }
            : null;
        },
      },
    });

    expect(loadDetail).toHaveBeenCalledExactlyOnceWith("student-user-7");
  });

  it("shows immediate loading feedback on the Analytics details button and restores it", async () => {
    let resolveLoad: () => void = () => {};
    const load = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });
    const label = { textContent: "Ayrıntıları aç" };
    const spinner = { classList: { toggle: vi.fn() } };
    const button = {
      disabled: false,
      dataset: { analyticsStudent: "student-user-12", analyticsStudentOpen: "true" },
      querySelector(selector: string) {
        if (selector === "[data-analytics-detail-label]") return label;
        if (selector === "[data-analytics-detail-spinner]") return spinner;
        return null;
      },
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };
    const context = createContext({ loadAnalyticsStudentDetail: vi.fn(() => load) });
    const flow = runInContext(
      [
        functionSource(
          "function setAnalyticsStudentButtonLoading(",
          "function handleAnalyticsStudentClick(",
        ),
        functionSource(
          "function handleAnalyticsStudentClick(",
          "function showAnalyticsStudentError(",
        ),
      ].join("\n") + "; handleAnalyticsStudentClick",
      context,
    ) as (event: unknown) => Promise<void>;

    const request = flow({
      target: {
        closest(selector: string) {
          return selector === "[data-analytics-student]" ? button : null;
        },
      },
    });

    expect(button.disabled).toBe(true);
    expect(button.setAttribute).toHaveBeenCalledWith("aria-busy", "true");
    expect(label.textContent).toBe("Ayrıntılar yükleniyor…");
    expect(spinner.classList.toggle).toHaveBeenCalledWith("hidden", false);

    resolveLoad();
    await request;

    expect(button.disabled).toBe(false);
    expect(button.removeAttribute).toHaveBeenCalledWith("aria-busy");
    expect(label.textContent).toBe("Ayrıntıları aç");
    expect(spinner.classList.toggle).toHaveBeenLastCalledWith("hidden", true);
  });

  it("resolves the analytics student ID to its profile ID before opening profile detail", async () => {
    const response = { student: { id: "student-user-7", profileId: "profile-9" } };
    const authenticatedFetch = vi.fn(async () => ({}));
    const openStudentDetail = vi.fn(async () => true);
    const analyticsError = { textContent: "", classList: { add: vi.fn(), remove: vi.fn() } };
    const context = createContext({
      analyticsRequest: 3,
      analyticsStudentDetailRequest: 0,
      analyticsQuery: () => new URLSearchParams("from=2026-10-01"),
      authenticatedFetch,
      parseResponse: async () => response,
      openStudentDetail,
      encodeURIComponent,
      $: (id: string) => (id === "analytics-error" ? analyticsError : null),
    });
    const flow = runInContext(
      `${analyticsStudentFlowSource(true)}; ({handleAnalyticsStudentClick, loadAnalyticsStudentDetail})`,
      context,
    ) as {
      handleAnalyticsStudentClick: (event: unknown) => Promise<void> | void;
      loadAnalyticsStudentDetail: (id: string) => Promise<void>;
    };

    await flow.handleAnalyticsStudentClick({
      target: {
        closest(selector: string) {
          return selector === "[data-analytics-student]"
            ? { disabled: false, dataset: { analyticsStudent: "student-user-7" } }
            : null;
        },
      },
    });

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/admin/analytics/students/student-user-7?from=2026-10-01",
    );
    expect(openStudentDetail).toHaveBeenCalledWith(
      "profile-9",
      expect.objectContaining({ analyticsData: response }),
    );
  });

  it("opens the visible student detail modal from an Analytics button click", async () => {
    const studentModal = { classList: { remove: vi.fn() } };
    const title = { textContent: "" };
    const body = { innerHTML: "" };
    const analyticsError = { textContent: "", classList: { add: vi.fn(), remove: vi.fn() } };
    const analyticsData = { student: { id: "student-user-11", profileId: "profile-11" } };
    const profile = {
      id: "profile-11",
      user: { id: "student-user-11", displayName: "Öğrenci On Bir" },
    };
    const renderStudentDetail = vi.fn();
    const renderStudentDetailAnalytics = vi.fn();
    const analyticsResponse = { kind: "analytics" };
    const profileResponse = { kind: "profile" };
    const authenticatedFetch = vi.fn(async () => analyticsResponse);
    const studentApi = vi.fn(async () => profileResponse);
    const elements: Record<string, unknown> = {
      "analytics-error": analyticsError,
      "student-detail-modal": studentModal,
      "student-detail-title": title,
      "student-detail-body": body,
    };
    const context = createContext({
      analyticsRequest: 5,
      analyticsStudentDetailRequest: 0,
      studentDetailRequest: 0,
      studentDetailCurrent: null,
      analyticsQuery: () => new URLSearchParams("from=2026-10-01"),
      authenticatedFetch,
      studentApi,
      parseResponse: async (response: unknown) =>
        response === analyticsResponse ? analyticsData : profile,
      renderStudentDetail,
      renderStudentDetailAnalytics,
      encodeURIComponent,
      escapeHtml: (value: unknown) => String(value),
      $: (id: string) => elements[id],
    });
    const flowSource = [
      ...analyticsStudentFlowSource(true).split("\n"),
      functionSource("async function openStudentDetail(", "function renderStudentDetail("),
    ].join("\n");
    const flow = runInContext(`${flowSource}; ({handleAnalyticsStudentClick})`, context) as {
      handleAnalyticsStudentClick: (event: unknown) => Promise<void>;
    };

    await flow.handleAnalyticsStudentClick({
      target: {
        closest(selector: string) {
          return selector === "[data-analytics-student]"
            ? { disabled: false, dataset: { analyticsStudent: "student-user-11" } }
            : null;
        },
      },
    });

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/admin/analytics/students/student-user-11?from=2026-10-01",
    );
    expect(studentModal.classList.remove).toHaveBeenCalledWith("hidden");
    expect(studentApi).toHaveBeenCalledWith("/profile-11");
    expect(renderStudentDetail).toHaveBeenCalledExactlyOnceWith(profile);
    expect(renderStudentDetailAnalytics).toHaveBeenCalledExactlyOnceWith(analyticsData);
    expect(analyticsError.classList.add).toHaveBeenCalledWith("hidden");
  });

  it("shows analytics API failures in the visible alert instead of swallowing them", async () => {
    const error = { textContent: "", classList: { add: vi.fn(), remove: vi.fn() } };
    const context = createContext({
      analyticsRequest: 0,
      analyticsStudentDetailRequest: 0,
      fetchAnalyticsStudentDetail: vi.fn(async () => {
        throw new Error("Öğrenci ayrıntısı için yetkiniz yok.");
      }),
      showUserError: vi.fn(),
      $: (id: string) => (id === "analytics-error" ? error : null),
    });
    const flow = runInContext(
      `${analyticsStudentFlowSource()}; ({handleAnalyticsStudentClick, loadAnalyticsStudentDetail})`,
      context,
    ) as {
      handleAnalyticsStudentClick: (event: unknown) => Promise<void> | void;
      loadAnalyticsStudentDetail: (id: string) => Promise<void>;
    };

    await flow.handleAnalyticsStudentClick({
      target: {
        closest(selector: string) {
          return selector === "[data-analytics-student]"
            ? { disabled: false, dataset: { analyticsStudent: "student-user-7" } }
            : null;
        },
      },
    });

    expect(error.textContent).toBe("Öğrenci ayrıntısı için yetkiniz yok.");
    expect(error.classList.remove).toHaveBeenCalledWith("hidden");
  });

  it("surfaces a failed profile-detail request in Analytics as well", async () => {
    const error = { textContent: "", classList: { add: vi.fn(), remove: vi.fn() } };
    const detailError = { textContent: "Öğrenci profili açılamadı." };
    const context = createContext({
      analyticsRequest: 0,
      analyticsStudentDetailRequest: 0,
      fetchAnalyticsStudentDetail: vi.fn(async () => ({ student: { profileId: "profile-9" } })),
      openStudentDetail: vi.fn(async () => false),
      showUserError: vi.fn(),
      $: (id: string) => {
        if (id === "analytics-error") return error;
        if (id === "student-detail-body") return { querySelector: () => detailError };
        return null;
      },
    });
    const flow = runInContext(
      `${analyticsStudentFlowSource()}; loadAnalyticsStudentDetail`,
      context,
    ) as (id: string) => Promise<void>;

    await flow("student-user-7");

    expect(error.textContent).toBe("Öğrenci profili açılamadı.");
    expect(error.classList.remove).toHaveBeenCalledWith("hidden");
  });

  it("opens the same student workspace from User Management when the account has student access", async () => {
    const hideSubpage = vi.fn();
    const showList = vi.fn();
    const elements = {
      "analytics-error": { classList: { add() {} } },
      "user-management-subpage": { classList: { add: hideSubpage } },
      "user-list-view": { classList: { remove: showList } },
    };
    const openStudentDetail = vi.fn(async () => true);
    const data = { student: { profileId: "profile-2" } };
    const context = createContext({
      analyticsRequest: 0,
      analyticsStudentDetailRequest: 0,
      userDetailRequest: 0,
      userDetailCurrent: null,
      fetchAnalyticsStudentDetail: vi.fn(async () => data),
      openStudentDetail,
      showUserError: vi.fn(),
      $: (id: string) => elements[id as keyof typeof elements],
    });
    runInContext(
      `${functionSource("async function openAnalyticsStudentWorkspace(", "async function loadAnalyticsStudentDetail(")}; openAnalyticsStudentWorkspace`,
      context,
    );
    await runInContext("openAnalyticsStudentWorkspace('user-2', {closeUserDetail:true})", context);
    expect(openStudentDetail).toHaveBeenCalledExactlyOnceWith("profile-2", {
      analyticsData: data,
      isCurrent: expect.any(Function),
    });
    expect(hideSubpage).toHaveBeenCalledExactlyOnceWith("hidden");
    expect(showList).toHaveBeenCalledExactlyOnceWith("hidden");
  });

  it("keeps a student name click in User Management on the general user detail", () => {
    const openUserDetail = vi.fn();
    const openWorkspace = vi.fn();
    const listeners: Record<string, (event: unknown) => void> = {};
    const page = {
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners[type] = listener;
      },
    };
    const context = createContext({
      openUserDetail,
      openAnalyticsStudentWorkspace: openWorkspace,
      $: () => page,
    });
    const handleClick = runInContext(
      `${functionSource("function setupUserEvents()", "// ---------- Öğrenci / sınıf kayıtları yönetimi ----------")}; setupUserEvents`,
      context,
    ) as () => void;
    handleClick();

    listeners.click({
      target: {
        closest: () => ({
          id: "",
          dataset: { userDetailId: "user-42" },
          matches: (selector: string) => selector === "[data-user-detail-id]",
        }),
      },
    });
    expect(openUserDetail).toHaveBeenCalledExactlyOnceWith("user-42");
    expect(openWorkspace).not.toHaveBeenCalled();
  });

  it("renders student and non-student names as general user-detail links", () => {
    const listBody = { innerHTML: "" };
    const elements: Record<
      string,
      { innerHTML?: string; textContent?: string; disabled?: boolean }
    > = {
      "user-list-body": listBody,
      "user-page-info": { textContent: "" },
      "user-prev-btn": { disabled: false },
      "user-next-btn": { disabled: false },
    };
    const context = createContext({
      userData: [
        {
          id: "student-user",
          displayName: "Öğrenci Adı",
          roleConnections: [{ role: "STUDENT" }],
          status: "ACTIVE",
          membershipCount: 1,
        },
        {
          id: "teacher-user",
          displayName: "Öğretmen Adı",
          roleConnections: [{ role: "TEACHER" }],
          status: "ACTIVE",
          membershipCount: 1,
        },
      ],
      userTotal: 2,
      userPage: 1,
      USER_PAGE_SIZE: 20,
      $: (id: string) => elements[id],
      escapeHtml: (value: unknown) => String(value),
      renderUserAccountTypes: () => "hesap türü",
      renderUserContextSummary: () => "bağlam",
      renderUserPackageSummary: () => "paket",
      renderMembershipStatusSummary: () => "üyelik",
      renderUserAccessSummary: () => "erişim",
      userInitials: () => "ÖA",
      formatTurkishPhoneValue: (value: unknown) => String(value),
      userStatusBadge: () => "durum",
      document: { querySelectorAll: () => [] },
      Math,
    });
    runInContext(
      `${functionSource("function renderUserList()", "function renderUserAccountTypes(")}; renderUserList`,
      context,
    )();

    expect(listBody.innerHTML).toContain('data-user-detail-id="student-user"');
    expect(listBody.innerHTML).toContain('data-user-detail-id="teacher-user"');
    expect(listBody.innerHTML).not.toContain("data-user-open-student");
  });

  it("ignores an older analytics response after a newer student was selected", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const openStudentDetail = vi.fn(async () => true);
    const context = createContext({
      analyticsRequest: 4,
      analyticsStudentDetailRequest: 0,
      fetchAnalyticsStudentDetail: vi
        .fn()
        .mockReturnValueOnce(first)
        .mockResolvedValueOnce({ student: { profileId: "profile-new" } }),
      openStudentDetail,
      showUserError: vi.fn(),
      $: () => ({ classList: { add() {} } }),
    });
    runInContext(
      `${functionSource("async function openAnalyticsStudentWorkspace(", "async function loadAnalyticsStudentDetail(")}; openAnalyticsStudentWorkspace`,
      context,
    );

    const older = runInContext("openAnalyticsStudentWorkspace('student-old')", context);
    await runInContext("openAnalyticsStudentWorkspace('student-new')", context);
    resolveFirst({ student: { profileId: "profile-old" } });
    await older;

    expect(openStudentDetail).toHaveBeenCalledExactlyOnceWith("profile-new", {
      analyticsData: { student: { profileId: "profile-new" } },
      isCurrent: expect.any(Function),
    });
  });

  it("ignores an older User Management response after a different user was selected", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const renderUserDetail = vi.fn();
    const elements = {
      "user-list-view": { classList: { add() {}, remove() {} } },
      "user-management-subpage": { classList: { add() {}, remove() {} }, innerHTML: "" },
    };
    const context = createContext({
      userDetailRequest: 0,
      analyticsStudentDetailRequest: 0,
      userDetailCurrent: null,
      userDetailTab: "general",
      userApi: vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce({ id: "user-new" }),
      parseResponse: async (value: unknown) => value,
      renderUserDetail,
      encodeURIComponent,
      escapeHtml: (value: unknown) => String(value),
      $: (id: string) => elements[id as keyof typeof elements],
    });
    runInContext(
      `${functionSource("async function openUserDetail(", "function renderUserDetail(")}; openUserDetail`,
      context,
    );

    const older = runInContext("openUserDetail('user-old')", context);
    await runInContext("openUserDetail('user-new')", context);
    resolveFirst({ id: "user-old" });
    await older;

    expect(renderUserDetail).toHaveBeenCalledExactlyOnceWith({ id: "user-new" });
  });

  it("keeps User Management open when the shared student detail fails", async () => {
    const close = vi.fn();
    const context = createContext({
      analyticsRequest: 0,
      analyticsStudentDetailRequest: 0,
      fetchAnalyticsStudentDetail: vi.fn(async () => ({ student: { profileId: "profile-2" } })),
      openStudentDetail: vi.fn(async () => false),
      showUserError: vi.fn(),
      $: (id: string) => ({
        classList: { add: id === "user-detail-modal" ? close : vi.fn() },
      }),
    });
    runInContext(
      `${functionSource("async function openAnalyticsStudentWorkspace(", "async function loadAnalyticsStudentDetail(")}; openAnalyticsStudentWorkspace`,
      context,
    );

    await runInContext(
      "openAnalyticsStudentWorkspace('student-2', {closeUserDetail:true})",
      context,
    );
    expect(close).not.toHaveBeenCalled();
  });

  it("loads analytics inside the open student profile instead of navigating to another page", async () => {
    const panel = { innerHTML: "" };
    const button = { disabled: false, isConnected: true };
    const data = { student: { id: "user-3" } };
    const render = vi.fn();
    const context = createContext({
      studentDetailCurrent: { user: { id: "user-3" } },
      analyticsQuery: () => new URLSearchParams("from=2026-01-01"),
      authenticatedFetch: vi.fn(async () => ({})),
      parseResponse: async () => data,
      renderStudentDetailAnalytics: render,
      encodeURIComponent,
      escapeHtml: (value: unknown) => String(value),
      $: (id: string) =>
        id === "student-detail-analytics-content" ? panel : { querySelector: () => button },
    });
    runInContext(
      `${functionSource("async function loadStudentDetailAnalytics(", "async function populateEnrollmentAddYear(")}; loadStudentDetailAnalytics`,
      context,
    );
    await runInContext("loadStudentDetailAnalytics('user-3')", context);
    expect(render).toHaveBeenCalledExactlyOnceWith(data);
    expect(button.disabled).toBe(false);
    expect(context.authenticatedFetch).toHaveBeenCalledWith(
      "/admin/analytics/students/user-3?from=2026-01-01",
    );
  });

  it("labels locked steps clearly in the admin analytics workspace", () => {
    const panel = { innerHTML: "" };
    const context = createContext({
      $: () => panel,
      escapeHtml: (value: unknown) => String(value),
      formatDateTime: (value: unknown) => String(value),
    });
    runInContext(
      `${functionSource("function renderStudentDetailAnalytics(", "async function loadStudentDetailAnalytics(")}; renderStudentDetailAnalytics`,
      context,
    )({
      performance: {
        correctRatio: 100,
        completedExercises: 1,
        readingSpeed: { available: false, points: [] },
        readingComprehension: { available: false, points: [] },
        skillsNeedingReview: [],
      },
      journey: { areas: [], paths: [] },
      activity: { items: [], limitations: [], truncated: false },
      period: { from: "2026-01-01", to: "2026-01-31" },
    });
    expect(panel.innerHTML).toContain("<th>Kilitli adım</th>");
  });

  it("opens the new version draft in the editor immediately after cloning", async () => {
    const questionApi = vi.fn(async () => ({}));
    const editVersion = vi.fn(async () => {});
    const context = createContext({
      currentQuestionId: "question-1",
      questionAuthoringContext: null,
      questionApi,
      parseResponse: async () => ({ id: "version-2" }),
      loadQuestionVersions: vi.fn(async () => {}),
      loadQuestions: vi.fn(),
      handleQuestionVersionEdit: editVersion,
      showQuestionError: vi.fn(),
      hideQuestionError: vi.fn(),
      setTimeout: vi.fn(),
      $() {
        return { classList: { add() {} }, textContent: "" };
      },
    });
    runInContext(
      `${functionSource("async function handleQuestionNewVersion()", "async function handleQuestionVersionEdit(")}; handleQuestionNewVersion`,
      context,
    );
    await runInContext("handleQuestionNewVersion()", context);
    expect(questionApi).toHaveBeenCalledExactlyOnceWith("/questions/question-1/versions", {
      method: "POST",
      body: "{}",
    });
    expect(editVersion).toHaveBeenCalledExactlyOnceWith("version-2");
  });

  it("keeps skill, source, hint, explanation, answer and passage fields in the version authoring flow", () => {
    expect(source).toContain("sourceReference,");
    expect(source).toContain('$("question-form-hint").value');
    expect(source).toContain('$("question-form-explanation").value');
    expect(source).toContain("const correctOptionIds = rows");
    expect(source).toContain(
      '$("question-form-skill").closest(".field").classList.remove("hidden")',
    );
    expect(source).toContain('$("content-authoring-body")');
    expect(source).toContain("skillId,");
  });

  it("renders the edited question source in the reopened draft preview", () => {
    expect(source).toContain("<strong>Soru kaynağı:</strong>");
    expect(source).toContain("escapeHtml(question.sourceReference ||");
  });

  it("guards the shared profile response against a superseded selection", () => {
    expect(source).toContain("options.isCurrent && !options.isCurrent()");
  });
});
