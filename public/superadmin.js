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
  "user-detail",
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
  "user-detail": "Kullanıcı Profili",
};

let currentUser = null;
let currentUserEntitlements = [];
let currentSegment = "ORGANIZATION";

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function csrfToken() {
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__Host-oku_csrf="));
  return cookie ? decodeURIComponent(cookie.slice("__Host-oku_csrf=".length)) : "";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "İstek başarısız");
    error.status = response.status;
    throw error;
  }
  return body?.data ?? body;
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
  if (page !== "user-detail") void loadPageData(page);
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
            <th>İşlemler</th>
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
                    <button type="button" class="sa-user-link" data-open-user="${escapeHtml(user.id)}">
                      <span class="sa-avatar">${escapeHtml((user.displayName || "?").slice(0, 2).toUpperCase())}</span>
                      <span>
                        <strong>${escapeHtml(user.displayName || "İsimsiz")}</strong>
                        <small>${escapeHtml(user.email || "E-posta yok")}</small>
                      </span>
                    </button>
                  </td>
                  <td>${escapeHtml(user.status || "—")}</td>
                  <td>${escapeHtml(plan)}</td>
                  <td>${escapeHtml(context?.tenantType || "Bağlantısız")}</td>
                  <td>
                    <div class="sa-row-actions">
                      <button type="button" class="sa-btn sa-btn-secondary sa-btn-sm" data-open-user="${escapeHtml(user.id)}">Aç</button>
                      <button type="button" class="sa-btn sa-btn-secondary sa-btn-sm" data-edit-user="${escapeHtml(user.id)}">Düzenle</button>
                    </div>
                  </td>
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
    const query =
      segment && segment !== "ALL"
        ? `/admin/users?segment=${encodeURIComponent(segment)}&page=1&pageSize=20`
        : "/admin/users?page=1&pageSize=20";
    const data = await api(query);
    renderUsersTable(container, data?.items ?? []);
    const total = document.getElementById("sa-total-users");
    if (
      total &&
      (container.id === "sa-overview-users-table" || container.id === "sa-org-users-table")
    ) {
      total.textContent = String(data?.total ?? (data?.items ?? []).length);
    }
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

async function openUserDetail(userId) {
  const container = $("sa-user-detail");
  if (!container) return;
  renderEmpty(container, "Kullanıcı yükleniyor…");
  showPage("user-detail");
  try {
    currentUser = await api(`/admin/users/${encodeURIComponent(userId)}`);
    window.currentUser = currentUser;
    try {
      currentUserEntitlements = await api(
        `/admin/entitlements?userId=${encodeURIComponent(userId)}`,
      );
      window.currentUserEntitlements = currentUserEntitlements;
    } catch {
      currentUserEntitlements = [];
      window.currentUserEntitlements = [];
    }
    renderUserDetail(currentUser);
  } catch {
    renderEmpty(container, "Kullanıcı detayı yüklenemedi.");
  }
}

function renderUserDetail(user) {
  const container = $("sa-user-detail");
  if (!container || !user) return;
  const general = `
    <form id="sa-user-general-form" class="sa-form-grid">
      <label class="sa-field"><span>Ad soyad</span><input name="displayName" value="${escapeHtml(user.displayName || "")}" required /></label>
      <label class="sa-field"><span>E-posta</span><input name="email" type="email" value="${escapeHtml(user.email || "")}" required /></label>
      <label class="sa-field"><span>Telefon</span><input name="phone" value="${escapeHtml(user.phone || "")}" /></label>
      <label class="sa-field"><span>Hesap durumu</span>
        <select name="status">
          <option value="ACTIVE" ${user.status === "ACTIVE" ? "selected" : ""}>Aktif</option>
          <option value="INVITED" ${user.status === "INVITED" ? "selected" : ""}>Davetli</option>
          <option value="SUSPENDED" ${user.status === "SUSPENDED" ? "selected" : ""}>Askıda</option>
          <option value="CLOSED" ${user.status === "CLOSED" ? "selected" : ""}>Kapalı</option>
        </select>
      </label>
      <div class="sa-form-actions">
        <button type="submit" class="sa-btn sa-btn-primary">Bilgileri kaydet</button>
      </div>
      <p id="sa-user-general-status" class="sa-muted" role="status"></p>
    </form>
    <form id="sa-user-password-form" class="sa-form-grid">
      <label class="sa-field"><span>Yeni parola</span><input name="password" type="password" minlength="8" maxlength="128" required /></label>
      <div class="sa-form-actions">
        <button type="submit" class="sa-btn sa-btn-secondary">Parolayı belirle</button>
      </div>
      <p id="sa-user-password-status" class="sa-muted" role="status"></p>
    </form>`;
  const entitlements = Array.isArray(currentUserEntitlements) ? currentUserEntitlements : [];
  const packageHtml = `
    <div class="sa-detail-grid">
      ${
        entitlements.length
          ? entitlements
              .map(
                (right) =>
                  `<div class="sa-detail-item"><span>${escapeHtml(right.tenantName || right.tenantId || "Baglam")}</span><strong>${escapeHtml(right.plan || "—")} · ${escapeHtml(right.active ? "Aktif" : "Pasif")}</strong><small>Kaynak: ${escapeHtml(right.source || "—")} · Bitis: ${escapeHtml(right.expiresAt || "Suresiz")}</small></div>`,
              )
              .join("")
          : '<p class="sa-muted">Paket kaydi yok.</p>'
      }
    </div>
    <div class="sa-form-actions" style="margin-top:16px">
      <button type="button" class="sa-btn sa-btn-primary" id="sa-open-package-modal">Paket yonetimi</button>
    </div>
  `;

  const orgHtml = `
    <div class="sa-detail-grid">
      ${
        (user.memberships ?? [])
          .map(
            (membership) => `
            <div class="sa-detail-item">
              <span>${escapeHtml(membership.tenantName || membership.tenantId)}</span>
              <strong>${escapeHtml(membership.role)} · ${escapeHtml(membership.status)}</strong>
            </div>`,
          )
          .join("") || '<p class="sa-muted">Bağlantı yok.</p>'
      }
    </div>`;
  const activityHtml = `
    <div class="sa-detail-grid">
      ${
        (user.activity ?? [])
          .map(
            (item) => `
            <div class="sa-detail-item">
              <span>${escapeHtml(item.action || "İşlem")}</span>
              <strong>${escapeHtml(item.entityType || "—")}</strong>
            </div>`,
          )
          .join("") || '<p class="sa-muted">İşlem geçmişi yok.</p>'
      }
    </div>`;

  container.innerHTML = `
    <div class="sa-profile-shell">
      <div class="sa-profile-topbar">
        <button type="button" class="sa-btn sa-btn-secondary" id="sa-back-to-users">← Kullanıcılara dön</button>
        <h2>${escapeHtml(user.displayName || "Kullanıcı")}</h2>
      </div>
      <div class="sa-tabs" role="tablist">
        <button type="button" class="sa-tab is-active" data-tab="general">Genel Bilgiler</button>
        <button type="button" class="sa-tab" data-tab="package">Paket ve Üyelik</button>
        <button type="button" class="sa-tab" data-tab="organization">Kurum Bilgileri</button>
        <button type="button" class="sa-tab" data-tab="activity">İşlem Geçmişi</button>
      </div>
      <div class="sa-tab-panel is-active" data-tab-panel="general">${general}</div>
      <div class="sa-tab-panel" data-tab-panel="package">${packageHtml}</div>
      <div class="sa-tab-panel" data-tab-panel="organization">${orgHtml}</div>
      <div class="sa-tab-panel" data-tab-panel="activity">${activityHtml}</div>
    </div>`;

  bindUserDetailEvents(user);
}

function bindUserDetailEvents(user) {
  document.querySelectorAll(".sa-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".sa-tab").forEach((item) => item.classList.remove("is-active"));
      document
        .querySelectorAll(".sa-tab-panel")
        .forEach((panel) => panel.classList.remove("is-active"));
      button.classList.add("is-active");
      document
        .querySelector(`[data-tab-panel="${button.dataset.tab}"]`)
        ?.classList.add("is-active");
    });
  });

  $("sa-back-to-users")?.addEventListener("click", () => {
    showPage(
      currentSegment === "PLATFORM"
        ? "platform-users"
        : currentSegment === "INDIVIDUAL"
          ? "individual-users"
          : "org-users",
    );
  });

  $("sa-user-general-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = $("sa-user-general-status");
    try {
      const payload = {
        displayName: form.displayName.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim() || null,
        status: form.status.value,
      };
      const updated = await api(`/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "x-csrf-token": csrfToken() },
        body: JSON.stringify(payload),
      });
      currentUser = updated;
      if (status) status.textContent = "Bilgiler kaydedildi.";
      renderUserDetail(updated);
    } catch (error) {
      if (status) status.textContent = error.message || "Kayıt başarısız.";
    }
  });

  $("sa-user-password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = $("sa-user-password-status");
    try {
      await api(`/admin/users/${encodeURIComponent(user.id)}/password`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken() },
        body: JSON.stringify({ password: form.password.value }),
      });
      if (status) status.textContent = "Parola belirlendi.";
      form.reset();
    } catch (error) {
      if (status) status.textContent = error.message || "Parola belirlenemedi.";
    }
  });
}

async function loadPageData(page) {
  if (page === "overview") {
    await loadUsers("ALL", "sa-overview-users-table");
    await loadUsers("ALL", "sa-org-users-table");
  }
  if (page === "organizations") await loadTenants("sa-organizations-table");
  if (page === "org-users") {
    currentSegment = "ORGANIZATION";
    await loadUsers("ORGANIZATION", "sa-org-users-table");
  }
  if (page === "individual-users") {
    currentSegment = "INDIVIDUAL";
    await loadUsers("INDIVIDUAL", "sa-individual-users-table");
  }
  if (page === "platform-users") {
    currentSegment = "PLATFORM";
    await loadUsers("PLATFORM", "sa-platform-users-table");
  }
}

function bindTableEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const openId = target.closest("[data-open-user]")?.getAttribute("data-open-user");
    const editId = target.closest("[data-edit-user]")?.getAttribute("data-edit-user");
    if (openId) {
      void openUserDetail(openId);
      return;
    }
    if (editId) {
      void openUserDetail(editId);
    }
  });
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

async function openCreateUserModal() {
  const modal = $("sa-create-user-modal");
  const typeSelect = $("sa-create-account-type");
  const orgFields = $("sa-create-org-fields");
  const tenantSelect = $("sa-create-tenant");
  const status = $("sa-create-user-status");
  if (status) status.textContent = "";
  if (typeSelect && orgFields) {
    orgFields.classList.toggle("hidden", typeSelect.value !== "ORGANIZATION");
  }
  if (tenantSelect && tenantSelect.options.length === 0) {
    try {
      const data = await api("/admin/tenants?page=1&pageSize=100");
      const tenants = data?.items ?? data ?? [];
      tenantSelect.innerHTML = tenants
        .filter((tenant) => tenant.type === "ORGANIZATION" && tenant.status === "ACTIVE")
        .map(
          (tenant) =>
            `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name)}</option>`,
        )
        .join("");
    } catch {
      if (status) status.textContent = "Kurumlar yüklenemedi.";
    }
  }
  modal?.classList.remove("hidden");
}

function closeCreateUserModal() {
  $("sa-create-user-modal")?.classList.add("hidden");
}

async function submitCreateUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("sa-create-user-status");
  const accountType = form.accountType.value;
  const payload = {
    displayName: form.displayName.value.trim(),
    email: form.email.value.trim(),
    password: form.password.value,
    phone: form.phone.value.trim() || null,
    accountType,
  };
  if (accountType === "ORGANIZATION") {
    payload.tenantId = form.tenantId.value;
    payload.membershipRole = form.membershipRole.value;
  }
  try {
    await api("/admin/users", {
      method: "POST",
      headers: { "x-csrf-token": csrfToken() },
      body: JSON.stringify(payload),
    });
    if (status) status.textContent = "Kullanıcı oluşturuldu.";
    form.reset();
    closeCreateUserModal();
    const page = document.querySelector(".sa-page.is-active")?.dataset.page || "org-users";
    if (page === "individual-users") await loadUsers("INDIVIDUAL", "sa-individual-users-table");
    else if (page === "platform-users") await loadUsers("PLATFORM", "sa-platform-users-table");
    else if (page === "org-users" || page === "overview")
      await loadUsers("ORGANIZATION", "sa-org-users-table");
    if (page === "overview") await loadUsers("ALL", "sa-overview-users-table");
  } catch (error) {
    if (status) status.textContent = error.message || "Kullanıcı oluşturulamadı.";
  }
}

function bindCreateUserEvents() {
  $("sa-create-user-open")?.addEventListener("click", () => void openCreateUserModal());
  $("sa-create-user-close")?.addEventListener("click", closeCreateUserModal);
  $("sa-create-user-modal")?.addEventListener("click", (event) => {
    if (event.target === $("sa-create-user-modal")) closeCreateUserModal();
  });
  $("sa-create-account-type")?.addEventListener("change", (event) => {
    const orgFields = $("sa-create-org-fields");
    orgFields?.classList.toggle("hidden", event.target.value !== "ORGANIZATION");
  });
  $("sa-create-user-form")?.addEventListener("submit", submitCreateUser);
}

async function init() {
  const allowed = await restoreSession();
  if (!allowed) return;
  bindNavigation();
  bindTableEvents();
  bindCreateUserEvents();
  showPage("overview");
}

void init();
