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
  const cancelButton = { hidden: true, addEventListener: vi.fn() };
  const profileFields = { disabled: false };
  const profileSubmit = { disabled: false };
  const retry = { hidden: true };
  const nodes: Record<string, unknown> = {
    "account-deletion-request-status": status,
    "account-deletion-request-error": error,
    "account-deletion-request-submit": button,
    "account-deletion-request-cancel": cancelButton,
    "account-deletion-request-retry": retry,
    "account-profile-fields": profileFields,
    "account-profile-submit": profileSubmit,
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
  return {
    context,
    status,
    error,
    button,
    cancelButton,
    retry,
    profileFields,
    profileSubmit,
    fetch,
    parseResponse,
    nodes,
  };
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
    expect(htmlSource).toContain('id="account-deletion-request-cancel"');
    expect(htmlSource).toContain('id="profile-deletion-cancel-confirm"');
    expect(htmlSource).toContain('id="profile-deletion-cancel-confirm-send"');
    expect(htmlSource).toContain("Talep kaydı hesabını kapatmaz ve verilerini silmez.");
  });

  it("keeps the admin table, message field, and request detail in the review page", () => {
    const ids = [...htmlSource.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    const accountPageStart = htmlSource.indexOf('id="page-account-deletion-requests"');
    const accountPageEnd = htmlSource.indexOf('id="page-settings"', accountPageStart);
    const detailIndex = htmlSource.indexOf('id="account-deletion-admin-detail"');

    expect(ids.filter((id) => id === "account-deletion-admin-table-body")).toHaveLength(1);
    expect(ids.filter((id) => id === "account-deletion-admin-message-body")).toHaveLength(1);
    expect(ids).not.toContain("account-deletion-admin-body");
    expect(detailIndex).toBeGreaterThan(accountPageStart);
    expect(detailIndex).toBeLessThan(accountPageEnd);
    expect(appSource).toContain('data-account-deletion-admin-open="${escapeHtml(item.id)}"');
    expect(appSource).toContain('$("account-deletion-admin-table-body")');
    expect(appSource).toContain('$("account-deletion-admin-message-body").value.trim()');
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
    expect(dialog.open).toBe(false);

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

  it("only cancels the exact pending request after confirmation and keeps other profile controls available", async () => {
    const h = makeHarness({
      profileView: { deletionState: "recorded", requestId: "request-a" },
    });
    const events = new Map<string, () => unknown>();
    const bind = (id: string) => ({
      addEventListener: (name: string, fn: () => unknown) => events.set(id + name, fn),
    });
    const cancelDialog = {
      open: false,
      showModal: vi.fn(() => {
        cancelDialog.open = true;
      }),
      close: vi.fn(() => {
        cancelDialog.open = false;
      }),
    };
    h.nodes["profile-deletion-confirm"] = { open: false, close: vi.fn() };
    h.nodes["profile-deletion-cancel-confirm"] = cancelDialog;
    h.nodes["profile-deletion-confirm-send"] = bind("submit-confirm");
    h.nodes["profile-deletion-cancel-confirm-send"] = bind("cancel-confirm");
    h.nodes["profile-deletion-details"] = { ...bind("details"), open: false };
    Object.assign(h.button, bind("submit"));
    Object.assign(h.retry, bind("retry"));
    Object.assign(h.cancelButton, bind("cancel"));
    runInContext("setupAccountDeletionRequestEvents()", h.context);

    events.get("cancelclick")!();
    expect(cancelDialog.showModal).toHaveBeenCalledOnce();
    expect(h.fetch).not.toHaveBeenCalled();
    cancelDialog.open = true;
    h.parseResponse.mockResolvedValue({
      cancelled: true,
      message: "Talebin geri çekildi. Hesabın, profilin ve diğer verilerin etkilenmedi.",
    });
    events.get("cancel-confirmclick")!();
    await vi.waitFor(() => expect(h.status.textContent).toContain("Talebin geri çekildi"));

    expect(cancelDialog.close).toHaveBeenCalledOnce();
    expect(cancelDialog.open).toBe(false);
    expect(h.fetch).toHaveBeenCalledExactlyOnceWith(
      "/auth/account-deletion-requests/request-a/cancel",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    expect(h.button.hidden).toBe(false);
    expect(h.cancelButton.hidden).toBe(true);
    expect(h.profileFields.disabled).toBe(false);
    expect(h.profileSubmit.disabled).toBe(false);
  });

  it("closes both request dialogs whenever the profile view is opened", () => {
    const requestDialog = { close: vi.fn() };
    const cancelDialog = { close: vi.fn() };
    const nodes = {
      "account-profile-submit": { disabled: false },
      "account-profile-fields": { disabled: false },
      "account-profile-birthyear": { max: "" },
      "user-name": { textContent: "Deneme" },
      "profile-support-actions": { hidden: false },
      "profile-support-availability": { textContent: "" },
      "pilot-support-status": { textContent: "" },
      "profile-deletion-details": { open: true },
      "profile-deletion-confirm": requestDialog,
      "profile-deletion-cancel-confirm": cancelDialog,
      "account-deletion-request-error": { classList: { add: vi.fn() } },
      "account-deletion-request-status": { textContent: "" },
      "account-deletion-request-retry": { hidden: false },
      "account-deletion-request-submit": { hidden: false },
      "account-deletion-request-cancel": { hidden: false },
      "profile-progress": { classList: { toggle: vi.fn() } },
      "profile-progress-metrics": { classList: { add: vi.fn() } },
      "profile-progress-status": { textContent: "" },
    };
    const context = createContext({
      $: (id: string) => nodes[id as keyof typeof nodes],
      profileView: null,
      isStudentUser: false,
      setAsyncButtonState: vi.fn(),
      fillAccountProfile: vi.fn(),
      loadAccountProfile: vi.fn(),
      Date,
    });
    runInContext(
      functionSource("function openProfileView()", "function setupAccountProfileEvents()"),
      context,
    );
    runInContext("openProfileView()", context);
    expect(requestDialog.close).toHaveBeenCalledOnce();
    expect(cancelDialog.close).toHaveBeenCalledOnce();
  });

  it("keeps the request review page Super Admin only, paginated and limited to the requested PII", async () => {
    expect(htmlSource).toContain('data-page="account-deletion-requests"');
    expect(htmlSource).toContain('id="page-account-deletion-requests"');
    expect(appSource).toContain(
      'if (page === "account-deletion-requests") return currentPlatformRole === "SUPER_ADMIN";',
    );

    const body = { innerHTML: "" };
    const nodes: Record<string, { textContent?: string; innerHTML?: string; disabled?: boolean }> =
      {
        "account-deletion-admin-status": { textContent: "" },
        "account-deletion-admin-table-body": body,
        "account-deletion-admin-page-info": { textContent: "" },
        "account-deletion-admin-prev": { disabled: false },
        "account-deletion-admin-next": { disabled: false },
      };
    const authenticatedFetch = vi.fn(async (_path: string, _options: unknown) => ({}));
    const parseResponse = vi.fn(async () => ({
      items: [
        {
          id: "request-1",
          userDisplayName: "<img src=x onerror=alert(1)>",
          createdAt: "2026-11-01T10:00:00.000Z",
          status: "IDENTITY_REQUIRED",
          cancelledAt: null,
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
    }));
    const context = createContext({
      currentPlatformRole: "SUPER_ADMIN",
      accountDeletionAdminPage: 1,
      accountDeletionAdminFilter: "pending",
      accountDeletionAdminRequestRevision: 0,
      $: (id: string) => nodes[id],
      authenticatedFetch,
      authenticatedFetchWithTimeout: (path: string, options: unknown) =>
        authenticatedFetch(path, options),
      parseResponse,
      URLSearchParams,
      Intl,
      Date,
      accountDeletionStatusLabel: (status: string) => status,
      escapeHtml: (value: string) =>
        value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;"),
    });
    runInContext(
      functionSource(
        "function formatAccountDeletionRequestDate(",
        "function configureOrganizationScopeUi()",
      ),
      context,
    );
    await runInContext("loadAdminAccountDeletionRequests()", context);

    expect(authenticatedFetch).toHaveBeenCalledExactlyOnceWith(
      "/admin/account-deletion-requests?status=pending&page=1&pageSize=25",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(body.innerHTML).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(body.innerHTML).not.toContain("<img src=x");
    expect(nodes["account-deletion-admin-page-info"].textContent).toBe("1–1 / 1 talep");
    expect(nodes["account-deletion-admin-prev"].disabled).toBe(true);
    expect(nodes["account-deletion-admin-next"].disabled).toBe(true);
  });

  it("sends status, user replies, and internal notes from the dedicated message field", async () => {
    const detail = { dataset: { requestId: "request-1" } };
    const controls: Record<
      string,
      { value?: string; textContent?: string; dataset?: Record<string, string> }
    > = {
      "account-deletion-admin-detail": detail,
      "account-deletion-admin-next-status": { value: "AWAITING_USER" },
      "account-deletion-admin-message-body": { value: "Lütfen ek bilgi gönderin." },
      "account-deletion-admin-visibility": { value: "USER" },
      "account-deletion-admin-action-status": { textContent: "" },
    };
    const authenticatedFetch = vi.fn(async (_path: string, _options: { body: string }) => ({}));
    const parseResponse = vi.fn(async () => ({}));
    const reloadDetail = vi.fn(async () => undefined);
    const reloadList = vi.fn(async () => undefined);
    const context = createContext({
      $: (id: string) => controls[id],
      authenticatedFetch,
      parseResponse,
      loadAdminAccountDeletionDetail: reloadDetail,
      loadAdminAccountDeletionRequests: reloadList,
      formatStudentError: () => "İşlem başarısız.",
    });
    runInContext(
      functionSource(
        "async function submitAdminAccountDeletionAction(",
        "function setupAdminAccountDeletionRequestEvents()",
      ),
      context,
    );
    const event = { preventDefault: vi.fn() };
    context.event = event;

    await runInContext("submitAdminAccountDeletionAction(event)", context);
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(authenticatedFetch.mock.calls[0][1].body)).toEqual({
      status: "AWAITING_USER",
      body: "Lütfen ek bilgi gönderin.",
      visibility: "USER",
    });
    expect(reloadDetail).toHaveBeenCalledWith("request-1");
    expect(reloadList).toHaveBeenCalledOnce();

    controls["account-deletion-admin-next-status"].value = "";
    controls["account-deletion-admin-message-body"].value = "Yalnızca iç not.";
    controls["account-deletion-admin-visibility"].value = "INTERNAL";
    await runInContext("submitAdminAccountDeletionAction(event)", context);
    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(authenticatedFetch.mock.calls[1][1].body)).toEqual({
      body: "Yalnızca iç not.",
      visibility: "INTERNAL",
    });
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
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
