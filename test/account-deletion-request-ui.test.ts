import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const deletionPageSource = readFileSync(
  new URL("../public/account-deletion.html", import.meta.url),
  "utf8",
);

function functionSource(start: string, end: string): string {
  const startIndex = appSource.indexOf(start);
  const endIndex = appSource.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) throw new Error(`UI function boundary missing: ${start}`);
  return appSource.slice(startIndex, endIndex);
}

function makeHarness(overrides: Record<string, unknown> = {}) {
  const status = { textContent: "" };
  const error = {
    textContent: "",
    classList: { add: vi.fn(), remove: vi.fn() },
  };
  const button = {
    hidden: false,
    disabled: false,
    textContent: "Talep oluştur",
  };
  const nodes: Record<string, unknown> = {
    "account-deletion-request-status": status,
    "account-deletion-request-error": error,
    "account-deletion-request-submit": button,
  };
  const fetch = vi.fn(async () => ({}));
  const parseResponse = vi.fn(async () => ({ request: null }));
  const context = createContext({
    $: (id: string) => nodes[id],
    getStoredTokens: () => ({ accessToken: "current-session", tenantId: "tenant-a" }),
    authHeaders: (accessToken: string, tenantId: string) => ({
      authorization: `Bearer ${accessToken}`,
      "x-tenant-id": tenantId,
      "content-type": "application/json",
    }),
    csrfHeaders: () => ({ "x-csrf-token": "csrf-token" }),
    setAsyncButtonState: (target: typeof button, busy: boolean) => {
      target.disabled = busy;
    },
    fetch,
    parseResponse,
    ...overrides,
  });
  return { context, status, error, button, fetch, parseResponse };
}

describe("account deletion request UI", () => {
  it("provides a public Turkish deletion-request page without claiming the account was deleted", () => {
    expect(deletionPageSource).toContain('<html lang="tr">');
    expect(deletionPageSource).toContain("OkuPratik");
    expect(deletionPageSource).toContain('href="/?account-deletion=1"');
    expect(deletionPageSource).toContain("Talep kaydı hesabı veya verileri silmez.");
    expect(deletionPageSource).toContain("belirli bir sürede yapılacağı sözü verilmez");
  });

  it("opens account settings after sign-in from the external deletion link and removes its marker", () => {
    const navigate = vi.fn();
    const replaceState = vi.fn();
    const context = createContext({
      URL,
      window: {
        location: { href: "https://www.okupratik.com/?account-deletion=1&campaign=store#request" },
        history: { replaceState },
      },
      canAccessPage: () => true,
      navigate,
    });
    const helper = functionSource(
      "function openAccountDeletionRequestFromExternalLink()",
      "function organizationTenantOption(select)",
    );

    expect(runInContext(`${helper}; openAccountDeletionRequestFromExternalLink()`, context)).toBe(
      true,
    );
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?campaign=store#request");
    expect(navigate).toHaveBeenCalledExactlyOnceWith("settings");
    expect(appSource).toContain("if (openAccountDeletionRequestFromExternalLink()) return;");
  });

  it("does not send an external link to settings when the signed-in role cannot access them", () => {
    const navigate = vi.fn();
    const replaceState = vi.fn();
    const context = createContext({
      URL,
      window: {
        location: { href: "https://www.okupratik.com/?account-deletion=1" },
        history: { replaceState },
      },
      canAccessPage: () => false,
      navigate,
    });
    const helper = functionSource(
      "function openAccountDeletionRequestFromExternalLink()",
      "function organizationTenantOption(select)",
    );

    expect(runInContext(`${helper}; openAccountDeletionRequestFromExternalLink()`, context)).toBe(
      false,
    );
    expect(replaceState).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("adds an accessible settings entry point that clearly says no data is deleted", () => {
    expect(htmlSource).toContain('aria-labelledby="account-deletion-request-title"');
    expect(htmlSource).toContain('id="account-deletion-request-status"');
    expect(htmlSource).toContain('role="alert"');
    expect(htmlSource).toContain('id="account-deletion-request-submit"');
    expect(htmlSource).toContain("Talep kaydı hesabını kapatmaz ve verilerini silmez.");
  });

  it("loads only the current session owner's status and hides duplicate request action", async () => {
    const h = makeHarness();
    h.parseResponse.mockResolvedValue({
      request: { id: "request-1", status: "IDENTITY_REQUIRED" },
    });
    runInContext(
      `${functionSource("function accountDeletionRequestStatusMessage(", "async function submitAccountDeletionRequest()")}; loadAccountDeletionRequest`,
      h.context,
    );
    await runInContext("loadAccountDeletionRequest()", h.context);

    expect(h.fetch).toHaveBeenCalledExactlyOnceWith(
      "/auth/account-deletion-requests/current",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(h.status.textContent).toContain("ek kimlik doğrulaması bekliyor");
    expect(h.status.textContent).toContain("verilerini silmez");
    expect(h.button.hidden).toBe(true);
  });

  it("posts an empty body with auth and CSRF headers, then reports request-only success", async () => {
    const h = makeHarness();
    h.parseResponse.mockResolvedValue({
      request: { id: "request-2", status: "IDENTITY_REQUIRED" },
      message: "Talebin kaydedildi; bu kayıt verilerini silmez.",
    });
    runInContext(
      `${functionSource("async function submitAccountDeletionRequest()", "function setupAccountDeletionRequestEvents()")}; submitAccountDeletionRequest`,
      h.context,
    );
    await runInContext("submitAccountDeletionRequest()", h.context);

    expect(h.fetch).toHaveBeenCalledExactlyOnceWith(
      "/auth/account-deletion-requests",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer current-session",
          "x-csrf-token": "csrf-token",
        }),
        body: "{}",
      }),
    );
    expect(h.status.textContent).toContain("bu kayıt verilerini silmez");
    expect(h.button.hidden).toBe(true);
    expect(h.button.disabled).toBe(false);
  });

  it("shows a visible error when request creation fails", async () => {
    const h = makeHarness({
      parseResponse: async () => {
        throw new Error("Talep kaydedilemedi");
      },
    });
    runInContext(
      `${functionSource("async function submitAccountDeletionRequest()", "function setupAccountDeletionRequestEvents()")}; submitAccountDeletionRequest`,
      h.context,
    );
    await runInContext("submitAccountDeletionRequest()", h.context);

    expect(h.error.textContent).toBe("Talep kaydedilemedi");
    expect(h.error.classList.remove).toHaveBeenCalledWith("hidden");
    expect(h.button.hidden).toBe(false);
    expect(h.button.disabled).toBe(false);
  });
});
