import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8").replace(/\r\n/gu, "\n");

function between(source: string, start: string, end: string): string {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  expect(startAt, `Missing source marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endAt, `Missing source marker: ${end}`).toBeGreaterThan(startAt);
  return source.slice(startAt, endAt);
}

describe("TCKN minimization UI contract", () => {
  it("removes TCKN inputs and normalization from all account-management forms", () => {
    expect(index).not.toContain('id="signup-national-id"');
    expect(index).not.toContain('id="account-profile-national-id"');
    expect(index).not.toContain('id="tenant-form-admin-national-id"');
    expect(index).not.toContain('id="user-form-national-id"');
    expect(index).not.toContain('id="student-form-national-id"');
    expect(index).not.toContain('id="teacher-form-national-id"');
    expect(index).not.toContain('id="user-detail-national-id"');
    expect(app).not.toContain("tenant-form-admin-national-id");
    expect(app).not.toContain("normalizeNationalIdValue");

    const personDataEvents = between(
      app,
      "function setupPersonDataEvents()",
      "let inFlight = false;",
    );
    expect(personDataEvents).not.toContain('"signup-national-id"');
    expect(personDataEvents).not.toContain('"tenant-form-admin-national-id"');
    for (const managementField of [
      "user-form-national-id",
      "student-form-national-id",
      "teacher-form-national-id",
    ]) {
      expect(personDataEvents).not.toContain(`"${managementField}"`);
    }
  });

  it("does not load TCKN into, or submit it from, create/update management forms", () => {
    const userForm = between(
      app,
      "function openUserForm(",
      "async function populateUserFormTenantSelect(",
    );
    const userSubmit = between(
      app,
      "async function submitUserForm(",
      "async function openUserDetail(",
    );
    const userDetailSubmit = between(
      app,
      "async function submitUserDetailForm(",
      "async function resetAdminUserPassword(",
    );
    const studentForm = between(
      app,
      "async function openStudentForm(",
      "function closeStudentForm(",
    );
    const studentSubmit = between(
      app,
      "async function submitStudentForm(",
      "async function openStudentDetail(",
    );
    const teacherForm = between(app, "function openTeacherForm(", "function closeTeacherForm(");
    const teacherSubmit = between(
      app,
      "async function submitTeacherForm(",
      "async function openTeacherDetail(",
    );

    for (const source of [
      userForm,
      userSubmit,
      userDetailSubmit,
      studentForm,
      studentSubmit,
      teacherForm,
      teacherSubmit,
    ]) {
      expect(source).not.toContain("nationalId");
      expect(source).not.toContain("national-id");
    }
  });

  it("never reads or sends TCKN in the initial tenant administrator payload", () => {
    const submitTenant = between(
      app,
      "async function submitTenantForm(",
      "async function openTenantDetail(",
    );
    expect(submitTenant).not.toContain("nationalId");
    expect(submitTenant).not.toContain("tenant-form-admin-national-id");
  });

  it("never reads or sends TCKN in individual signup/profile requests", () => {
    const signup = between(app, "async function signup(", "async function socialLogin(");
    expect(signup).not.toContain("nationalId");

    const signupHandler = between(
      app,
      '$("signup-form").addEventListener("submit"',
      '$("login-form").addEventListener("submit"',
    );
    expect(signupHandler).not.toContain("nationalId");
    expect(signupHandler).toContain("signup(displayName, email, password, phone)");

    const loadProfile = between(
      app,
      "async function loadAccountProfile()",
      "async function submitAccountProfile(",
    );
    const submitProfile = between(
      app,
      "async function submitAccountProfile(",
      "function setupAccountProfileEvents(",
    );
    expect(loadProfile).not.toContain("nationalId");
    expect(submitProfile).not.toContain("nationalId");
  });
});
