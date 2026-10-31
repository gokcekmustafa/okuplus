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
