const SUPERADMIN_PAGES = [
  "overview",
  "organizations",
  "org-users",
  "individual-users",
  "platform-users",
  "packages",
  "subscriptions",
  "payments",
  "activity",
  "settings",
];

const pageTitles = {
  overview: "Genel Bakış",
  organizations: "Kurumlar",
  "org-users": "Kurumsal Kullanıcılar",
  "individual-users": "Bireysel Kullanıcılar",
  "platform-users": "Platform Kullanıcıları",
  packages: "Paketler",
  subscriptions: "Abonelikler",
  payments: "Ödemeler",
  activity: "İşlem Geçmişi",
  settings: "Ayarlar",
};

function $(id) {
  return document.getElementById(id);
}

function showPage(page) {
  if (!SUPERADMIN_PAGES.includes(page)) return;
  document.querySelectorAll("[data-page]").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.page === page);
  });
  document.querySelectorAll(".sa-nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.page === page);
  });
  const title = $("sa-page-title");
  if (title) title.textContent = pageTitles[page] || "Superadmin";
  const sidebar = $("sa-sidebar");
  sidebar?.classList.remove("is-open");
  void loadPageData(page);
}

async function api(path) {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) throw new Error("request_failed");
  const body = await response.json().catch(() => ({}));
  return body?.data ?? body;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderEmpty(container, message) {
  if (!container) return;
  container.innerHTML = `<div class="sa-empty-state">${escapeHtml(message)}</div>`;
}

function renderUsersTable(container, items) {
  if (!container) return;
  if (!Array.isArray(items) || items.length === 0) {
    renderEmpty(container, "Kullanıcı bulunamadı.");
    return;
  }
  container.innerHTML = `
    <div class="sa-table-scroll">
      <table class="sa-table">
        <thead>
          <tr>
            <th>Kullanıcı</th>
            <th>Durum</th>
            <th>Paket</th>
            <th>Bağlam</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((user) => {
              const context = (user.accountContexts ?? [])[0];
              const plan = context?.packageRight?.plan ?? "—";
              return `
                <tr>
                  <td>
                    <div class="sa-user-cell">
                      <span class="sa-avatar">${escapeHtml((user.displayName || "?").slice(0, 2).toUpperCase())}</span>
                      <div>
                        <strong>${escapeHtml(user.displayName || "İsimsiz")}</strong>
                        <span>${escapeHtml(user.email || "E-posta yok")}</span>
                      </div>
                    </div>
                  </td>
                  <td>${escapeHtml(user.status || "—")}</td>
                  <td>${escapeHtml(plan)}</td>
                  <td>${escapeHtml(context?.tenantType || "Bağlantısız")}</td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderTenantsTable(container, items) {
  if (!container) return;
  if (!Array.isArray(items) || items.length === 0) {
    renderEmpty(container, "Kurum bulunamadı.");
    return;
  }
  container.innerHTML = `
    <div class="sa-table-scroll">
      <table class="sa-table">
        <thead>
          <tr>
            <th>Kurum</th>
            <th>Tür</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (tenant) => `
                <tr>
                  <td>${escapeHtml(tenant.name || "İsimsiz kurum")}</td>
                  <td>${escapeHtml(tenant.type || "—")}</td>
                  <td>${escapeHtml(tenant.status || "—")}</td>
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

async function loadUsers(segment, containerId) {
  const container = $(containerId);
  if (!container) return;
  renderEmpty(container, "Yükleniyor…");
  try {
    const data = await api(
      `/admin/users?segment=${encodeURIComponent(segment)}&page=1&pageSize=20`,
    );
    renderUsersTable(container, data?.items ?? []);
  } catch {
    renderEmpty(container, "Kullanıcılar yüklenemedi.");
  }
}

async function loadTenants(containerId) {
  const container = $(containerId);
  if (!container) return;
  renderEmpty(container, "Yükleniyor…");
  try {
    const data = await api("/admin/tenants?page=1&pageSize=20");
    renderTenantsTable(container, data?.items ?? data ?? []);
  } catch {
    renderEmpty(container, "Kurumlar yüklenemedi.");
  }
}

async function loadPageData(page) {
  if (page === "overview") {
    await loadUsers("ALL", "sa-org-users-table");
  }
  if (page === "organizations") await loadTenants("sa-organizations-table");
  if (page === "org-users") await loadUsers("ORGANIZATION", "sa-org-users-table");
  if (page === "individual-users") await loadUsers("INDIVIDUAL", "sa-individual-users-table");
  if (page === "platform-users") await loadUsers("PLATFORM", "sa-platform-users-table");
}

async function restoreSession() {
  try {
    const response = await fetch("/auth/me", { credentials: "include" });
    if (!response.ok) throw new Error("unauthorized");
    const body = await response.json();
    const user = body?.data?.user;
    const isPlatform = Boolean(user?.platformRole);
    if (!isPlatform) {
      window.location.replace("/");
      return false;
    }
    const chip = $("sa-user-chip");
    if (chip) chip.textContent = user.displayName || user.email || "Superadmin";
    return true;
  } catch {
    window.location.replace("/");
    return false;
  }
}

function bindNavigation() {
  document.querySelectorAll(".sa-nav-item").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });

  const toggle = $("sa-menu-toggle");
  const sidebar = $("sa-sidebar");
  toggle?.addEventListener("click", () => {
    sidebar?.classList.toggle("is-open");
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest(".sa-sidebar") || target.closest(".sa-menu-toggle")) return;
    $("sa-sidebar")?.classList.remove("is-open");
  });

  $("sa-logout")?.addEventListener("click", async () => {
    const csrfCookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("__Host-oku_csrf="));
    const csrfToken = csrfCookie
      ? decodeURIComponent(csrfCookie.slice("__Host-oku_csrf=".length))
      : "";
    try {
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
      });
    } catch {
      // Logout failure should not block local navigation.
    }
    window.location.replace("/");
  });
}

async function init() {
  const allowed = await restoreSession();
  if (!allowed) return;
  bindNavigation();
  showPage("overview");
}

void init();
