import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

function functionSource(start: string, end: string): string {
  const startIndex = appSource.indexOf(start);
  const endIndex = appSource.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) throw new Error(`UI function boundary missing: ${start}`);
  return appSource.slice(startIndex, endIndex);
}

function makeListHarness(
  kind: "deletion" | "support",
  response = { items: [], total: 0, page: 1, pageSize: 25 },
  hangFirstRequest = false,
) {
  const ids =
    kind === "deletion"
      ? [
          "account-deletion-admin-status",
          "account-deletion-admin-table-body",
          "account-deletion-admin-page-info",
          "account-deletion-admin-filter",
          "account-deletion-admin-prev",
          "account-deletion-admin-next",
          "account-deletion-admin-action-form",
          "account-deletion-admin-detail",
          "account-deletion-detail-title",
          "account-deletion-detail-summary",
          "account-deletion-detail-messages",
          "account-deletion-admin-next-status",
          "account-deletion-admin-message-body",
          "account-deletion-admin-visibility",
          "account-deletion-admin-action-submit",
          "account-deletion-admin-action-status",
          "account-deletion-detail-close",
          "page-account-deletion-requests",
        ]
      : [
          "admin-support-body",
          "admin-support-status",
          "admin-support-page-info",
          "admin-support-filter",
          "admin-support-prev",
          "admin-support-next",
          "admin-support-action-form",
          "admin-support-detail-close",
          "page-support-tickets",
        ];
  const listeners = new Map<string, (event?: unknown) => unknown>();
  const nodes = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        textContent: "",
        innerHTML: "",
        value: kind === "deletion" ? "pending" : "NEW",
        disabled: false,
        dataset: {},
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        addEventListener: (event: string, listener: (event?: unknown) => unknown) =>
          listeners.set(`${id}:${event}`, listener),
      },
    ]),
  ) as Record<string, Record<string, unknown>>;
  const timers: Array<() => void> = [];
  const window = {
    setTimeout: vi.fn((callback: () => void) => {
      timers.push(callback);
      return timers.length;
    }),
    clearTimeout: vi.fn(),
  };
  let requestCount = 0;
  const authenticatedFetch = vi.fn((_path: string, options: { signal: AbortSignal }) => {
    requestCount += 1;
    if (!hangFirstRequest || requestCount > 1) return Promise.resolve({});
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        "abort",
        () => reject(Object.assign(new Error("request timed out"), { name: "AbortError" })),
        { once: true },
      );
    });
  });
  const context = createContext({
    AbortController,
    URLSearchParams,
    window,
    $: (id: string) => nodes[id],
    currentPlatformRole: "SUPER_ADMIN",
    accountDeletionAdminRequestRevision: 0,
    accountDeletionAdminFilter: "pending",
    accountDeletionAdminPage: 1,
    supportAdminRequestRevision: 0,
    supportAdminPage: 1,
    submitAdminAccountDeletionAction: vi.fn(),
    submitAdminSupportAction: vi.fn(),
    authenticatedFetch,
    parseResponse: vi.fn(async () => response),
    escapeHtml: (value: unknown) => String(value),
    formatAccountDeletionRequestDate: () => "—",
    accountDeletionStatusLabel: (value: string) => value,
    supportCategoryLabel: (value: string) => value,
    supportStatusLabel: (value: string) => value,
  });

  runInContext(
    functionSource("async function authenticatedFetchWithTimeout(", "async function logout("),
    context,
  );
  if (kind === "deletion") {
    runInContext(
      functionSource(
        "async function loadAdminAccountDeletionRequests()",
        "async function loadAdminAccountDeletionDetail(",
      ),
      context,
    );
    runInContext(
      functionSource(
        "function setupAdminAccountDeletionRequestEvents()",
        "async function loadAdminSupportTickets()",
      ),
      context,
    );
  } else {
    runInContext(
      functionSource(
        "async function loadAdminSupportTickets()",
        "async function loadAdminSupportTicketDetail(",
      ),
      context,
    );
    runInContext(
      functionSource("function setupAdminSupportEvents()", "function renderNotifications("),
      context,
    );
  }

  return { context, nodes, listeners, timers, authenticatedFetch };
}

describe("Super Admin talep listeleri", () => {
  it.each(["deletion", "support"] as const)(
    "%s listesi mevcut kayıtları gösterir",
    async (kind) => {
      const response =
        kind === "deletion"
          ? {
              items: [
                {
                  id: "request-1",
                  status: "UNDER_REVIEW",
                  createdAt: "2026-11-09T10:00:00.000Z",
                  cancelledAt: null,
                  userDisplayName: "Deneme Öğrencisi",
                },
              ],
              total: 1,
              page: 1,
              pageSize: 25,
            }
          : {
              items: [
                {
                  id: "ticket-1",
                  subject: "Giriş sorunu",
                  category: "ACCOUNT",
                  status: "NEW",
                  updatedAt: "2026-11-09T10:00:00.000Z",
                  userDisplayName: "Deneme Öğrencisi",
                  unread: false,
                },
              ],
              total: 1,
              page: 1,
              pageSize: 25,
            };
      const h = makeListHarness(kind, response);
      const loader =
        kind === "deletion" ? "loadAdminAccountDeletionRequests" : "loadAdminSupportTickets";
      const bodyId =
        kind === "deletion" ? "account-deletion-admin-table-body" : "admin-support-body";

      await runInContext(`${loader}()`, h.context);

      expect(String(h.nodes[bodyId].innerHTML)).toContain("Deneme Öğrencisi");
      expect(String(h.nodes[bodyId].innerHTML)).not.toContain("Yükleniyor");
    },
  );

  it.each(["deletion", "support"] as const)(
    "%s listesi API yanıt vermediğinde yüklemeyi sonlandırır ve Yenile ile yeniden dener",
    async (kind) => {
      const h = makeListHarness(kind, { items: [], total: 0, page: 1, pageSize: 25 }, true);
      const loader =
        kind === "deletion" ? "loadAdminAccountDeletionRequests" : "loadAdminSupportTickets";
      const bodyId =
        kind === "deletion" ? "account-deletion-admin-table-body" : "admin-support-body";
      const statusId =
        kind === "deletion" ? "account-deletion-admin-status" : "admin-support-status";
      const refreshId =
        kind === "deletion" ? "account-deletion-admin-refresh" : "admin-support-refresh";
      h.nodes[refreshId] = {
        addEventListener: (event: string, listener: (event?: unknown) => unknown) =>
          h.listeners.set(`${refreshId}:${event}`, listener),
      };
      runInContext(
        kind === "deletion"
          ? functionSource(
              "function setupAdminAccountDeletionRequestEvents()",
              "async function loadAdminSupportTickets()",
            ) + "\nsetupAdminAccountDeletionRequestEvents();"
          : functionSource("function setupAdminSupportEvents()", "function renderNotifications(") +
              "\nsetupAdminSupportEvents();",
        h.context,
      );

      const pending = runInContext(`${loader}()`, h.context) as Promise<void>;
      expect(String(h.nodes[bodyId].innerHTML)).toContain("Yükleniyor");
      expect(h.timers).toHaveLength(1);
      h.timers[0]();
      await pending;

      expect(String(h.nodes[bodyId].innerHTML)).toContain("yanıt vermedi");
      expect(String(h.nodes[bodyId].innerHTML)).not.toContain("Yükleniyor");
      expect(String(h.nodes[statusId].textContent)).toContain("Yenile");
      expect(h.authenticatedFetch.mock.calls[0][1].signal.aborted).toBe(true);

      h.listeners.get(`${refreshId}:click`)?.();
      await vi.waitFor(() => expect(h.authenticatedFetch).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(String(h.nodes[bodyId].innerHTML)).toContain("Bu filtrede"));
      expect(String(h.nodes[statusId].textContent)).toContain("güncel");
    },
  );

  it("opens the selected request detail from its row and returns to the list", async () => {
    const h = makeListHarness("deletion");
    h.context.parseResponse = vi.fn(async () => ({
      request: {
        id: "request-1",
        status: "UNDER_REVIEW",
        createdAt: "2026-11-09T10:00:00.000Z",
        cancelledAt: null,
        userDisplayName: "Deneme Öğrencisi",
      },
      messages: [],
      activities: [],
    }));
    h.context.renderSupportConversation = vi.fn();
    h.context.formatStudentError = () => "Talep yüklenemedi.";
    runInContext(
      functionSource(
        "async function loadAdminAccountDeletionDetail(",
        "async function submitAdminAccountDeletionAction(",
      ),
      h.context,
    );
    runInContext(
      functionSource(
        "function setupAdminAccountDeletionRequestEvents()",
        "async function loadAdminSupportTickets()",
      ) + "\nsetupAdminAccountDeletionRequestEvents();",
      h.context,
    );

    h.listeners.get("page-account-deletion-requests:click")?.({
      target: {
        closest: () => ({ dataset: { accountDeletionAdminOpen: "request-1" } }),
      },
    });
    await vi.waitFor(() =>
      expect(h.nodes["account-deletion-admin-detail"].classList.remove).toHaveBeenCalledWith(
        "hidden",
      ),
    );
    expect(h.authenticatedFetch).toHaveBeenCalledWith(
      "/admin/account-deletion-requests/request-1",
      expect.objectContaining({ cache: "no-store" }),
    );
    await vi.waitFor(() =>
      expect(String(h.nodes["account-deletion-detail-summary"].textContent)).toContain(
        "UNDER_REVIEW",
      ),
    );
    expect(String(h.nodes["account-deletion-detail-summary"].textContent)).toContain(
      "UNDER_REVIEW",
    );

    h.listeners.get("account-deletion-detail-close:click")?.();
    expect(h.nodes["account-deletion-admin-detail"].classList.add).toHaveBeenCalledWith("hidden");
  });

  it.each([
    ["ACCOUNT_DELETION_REQUEST", "account-deletion-requests"],
    ["SUPPORT_TICKET", "support-tickets"],
  ])("bildirimden ilgili Super Admin talebini açar", async (targetType, page) => {
    const notification = {
      id: "notification-1",
      targetType,
      targetId: "target-1",
    };
    const navigate = vi.fn();
    const loadNotifications = vi.fn(async () => undefined);
    const deletionDetail = vi.fn(async () => undefined);
    const supportDetail = vi.fn(async () => undefined);
    const authenticatedFetchWithTimeout = vi.fn(async () => ({}));
    const panelDetails = { removeAttribute: vi.fn() };
    const context = createContext({
      notificationItems: [notification],
      currentPlatformRole: "SUPER_ADMIN",
      authenticatedFetchWithTimeout,
      parseResponse: vi.fn(async (response) => response),
      loadNotifications,
      navigate,
      loadAdminAccountDeletionDetail: deletionDetail,
      loadAdminSupportTicketDetail: supportDetail,
      $: () => ({ closest: () => panelDetails }),
    });
    runInContext(
      functionSource("async function openNotification(", "function setupNotificationEvents("),
      context,
    );

    await runInContext('openNotification("notification-1")', context);

    expect(authenticatedFetchWithTimeout).toHaveBeenCalledWith(
      "/notifications/notification-1/read",
      expect.objectContaining({ method: "POST" }),
    );
    expect(loadNotifications).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(page);
    if (targetType === "ACCOUNT_DELETION_REQUEST") {
      expect(deletionDetail).toHaveBeenCalledWith("target-1");
      expect(supportDetail).not.toHaveBeenCalled();
    } else {
      expect(supportDetail).toHaveBeenCalledWith("target-1");
      expect(deletionDetail).not.toHaveBeenCalled();
    }
    expect(panelDetails.removeAttribute).toHaveBeenCalledWith("open");
  });
});
