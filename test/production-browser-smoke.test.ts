import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSafeLoginDiagnostic,
  buildSafeLoginDiagnosticWithCode,
  classifyLoginFailureReason,
  classifyLoginHttpStatus,
  consumeJsonLoginErrorBody,
} from "../scripts/run-production-browser-smoke.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-browser-smoke.yml", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("../scripts/run-production-browser-smoke.ts", import.meta.url),
  "utf8",
);

describe("production browser smoke safety contract", () => {
  it.each([
    [401, "AUTH_REJECTED"],
    [403, "AUTH_REJECTED"],
    [400, "BAD_REQUEST"],
    [429, "RATE_LIMITED"],
    [500, "SERVER_ERROR"],
    [503, "SERVER_ERROR"],
    [404, "UNEXPECTED_STATUS"],
  ] as const)("classifies login HTTP %d safely as %s", (status, category) => {
    expect(classifyLoginHttpStatus(status)).toBe(category);
    expect(buildSafeLoginDiagnostic(status)).toEqual({
      loginHttpStatus: status,
      loginErrorCategory: category,
      loginFailureReason:
        status === 401 ? "AUTH_REJECTED" : status === 403 ? "FORBIDDEN" : category,
    });
  });

  it("maps only known API error codes to fixed failure reasons", () => {
    expect(classifyLoginFailureReason(403, "FORBIDDEN")).toBe("FORBIDDEN");
    expect(classifyLoginFailureReason(403, "UNAUTHORIZED")).toBe("AUTH_REJECTED");
    expect(classifyLoginFailureReason(403)).toBe("FORBIDDEN");
    expect(buildSafeLoginDiagnosticWithCode(403, "FORBIDDEN")).toEqual({
      loginHttpStatus: 403,
      loginErrorCategory: "AUTH_REJECTED",
      loginFailureReason: "FORBIDDEN",
    });
  });

  it("consumes JSON error bodies without exposing their fields", async () => {
    let jsonCalls = 0;
    await expect(
      consumeJsonLoginErrorBody({
        headers: () => ({ "content-type": "application/json; charset=utf-8" }),
        json: async () => {
          jsonCalls += 1;
          return {
            error: { code: "FORBIDDEN", message: "do not report this" },
            email: "student@example.com",
            token: "secret-token",
            password: "secret-password",
          };
        },
      }),
    ).resolves.toBe("FORBIDDEN");
    expect(jsonCalls).toBe(1);

    let textJsonCalls = 0;
    await consumeJsonLoginErrorBody({
      headers: () => ({ "content-type": "text/html" }),
      json: async () => {
        textJsonCalls += 1;
        return { email: "student@example.com" };
      },
    });
    expect(textJsonCalls).toBe(0);

    const report = JSON.stringify(buildSafeLoginDiagnostic(401));
    expect(report).not.toContain("student@example.com");
    expect(report).not.toContain("secret-token");
    expect(report).not.toContain("secret-password");

    const unknownCode = await consumeJsonLoginErrorBody({
      headers: () => ({ "content-type": "application/json" }),
      json: async () => ({ error: { code: "ORIGIN_REJECTED", email: "student@example.com" } }),
    });
    expect(unknownCode).toBeNull();
    expect(JSON.stringify(buildSafeLoginDiagnosticWithCode(403, unknownCode))).not.toContain(
      "ORIGIN_REJECTED",
    );
  });

  it("is manually triggered and protected by production-smoke", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:\s*\n/u);
    expect(workflow).toContain("environment: production-smoke");
    expect(workflow).not.toMatch(/^\s+push:/mu);
    expect(workflow).not.toMatch(/^\s+pull_request:/mu);
    expect(workflow).toContain("PRODUCTION_SMOKE_EMAIL: ${{ secrets.PRODUCTION_SMOKE_EMAIL }}");
    expect(workflow).toContain(
      "PRODUCTION_SMOKE_PASSWORD: ${{ secrets.PRODUCTION_SMOKE_PASSWORD }}",
    );
  });

  it("allows only login/logout writes and canonical production hosts", () => {
    expect(script).toContain('"https://www.okupratik.com"');
    expect(script).not.toContain('"https://okuplus.vercel.app"');
    expect(script).toContain('url.pathname === "/auth/login" || url.pathname === "/auth/logout"');
    expect(script).toContain('page.locator("#guest-login-btn")');
    expect(script).toContain('loginUrl.searchParams.set("auth", "google-error")');
    expect(script).toContain('"/student/today"');
    expect(script).toContain('"/student/progress"');
    expect(script).toContain('"/student/history?page=1&pageSize=5"');
    expect(script).toContain("loginHttpStatus");
    expect(script).toContain("loginErrorCategory");
    expect(script).toContain("loginFailureReason");
    expect(script).toContain("consumeJsonLoginErrorBody");
    expect(script).toContain('productionStateChanged: "NO"');
    expect(script).toContain("pageErrorMessages");
    expect(script).toContain("sanitizePageError");
    expect(script).not.toContain("/student/questions/");
    expect(script).not.toContain("/complete");
    expect(script).not.toContain("prisma");
    expect(script).not.toContain("DATABASE_URL");
    expect(script).not.toContain("secret-password");
  });
});
