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

describe("individual TCKN minimization UI contract", () => {
  it("removes TCKN from signup and personal profile while keeping management forms", () => {
    expect(index).not.toContain('id="signup-national-id"');
    expect(index).not.toContain('id="account-profile-national-id"');
    expect(index).toContain('id="tenant-form-admin-national-id"');
    expect(index).toContain('id="user-form-national-id"');
    expect(index).toContain('id="student-form-national-id"');
    expect(index).toContain('id="teacher-form-national-id"');

    const personDataEvents = between(
      app,
      "function setupPersonDataEvents()",
      "let inFlight = false;",
    );
    expect(personDataEvents).not.toContain('"signup-national-id"');
    for (const managementField of [
      "tenant-form-admin-national-id",
      "user-form-national-id",
      "student-form-national-id",
      "teacher-form-national-id",
    ]) {
      expect(personDataEvents).toContain(`"${managementField}"`);
    }
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
