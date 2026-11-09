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
    hidden: true,
    disabled: false,
    textContent: "Hesap silme talebi gönder",
  };
  const retry = { hidden: true };
  const nodes: Record<string, unknown> = {
    "account-deletion-request-status": status,
    "account-deletion-request-error": error,
    "account-deletion-request-submit": button,
    "account-deletion-request-retry": retry,
  };
  const fetch = vi.fn(async () => ({}));
  const parseResponse = vi.fn(async () => ({ request: null }));
  const context = createContext({
    $: (id: string) => nodes[id],
    profileView: { deletionState: "idle" },
    formatStudentError: () => "Oturumun sona ermiş olabilir.",
    authenticatedFetch: fetch,
    parseResponse,
    ...overrides,
  });
  runInContext(
    functionSource(
      "function accountDeletionRequestStatusMessage(",
      "function configureOrganizationScopeUi()",
    ),
    context,
  );
  return { context, status, error, button, retry, fetch, parseResponse, nodes };
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
    const details = { open: false, scrollIntoView: vi.fn() };
    const context = createContext({
      URL,
      $: () => details,
      requestAnimationFrame: (callback: () => void) => callback(),
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
    expect(details.open).toBe(true);
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
    expect(htmlSource).toContain('id="profile-deletion-details"');
    expect(htmlSource).toContain('id="account-deletion-request-status"');
    expect(htmlSource).toContain('role="alert"');
    expect(htmlSource).toContain('id="account-deletion-request-submit"');
    expect(htmlSource).toContain('id="profile-deletion-confirm-send"');
    expect(htmlSource).toContain("Talep kaydı hesabını kapatmaz ve verilerini silmez.");
  });

  it("loads only the current session owner's status and hides duplicate request action", async () => {
    const h = makeHarness();
    h.parseResponse.mockResolvedValue({
      request: { id: "request-1", status: "IDENTITY_REQUIRED" },
    });
    await runInContext("loadAccountDeletionRequest()", h.context);

    expect(h.fetch).toHaveBeenCalledExactlyOnceWith(
      "/auth/account-deletion-requests/current",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(h.status.textContent).toContain("ek kimlik doğrulaması bekliyor");
    expect(h.button.hidden).toBe(true);
  });

  it("only posts after confirmation and uses the authenticated fetch wrapper", async () => {
    const h = makeHarness();
    const events = new Map<string, () => unknown>();
    const bind = (id: string) => ({
      addEventListener: (name: string, fn: () => unknown) => events.set(id + name, fn),
    });
    const details = { ...bind("details"), open: false };
    const dialog = {
      open: false,
      showModal: vi.fn(() => {
        dialog.open = true;
      }),
      close: vi.fn(() => {
        dialog.open = false;
      }),
    };
    h.nodes["profile-deletion-details"] = details;
    h.nodes["profile-deletion-confirm"] = dialog;
    h.nodes["profile-deletion-confirm-send"] = bind("confirm");
    Object.assign(h.button, bind("submit"));
    Object.assign(h.retry, bind("retry"));
    runInContext("setupAccountDeletionRequestEvents()", h.context);
    events.get("detailstoggle")!();
    expect(h.fetch).not.toHaveBeenCalled();
    await runInContext("loadAccountDeletionRequest()", h.context);
    expect(h.button.hidden).toBe(false);
    events.get("submitclick")!();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    dialog.close();
    events.get("confirmclick")!();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    h.parseResponse.mockResolvedValue({
      request: { id: "request-2", status: "IDENTITY_REQUIRED" },
    });
    events.get("submitclick")!();
    events.get("confirmclick")!();
    await vi.waitFor(() =>
      expect(h.status.textContent).toContain("ek kimlik doğrulaması bekliyor"),
    );

    expect(h.fetch).toHaveBeenLastCalledWith(
      "/auth/account-deletion-requests",
      expect.objectContaining({
        method: "POST",
        body: "{}",
      }),
    );
    expect(h.button.hidden).toBe(true);
  });

  it("does not expose a failed lookup as an empty result and enables safe retry", async () => {
    const h = makeHarness();
    h.parseResponse.mockRejectedValueOnce(new Error("Prisma P2021: relation missing"));
    await runInContext("loadAccountDeletionRequest()", h.context);
    expect(h.error.textContent).toContain("Talep durumu şu anda yüklenemiyor");
    expect(h.error.textContent).not.toContain("Prisma");
    expect(h.error.classList.remove).toHaveBeenCalledWith("hidden");
    expect(h.retry.hidden).toBe(false);
    expect(h.button.hidden).toBe(true);
    await runInContext("loadAccountDeletionRequest(true)", h.context);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    await runInContext("loadAccountDeletionRequest()", h.context);
    expect(h.retry.hidden).toBe(true);
    expect(h.button.hidden).toBe(false);
  });

  it("checks status before offering to resend after an ambiguous POST failure", async () => {
    const h = makeHarness();
    await runInContext("loadAccountDeletionRequest()", h.context);
    h.parseResponse.mockRejectedValueOnce(new Error("Connection lost"));
    await runInContext("loadAccountDeletionRequest(true)", h.context);
    expect(h.error.textContent).toContain("Yeniden göndermeden önce");
    expect(h.retry.hidden).toBe(false);
    expect(h.button.hidden).toBe(true);
  });

  it("ignores a response that belongs to an earlier profile view", async () => {
    const h = makeHarness();
    const pending = runInContext("loadAccountDeletionRequest()", h.context);
    runInContext("profileView = { deletionState: 'idle' }", h.context);
    await pending;
    expect(h.button.hidden).toBe(true);
    expect(runInContext("profileView.deletionState", h.context)).toBe("idle");
  });

  it("retries a cookie-only write with the CSRF token from the refreshed session", async () => {
    let csrf = "original";
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ status: 202 });
    const refreshStoredTokens = vi.fn(async () => {
      csrf = "refreshed";
      return { accessToken: null };
    });
    const context = createContext({
      fetch,
      refreshStoredTokens,
      nativeMobileRuntime: false,
      getStoredTokens: () => ({ accessToken: null, refreshToken: null, tenantId: "tenant-a" }),
      authHeaders: () => ({ "content-type": "application/json", "x-tenant-id": "tenant-a" }),
      csrfHeaders: () => ({ "x-csrf-token": csrf }),
    });
    runInContext(
      functionSource(
        "function authenticatedRequestHeaders(",
        "async function refreshStoredTokens(",
      ) + functionSource("async function authenticatedFetch(", "async function logout("),
      context,
    );
    await runInContext(
      'authenticatedFetch("/auth/account-deletion-requests", { method: "POST", body: "{}" })',
      context,
    );
    expect(refreshStoredTokens).toHaveBeenCalledExactlyOnceWith(null, "tenant-a");
    expect(fetch.mock.calls.map(([, request]) => request.headers)).toEqual(
      ["original", "refreshed"].map((token) => ({
        "x-auth-transport": "cookie",
        "content-type": "application/json",
        "x-tenant-id": "tenant-a",
        "x-csrf-token": token,
      })),
    );
    expect(fetch.mock.calls.every(([, request]) => request.credentials === "include")).toBe(true);
  });
});
