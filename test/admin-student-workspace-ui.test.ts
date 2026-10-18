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

describe("admin student workspace and question editing UI", () => {
  it("labels account roles by platform and tenant scope without exposing raw markup", () => {
    const context = createContext({
      MEMBERSHIP_ROLE_LABELS: { STUDENT: "Öğrenci", TEACHER: "Öğretmen" },
      MEMBERSHIP_STATUS_LABELS: { ACTIVE: "Aktif" },
      escapeHtml: (value: unknown) =>
        String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
      platformRoleLabel: () => "Platform yöneticisi",
      tenantTypeLabel: (type: string) => (type === "INDIVIDUAL" ? "Bireysel" : "Kurumsal"),
    });
    const render = runInContext(
      `${functionSource("function renderUserRoleConnections(", "const INDIVIDUAL_ALLOWED_ROLES")}; renderUserRoleConnections`,
      context,
    ) as (user: unknown) => string;

    const html = render({
      platformRole: "SUPER_ADMIN",
      roleConnections: [
        {
          role: "STUDENT",
          status: "ACTIVE",
          tenantName: "<Örnek Kurum>",
          tenantType: "ORGANIZATION",
        },
      ],
    });
    expect(html).toContain("Platform yöneticisi");
    expect(html).toContain("Kurumsal · Öğrenci");
    expect(html).toContain("&lt;Örnek Kurum&gt;");
    expect(html).not.toContain("<Örnek Kurum>");
  });

  it("opens the shared student profile from the analytics row", async () => {
    const openStudentDetail = vi.fn(async () => {});
    const data = { student: { profileId: "profile-1" } };
    const context = createContext({
      analyticsRequest: 7,
      fetchAnalyticsStudentDetail: vi.fn(async () => data),
      openStudentDetail,
      $: () => ({ textContent: "", classList: { remove() {} } }),
    });
    runInContext(
      `${functionSource("async function loadAnalyticsStudentDetail(", "async function loadAnalyticsPage()")}; loadAnalyticsStudentDetail`,
      context,
    );
    await runInContext("loadAnalyticsStudentDetail('student-1', 7)", context);
    expect(openStudentDetail).toHaveBeenCalledExactlyOnceWith("profile-1", { analyticsData: data });
  });

  it("opens the same student workspace from User Management when the account has student access", async () => {
    const close = vi.fn();
    const openStudentDetail = vi.fn(async () => {});
    const data = { student: { profileId: "profile-2" } };
    const context = createContext({
      fetchAnalyticsStudentDetail: vi.fn(async () => data),
      openStudentDetail,
      showUserError: vi.fn(),
      $: () => ({ classList: { add: close } }),
    });
    runInContext(
      `${functionSource("async function openAnalyticsStudentWorkspace(", "async function loadAnalyticsStudentDetail(")}; openAnalyticsStudentWorkspace`,
      context,
    );
    await runInContext("openAnalyticsStudentWorkspace('user-2', {closeUserDetail:true})", context);
    expect(openStudentDetail).toHaveBeenCalledExactlyOnceWith("profile-2", { analyticsData: data });
    expect(close).toHaveBeenCalledExactlyOnceWith("hidden");
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
});
