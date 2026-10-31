import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const appJs = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const designSystem = readFileSync(new URL("../public/design-system.css", import.meta.url), "utf8");

describe("Superadmin yönetim kabuğu", () => {
  it("groups the existing management pages without changing their navigation identifiers", () => {
    for (const label of [
      "GENEL",
      "KULLANICI YÖNETİMİ",
      "KURUM YÖNETİMİ",
      "EĞİTİM YÖNETİMİ",
      "ANALİZ",
    ]) {
      expect(indexHtml).toContain(`data-platform-nav-label>${label}</span>`);
    }

    for (const page of [
      "dashboard",
      "users",
      "students",
      "teachers",
      "tenants",
      "branches",
      "classes",
      "academic-years",
      "contents",
      "questions",
      "curriculum-drafts",
      "templates",
      "skills",
      "levels",
      "analytics",
      "organization-dashboard",
      "branch-dashboard",
      "assignments",
      "teacher-classes",
      "exercise",
      "assessments",
      "badges",
      "lessons",
      "progress",
    ]) {
      expect(indexHtml).toContain(`data-page="${page}"`);
    }

    expect(indexHtml).toContain('data-page="curriculum-drafts"');
    expect(indexHtml).toContain("data-super-admin-only");
    expect(indexHtml).toContain('id="sidebar-toggle"');
    expect(appJs).toContain('sidebarBackdrop.id = "sidebar-backdrop"');
  });

  it("updates the admin title from the current navigation label without touching routing", () => {
    const title = { textContent: "" };
    const breadcrumb = { textContent: "" };
    const pages = [
      {
        dataset: { page: "users" },
        querySelector: () => ({ textContent: "Kullanıcılar" }),
      },
    ];
    const context = createContext({
      $: (id: string) => (id === "admin-page-title" ? title : breadcrumb),
      document: { querySelectorAll: () => pages },
    });
    const start = appJs.indexOf("function updatePlatformAdminHeading(");
    const end = appJs.indexOf("function setStudentMoreMenuOpen(", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    runInContext(`${appJs.slice(start, end)}; updatePlatformAdminHeading("users")`, context);

    expect(title.textContent).toBe("Kullanıcılar");
    expect(breadcrumb.textContent).toBe("Yönetim Masası / Kullanıcılar");
    expect(appJs).toContain('currentPlatformRole === "SUPER_ADMIN"');
    expect(appJs).toContain("updatePlatformAdminHeading(page)");
  });

  it("scopes the redesigned shell and responsive layout to Superadmin", () => {
    expect(designSystem).toContain(".app.superadmin-shell .sidebar {");
    expect(designSystem).toContain(".app.superadmin-shell .data-table {");
    expect(designSystem).toContain(
      ".app.superadmin-shell .platform-nav-label[data-platform-nav-label]",
    );
    expect(designSystem).toContain("@media (max-width: 900px) {\n  .app.superadmin-shell .sidebar");
    expect(designSystem).toContain("@media (max-width: 600px) {\n  .app.superadmin-shell .topbar");
    expect(designSystem).toContain(".platform-page-heading {\n  display: none;");
    expect(designSystem).toContain(".platform-nav-label,\n.platform-sidebar-footer");
  });
});
