// Oku+ — minimal SPA (vanilla JS)
// Session yönetimi: access + refresh token localStorage'da tutulur.
// Sayfa yenilendiğinde /auth/me ile doğrulanır; 401 ise /auth/refresh denenir.

const STORAGE_KEYS = {
  accessToken: "oku.accessToken",
  refreshToken: "oku.refreshToken",
  tenantId: "oku.tenantId",
  soundEffects: "oku.soundEffects",
};

const $ = (id) => document.getElementById(id);

let inFlight = false;
let insightsIdentity = "";
let progressRequest = 0;
let gamificationRequest = 0;
let historyRequest = 0;
let insightHistoryPage = 1;
let insightAwards = [];
const insightNewAwards = new Map();
let celebrationTimer = null;
let celebrationLastFocus = null;
let rewardAudioContext = null;
let rewardAudioPrimed = false;
let latestEntitlements = null;
let latestBillingSubscription = null;
let latestBillingAccount = null;
let billingAccountRequest = 0;
let billingCancelTrigger = null;

const PREMIUM_UX_STATES = Object.freeze({
  FREE_ACTIVE: "FREE_ACTIVE",
  FREE_LIMIT_WARNING: "FREE_LIMIT_WARNING",
  FREE_LIMIT_REACHED: "FREE_LIMIT_REACHED",
  PREMIUM_ACTIVE: "PREMIUM_ACTIVE",
});

const BILLING_ACCOUNT_STATES = Object.freeze({
  FREE: "FREE",
  PREMIUM_ACTIVE: "PREMIUM_ACTIVE",
  PREMIUM_PENDING: "PREMIUM_PENDING",
  PREMIUM_CANCELING: "PREMIUM_CANCELING",
  PREMIUM_CANCELED: "PREMIUM_CANCELED",
  PREMIUM_EXPIRED: "PREMIUM_EXPIRED",
});

const BILLING_ACCOUNT_STATE_LABELS = Object.freeze({
  FREE: "Ücretsiz plan",
  PREMIUM_ACTIVE: "Premium aktif",
  PREMIUM_PENDING: "Premium işlemi beklemede",
  PREMIUM_CANCELING: "Premium iptali işleniyor",
  PREMIUM_CANCELED: "Premium aboneliği iptal edildi",
  PREMIUM_EXPIRED: "Premium aboneliği sona erdi",
});

const PREMIUM_LIMIT_FEATURES = new Set(["PRACTICE", "PRACTICE_QUESTION"]);

// ---------- Yardımcılar ----------

function getStoredTokens() {
  return {
    accessToken: localStorage.getItem(STORAGE_KEYS.accessToken),
    refreshToken: localStorage.getItem(STORAGE_KEYS.refreshToken),
    tenantId: localStorage.getItem(STORAGE_KEYS.tenantId),
  };
}

function soundEffectsEnabled() {
  return localStorage.getItem(STORAGE_KEYS.soundEffects) === "true";
}

function playRewardSound(kind) {
  if (!soundEffectsEnabled() || !rewardAudioPrimed) return;
  try {
    rewardAudioContext ||= new AudioContext();
    if (rewardAudioContext.state === "suspended") void rewardAudioContext.resume();
    const oscillator = rewardAudioContext.createOscillator();
    const gain = rewardAudioContext.createGain();
    const now = rewardAudioContext.currentTime;
    const notes = kind === "wrong" ? [220, 185] : kind === "badge" ? [392, 523, 659] : [523, 659];
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(notes[0], now);
    notes
      .slice(1)
      .forEach((note, index) =>
        oscillator.frequency.setValueAtTime(note, now + (index + 1) * 0.08),
      );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + notes.length * 0.08 + 0.12);
    oscillator.connect(gain).connect(rewardAudioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + notes.length * 0.08 + 0.14);
  } catch {
    /* Sound is progressive enhancement and never blocks learning. */
  }
}

function celebrationKey(key) {
  return "oku.celebration." + key;
}

function showCelebration({
  icon,
  eyebrow,
  title,
  detail,
  reward,
  kind = "success",
  key,
  major = false,
}) {
  if (key) {
    try {
      if (sessionStorage.getItem(celebrationKey(key)) === "shown") return;
      sessionStorage.setItem(celebrationKey(key), "shown");
    } catch {
      /* Optional session storage. */
    }
  }
  const layer = $("celebration-layer");
  if (!layer) return;
  clearTimeout(celebrationTimer);
  celebrationLastFocus = document.activeElement;
  $("celebration-icon").textContent = icon;
  $("celebration-eyebrow").textContent = eyebrow;
  $("celebration-title").textContent = title;
  $("celebration-detail").textContent = detail || "";
  $("celebration-reward").textContent = reward || "";
  layer.dataset.kind = kind;
  layer.classList.toggle("celebration-major", major);
  layer.classList.remove("hidden");
  playRewardSound(kind);
  if (major && typeof navigator.vibrate === "function") navigator.vibrate([18, 24, 18]);
  if (major && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const particles = $("celebration-particles");
    particles.replaceChildren();
    for (let i = 0; i < 18; i++) {
      const particle = document.createElement("span");
      particle.style.setProperty("--particle-x", String((Math.random() - 0.5) * 260) + "px");
      particle.style.setProperty("--particle-y", String(-80 - Math.random() * 130) + "px");
      particle.style.setProperty("--particle-delay", String(Math.random() * 120) + "ms");
      particles.appendChild(particle);
    }
  }
  celebrationTimer = setTimeout(hideCelebration, major ? 4200 : 2200);
}

function hideCelebration() {
  const layer = $("celebration-layer");
  if (!layer) return;
  layer.classList.add("hidden");
  $("celebration-particles")?.replaceChildren();
  if (celebrationLastFocus && typeof celebrationLastFocus.focus === "function")
    celebrationLastFocus.focus({ preventScroll: true });
  celebrationLastFocus = null;
}

function setStoredSession(data) {
  localStorage.setItem(STORAGE_KEYS.accessToken, data.tokens.accessToken);
  localStorage.setItem(STORAGE_KEYS.refreshToken, data.tokens.refreshToken);
  localStorage.setItem(STORAGE_KEYS.tenantId, data.tenantContext?.tenantId ?? "");
}

function clearStoredSession() {
  resetInsights();
  latestEntitlements = null;
  latestBillingSubscription = null;
  latestBillingAccount = null;
  billingAccountRequest++;
  rememberExerciseSession(null);
  resetExerciseState();
  exerciseRequestedSessionId = null;
  exerciseScope = null;
  localStorage.removeItem(STORAGE_KEYS.accessToken);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
  localStorage.removeItem(STORAGE_KEYS.tenantId);
}

function authHeaders(accessToken, tenantId) {
  const headers = { "content-type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  if (tenantId) {
    headers["x-tenant-id"] = tenantId;
  }
  return headers;
}

async function parseResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message ?? `İstek başarısız (${res.status})`);
    err.status = res.status;
    err.code = body?.error?.code;
    err.details = body?.error?.details;
    if (isPremiumLimitError(err)) showPremiumPaywall(err.details, err.message);
    throw err;
  }
  return body?.data;
}

// ---------- Auth API çağrıları ----------

async function login(email, password) {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseResponse(res);
}

async function signup(displayName, email, password) {
  const res = await fetch("/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName, email, password }),
  });
  return parseResponse(res);
}

async function socialLogin(provider, idToken, nonce, displayName) {
  const res = await fetch(`/auth/social/${provider}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      idToken,
      nonce,
      displayName: displayName || undefined,
      platform: "WEB",
      deviceName: navigator.userAgent.slice(0, 120),
    }),
  });
  return parseResponse(res);
}

async function completeSocialLogin(provider, idToken, nonce, displayName) {
  const session = await socialLogin(provider, idToken, nonce, displayName);
  setStoredSession(session);
  showDashboard(session);
  return session;
}

// Provider SDK callback'leri doğrulanmış ID token + aynı nonce ile bu hook'u çağırır.
// Native istemciler aynı backend endpoint'ini kullanmalı ve refresh tokenı SecureStore'da tutmalıdır.
window.completeOkuSocialLogin = completeSocialLogin;

async function loadSocialLoginConfig() {
  const status = $("social-login-status");
  try {
    const response = await fetch("/auth/social/config");
    const config = await parseResponse(response);
    $("google-login-btn").disabled = !config.google.configured;
    $("apple-login-btn").disabled = !config.apple.configured;
    status.textContent =
      config.google.configured || config.apple.configured
        ? "Sağlayıcı ile devam etmek için güvenli giriş penceresini kullanın."
        : "Google/Apple giriş yapılandırması bu ortamda etkin değil.";
  } catch (_e) {
    void _e;
    $("google-login-btn").disabled = true;
    $("apple-login-btn").disabled = true;
    status.textContent = "Sosyal giriş yapılandırması alınamadı.";
  }
}

function providerButtonMessage(provider) {
  $("social-login-status").textContent =
    `${provider} Web SDK bu dağıtımda başlatılmadı; sahte giriş yapılmadı.`;
}

$("google-login-btn").addEventListener("click", () => providerButtonMessage("Google"));
$("apple-login-btn").addEventListener("click", () => providerButtonMessage("Apple"));
void loadSocialLoginConfig();
$("context-switcher")?.addEventListener("change", function (e) {
  switchContext(e.target.value);
});

async function fetchMe(accessToken, tenantId) {
  const res = await fetch("/auth/me", { headers: authHeaders(accessToken, tenantId) });
  return parseResponse(res);
}

async function refreshTokens(refreshToken, tenantId) {
  const res = await fetch("/auth/refresh", {
    method: "POST",
    headers: authHeaders(null, tenantId),
    body: JSON.stringify({ refreshToken }),
  });
  return parseResponse(res);
}

async function logout(refreshToken, tenantId) {
  const res = await fetch("/auth/logout", {
    method: "POST",
    headers: authHeaders(null, tenantId),
    body: JSON.stringify({ refreshToken }),
  });
  return parseResponse(res);
}

// ---------- Session yeniden kurma ----------

/**
 * Sayfa yenilendiğinde session'ı yeniden kurar.
 * 1) access token ile /auth/me dene
 * 2) 401 ise refresh token ile yeni çift al, tekrar dene
 * 3) hepsi başarısızsa login ekranına dön
 */
async function restoreSession() {
  const { accessToken, refreshToken, tenantId } = getStoredTokens();
  if (!accessToken || !refreshToken) {
    showLogin();
    return;
  }

  try {
    const me = await fetchMe(accessToken, tenantId);
    showDashboard(me);
    return;
  } catch (err) {
    if (err.status !== 401) {
      showLogin();
      return;
    }
  }

  // Access token geçersiz: refresh dene.
  try {
    const tokens = await refreshTokens(refreshToken, tenantId);
    localStorage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
    localStorage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);

    const me = await fetchMe(tokens.accessToken, tenantId);
    showDashboard(me);
  } catch (_e) {
    void _e;
    clearStoredSession();
    showLogin();
  }
}

// ---------- Ekran geçişleri ----------

function showLogin() {
  $("view-login").classList.remove("hidden");
  $("view-app").classList.add("hidden");
  showLoginForm();
  closeSidebar();
}

function showDashboard(me) {
  $("view-login").classList.add("hidden");
  $("view-app").classList.remove("hidden");

  const { user, tenantContext } = me;
  resetInsights();
  latestEntitlements = null;
  insightsIdentity = user.id + ":" + (tenantContext?.tenantId || "");
  const isPlatform = Boolean(user.platformRole);
  isPlatformUser = isPlatform;

  $("welcome-name").textContent = user.displayName;
  $("user-name").textContent = user.displayName;
  $("user-avatar").textContent = (user.displayName || "?").trim().charAt(0).toUpperCase();
  $("topbar-tenant").textContent = tenantContext?.tenantId
    ? tenantContext.tenantType === "INDIVIDUAL"
      ? "Kişisel"
      : tenantContext.tenantName || `Kuruluş: ${tenantContext.tenantId}`
    : "Platform";

  const roleLabel = user.platformRole ? `Platform · ${user.platformRole}` : "Tenant kullanıcısı";
  $("user-role").textContent = roleLabel;

  // Platform yetkilileri dışında admin menülerini gizle.
  for (const item of document.querySelectorAll(".nav-item[data-admin]")) {
    item.classList.toggle("hidden", !isPlatform);
  }
  // Admin-only assignment elements
  for (const item of document.querySelectorAll("[data-admin]")) {
    if (item.classList.contains("nav-item")) continue;
    item.classList.toggle("hidden", !isPlatform);
  }
  for (const item of document.querySelectorAll("[data-student]")) {
    item.classList.toggle("hidden", isPlatform);
  }

  // Student shell toggle
  $("view-app").classList.toggle("student-shell", !isPlatform);
  var bottomNav = $("student-bottom-nav");
  if (bottomNav) bottomNav.classList.toggle("hidden", isPlatform);
  var gamif = $("topbar-gamification");
  if (gamif) gamif.classList.toggle("hidden", isPlatform);
  if (!isPlatform) void loadTopbarGamification();

  if (isPlatform) {
    void loadTenants();
  }
  void loadContextsAndRender();
  if (isPlatform) {
    navigate("dashboard");
  } else {
    void maybeShowOnboarding();
  }
}

async function loadContextsAndRender() {
  var sel = $("context-switcher");
  if (!sel) return;
  var isPlatform = Boolean(isPlatformUser);
  if (isPlatform) {
    sel.classList.add("hidden");
    sel.innerHTML = "";
    return;
  }
  try {
    var tokens = getStoredTokens();
    var res = await fetch("/auth/contexts", {
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
    });
    var data = await parseResponse(res);
    var contexts = data.contexts || [];
    if (contexts.length <= 1) {
      sel.classList.add("hidden");
      sel.innerHTML = "";
      return;
    }
    sel.classList.remove("hidden");
    var current = tokens.tenantId || "";
    sel.innerHTML = contexts
      .map(function (c) {
        var label = c.isPersonal ? "Kişisel" : c.name;
        var suffix = c.isPersonal ? "" : " (" + c.role + ")";
        return (
          '<option value="' +
          c.id +
          '"' +
          (c.id === current ? " selected" : "") +
          ">" +
          escapeHtml(label + suffix) +
          "</option>"
        );
      })
      .join("");
  } catch (_e) {
    void _e;
    sel.classList.add("hidden");
  }
}

async function loadTopbarGamification() {
  const scope = insightScope();
  try {
    var tokens = getStoredTokens();
    var res = await fetch("/student/gamification", {
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
    });
    var data = await parseResponse(res);
    if (scope !== insightScope()) return;
    observeInsightAwards(data);
    var xpEl = $("topbar-xp");
    var streakEl = $("topbar-streak");
    if (xpEl) xpEl.textContent = String(data.totalPoints ?? 0);
    if (streakEl) streakEl.textContent = String(data.currentDays ?? 0);
  } catch (_e) {
    void _e;
    // ignore for non-student or not yet onboarded
  }
}

async function switchContext(tenantId) {
  resetInsights();
  localStorage.setItem(STORAGE_KEYS.tenantId, tenantId || "");
  var tokens = getStoredTokens();
  try {
    var me = await fetchMe(tokens.accessToken, tenantId || null);
    showDashboard(me);
  } catch (_e) {
    void _e;
    clearStoredSession();
    showLogin();
  }
}

// ---------- Onboarding ----------
var onboardingStep = 1;
var onboardingSelectedGoal = null;

async function maybeShowOnboarding() {
  try {
    var tokens = getStoredTokens();
    var res = await fetch("/student/onboarding", {
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
    });
    var data = await parseResponse(res);
    if (data.completed) {
      navigate("dashboard");
      void loadToday();
      void loadLearningPath();
      return;
    }
    showOnboarding(data);
  } catch (_e) {
    void _e;
    navigate("dashboard");
    void loadToday();
    void loadLearningPath();
  }
}

async function loadToday() {
  var na = $("today-next-action");
  var stats = $("today-stats");
  var recent = $("today-recent");
  if (!na) return;
  const scope = insightScope();
  try {
    var tokens = getStoredTokens();
    var res = await fetch("/student/today", {
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
    });
    var data = await parseResponse(res);
    if (scope !== insightScope()) return;
    renderReviewCard(data.review);
    var label = data.nextAction ? data.nextAction.label : "—";
    var title = data.nextAction && data.nextAction.title ? " — " + data.nextAction.title : "";
    var btn = "";
    if (data.nextAction && data.nextAction.type === "RESUME_SESSION")
      btn =
        '<button type="button" class="btn btn-primary btn-sm" onclick="resumeTodaySession(\'' +
        data.nextAction.id +
        "')\">Devam Et</button>";
    else if (data.nextAction && data.nextAction.type === "ASSIGNMENT_START")
      btn =
        '<button type="button" class="btn btn-primary btn-sm" onclick="startTodayAssignment(\'' +
        data.nextAction.id +
        "')\">Ödeve Başla</button>";
    else if (data.nextAction && data.nextAction.type === "ASSESSMENT_START")
      btn =
        '<button type="button" class="btn btn-primary btn-sm" onclick="startTodayAssessment(\'' +
        data.nextAction.id +
        "')\">Değerlendirmeye Başla</button>";
    else if (data.nextAction && data.nextAction.type === "PERSONAL_EXERCISE")
      btn =
        '<button type="button" class="btn btn-primary btn-sm" onclick="startTodayExercise()">Çalışmaya Başla</button>';
    na.innerHTML = escapeHtml(label + title) + " " + btn;
    stats.textContent =
      "Bugün tamamlanan: " +
      data.completedToday +
      " · Streak: " +
      data.currentStreak +
      " · Puan: " +
      data.totalPoints;
    if (data.recentActivity && data.recentActivity.length) {
      recent.innerHTML =
        '<div class="muted" style="font-size:12px;margin-bottom:4px">Son aktivite</div>' +
        data.recentActivity
          .map(function (a) {
            return "<div>" + escapeHtml(a.title) + " (" + a.type + ")</div>";
          })
          .join("");
    } else
      recent.innerHTML = '<span class="muted" style="font-size:12px">Henüz aktivite yok</span>';
  } catch (_e) {
    void _e;
    if (na) na.textContent = "Bugün verisi yüklenemedi";
  }
}

function isPremiumLimitDetails(details) {
  return (
    details &&
    typeof details === "object" &&
    PREMIUM_LIMIT_FEATURES.has(details.feature) &&
    Number.isFinite(Number(details.dailyLimit)) &&
    Number(details.remainingToday) <= 0
  );
}

function isPremiumLimitError(error) {
  return error?.status === 403 && isPremiumLimitDetails(error.details);
}

function recordPremiumTelemetry(eventType) {
  if (isPlatformUser !== false) return;
  const tokens = getStoredTokens();
  if (!tokens.accessToken || !tokens.tenantId) return;
  let clientEventId;
  try {
    clientEventId = `premium-${eventType}-${crypto.randomUUID()}`;
  } catch {
    clientEventId = `premium-${eventType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  void fetch("/student/pilot/events", {
    method: "POST",
    headers: authHeaders(tokens.accessToken, tokens.tenantId),
    body: JSON.stringify({ eventType, clientEventId }),
  }).catch(() => {
    // Telemetry is best effort and never blocks access or learning.
  });
}

function premiumFeatureLabel(feature) {
  return feature === "PRACTICE_QUESTION" ? "soru" : "alıştırma";
}

function formatPremiumResetAt(value) {
  if (!value) return "Bir sonraki günlük sıfırlama zamanı hesaplanamadı.";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Bir sonraki günlük sıfırlama zamanı hesaplanamadı.";
  return `Hakkın ${date.toLocaleString("tr-TR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })} civarında yenilenir.`;
}

function showPremiumPaywall(details, message) {
  if (!isPremiumLimitDetails(details)) return false;
  const feature = details.feature;
  const featureSnapshot = latestEntitlements?.features?.[feature] || {};
  const dailyLimit = Number(details.dailyLimit ?? featureSnapshot.dailyLimit);
  const usedToday = Number(details.usedToday ?? featureSnapshot.usedToday ?? dailyLimit);
  const reset = details.resetAt || featureSnapshot.resetAt;
  const dialog = $("premium-paywall-dialog");
  if (!dialog) return false;

  $("premium-paywall-reason").textContent =
    message || `Günlük ücretsiz ${premiumFeatureLabel(feature)} hakkın doldu.`;
  $("premium-paywall-usage").textContent =
    `Bugün ${usedToday}/${dailyLimit} ${premiumFeatureLabel(feature)} kullandın.`;
  $("premium-paywall-reset").textContent = formatPremiumResetAt(reset);
  $("premium-paywall-benefit").textContent =
    "Premium ile alıştırma ve soru kullanımını günlük limit olmadan sürdürebilirsin.";
  recordPremiumTelemetry("LIMIT_REACHED");
  recordPremiumTelemetry("PAYWALL_VIEWED");
  if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal();
  else dialog.classList.remove("hidden");
  return true;
}

function entitlementUxState(data) {
  if (data?.plan?.code === "PLAN_PREMIUM") return PREMIUM_UX_STATES.PREMIUM_ACTIVE;
  const limited = [data?.features?.PRACTICE, data?.features?.PRACTICE_QUESTION];
  if (limited.some((item) => Number(item?.remainingToday) === 0))
    return PREMIUM_UX_STATES.FREE_LIMIT_REACHED;
  if (limited.some((item) => Number(item?.remainingToday) === 1))
    return PREMIUM_UX_STATES.FREE_LIMIT_WARNING;
  return PREMIUM_UX_STATES.FREE_ACTIVE;
}

function entitlementUxLabel(state) {
  return (
    {
      [PREMIUM_UX_STATES.FREE_ACTIVE]: "Ücretsiz plan",
      [PREMIUM_UX_STATES.FREE_LIMIT_WARNING]: "Son günlük hak",
      [PREMIUM_UX_STATES.FREE_LIMIT_REACHED]: "Günlük hak doldu",
      [PREMIUM_UX_STATES.PREMIUM_ACTIVE]: "Premium aktif",
    }[state] || "Plan durumu"
  );
}

async function loadEntitlements() {
  const card = $("entitlement-card");
  const usage = $("entitlement-usage");
  const error = $("entitlement-error");
  if (!card || !usage) return;
  const scope = insightScope();
  try {
    const tokens = getStoredTokens();
    const res = await fetch("/account/entitlements", {
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
    });
    const data = await parseResponse(res);
    if (scope !== insightScope()) return;
    latestEntitlements = data;
    const plan = data.plan || {};
    const tenant = data.tenant || {};
    const practice = data.features?.PRACTICE || {};
    const questions = data.features?.PRACTICE_QUESTION || {};
    const uxState = entitlementUxState(data);
    $("entitlement-title").textContent = plan.label || "Ücretsiz";
    $("entitlement-scope").textContent =
      tenant.type === "ORGANIZATION" ? "Kurum alanı" : "Kişisel alan";
    $("entitlement-plan-badge").textContent = plan.active ? "Aktif" : "Pasif";
    $("entitlement-state").textContent = entitlementUxLabel(uxState);
    card.dataset.uxState = uxState;
    const usageValue = (item) =>
      item.dailyLimit === null || item.dailyLimit === undefined
        ? "Sınırsız"
        : `${item.usedToday ?? 0}/${item.dailyLimit} kullanıldı · ${item.remainingToday ?? 0} kaldı`;
    usage.innerHTML =
      '<div class="entitlement-usage-row"><span>Günlük alıştırma</span><strong>' +
      escapeHtml(usageValue(practice)) +
      '</strong></div><div class="entitlement-usage-row"><span>Günlük soru</span><strong>' +
      escapeHtml(usageValue(questions)) +
      "</strong></div>";
    $("entitlement-premium-note").textContent =
      plan.code === "PLAN_PREMIUM"
        ? "Premium etkin. Alıştırma ve soru kullanımı günlük sınır olmadan devam eder."
        : uxState === PREMIUM_UX_STATES.FREE_LIMIT_REACHED
          ? "Günlük ücretsiz hakkın doldu. Premium hakkında bilgi alabilirsin."
          : "Ücretsiz planda günde 3 alıştırma ve 20 soru hakkı bulunur.";
    const cta = $("entitlement-premium-cta");
    cta.textContent = data.premium?.ctaLabel || "Premium hakkında bilgi";
    cta.disabled = false;
    error?.classList.add("hidden");
    card.classList.remove("hidden");
  } catch (err) {
    if (error) {
      error.textContent = err.message || "Plan bilgisi yüklenemedi";
      error.classList.remove("hidden");
    }
    card.classList.remove("hidden");
  }
}

async function loadBillingCatalog() {
  const start = $("premium-checkout-start");
  const note = $("billing-sandbox-note");
  if (!start || !note) return;
  try {
    const tokens = getStoredTokens();
    const res = await fetch("/billing/catalog", {
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
    });
    const data = await parseResponse(res);
    const monthly = data?.plans?.find((plan) => plan.billingPeriod === "MONTHLY");
    start.disabled = !(data?.checkoutEnabled && monthly?.configured);
    note.textContent = data?.checkoutEnabled
      ? "Bu ekran yalnız iyzico SANDBOX içindir. Tutar, kart bilgisi ve Premium kararı provider doğrulaması olmadan burada tutulmaz."
      : "iyzico SANDBOX yapılandırması tamamlanmadı; gerçek ödeme başlatılmayacak.";
  } catch (error) {
    start.disabled = true;
    note.textContent = error?.message || "Sandbox checkout durumu alınamadı.";
  }
}

async function loadBillingSubscription() {
  const cancel = $("premium-subscription-cancel");
  if (!cancel) return;
  const status = $("billing-sandbox-status");
  try {
    const tokens = getStoredTokens();
    const res = await fetch("/billing/subscription", {
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
    });
    const data = await parseResponse(res);
    latestBillingSubscription = data;
    const labels = {
      PENDING: "Ödeme bekleniyor",
      TRIAL: "Deneme durumu beklemede",
      ACTIVE: "Premium aktif",
      PAST_DUE: "Ödeme başarısız",
      CANCELED: "Abonelik iptal edildi",
      EXPIRED: "Premium sona erdi",
    };
    if (status) {
      status.textContent = data?.status
        ? labels[data.status] || "Abonelik durumu doğrulanamadı"
        : "Henüz bir sandbox aboneliği yok.";
    }
    cancel.classList.toggle(
      "hidden",
      !data || !["PENDING", "TRIAL", "ACTIVE", "PAST_DUE"].includes(data.status),
    );
  } catch {
    latestBillingSubscription = null;
    cancel.classList.add("hidden");
  }
}

function resolveBillingAccountState(subscription, entitlements) {
  if (!subscription) {
    return entitlements?.plan?.code === "PLAN_PREMIUM"
      ? BILLING_ACCOUNT_STATES.PREMIUM_ACTIVE
      : BILLING_ACCOUNT_STATES.FREE;
  }
  if (subscription.status === "ACTIVE") {
    if (subscription.cancelRequestedAt && !subscription.canceledAt)
      return BILLING_ACCOUNT_STATES.PREMIUM_CANCELING;
    return entitlements?.plan?.code === "PLAN_PREMIUM"
      ? BILLING_ACCOUNT_STATES.PREMIUM_ACTIVE
      : BILLING_ACCOUNT_STATES.PREMIUM_PENDING;
  }
  if (["PENDING", "TRIAL", "PAST_DUE"].includes(subscription.status))
    return BILLING_ACCOUNT_STATES.PREMIUM_PENDING;
  if (subscription.status === "CANCELED") return BILLING_ACCOUNT_STATES.PREMIUM_CANCELED;
  if (subscription.status === "EXPIRED") return BILLING_ACCOUNT_STATES.PREMIUM_EXPIRED;
  // Unknown provider states must remain unknown in the UI; they are not
  // silently converted to a supported state.
  return null;
}

function formatBillingDate(value, withTime = false) {
  if (!value) return "Belirtilmemiş";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Belirtilmemiş";
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function formatBillingPeriod(period) {
  return { MONTHLY: "Aylık", YEARLY: "Yıllık" }[period] || "Belirtilmemiş";
}

function formatBillingAmount(amountMinor, currency) {
  if (!Number.isFinite(Number(amountMinor)) || !currency) return "Tutar belirtilmemiş";
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(Number(amountMinor) / 100);
  } catch {
    return `${Number(amountMinor) / 100} ${currency}`;
  }
}

function billingPaymentStatusLabel(status) {
  return (
    {
      PENDING: "Beklemede",
      SUCCEEDED: "Başarılı",
      FAILED: "Başarısız",
      REFUNDED: "İade edildi",
    }[status] || "Durum doğrulanamadı"
  );
}

function billingFreeUsageSummary(entitlements) {
  const features = entitlements?.features || {};
  const usage = (feature, label) => {
    const item = features[feature] || {};
    if (item.dailyLimit === null || item.dailyLimit === undefined) return `${label}: Sınırsız`;
    return `${label}: ${item.usedToday ?? 0}/${item.dailyLimit} kullanıldı`;
  };
  return `${usage("PRACTICE", "Alıştırma")} · ${usage("PRACTICE_QUESTION", "Soru")}`;
}

function renderBillingPaymentHistory(data) {
  const container = $("billing-payment-history");
  if (!container) return;
  container.replaceChildren();
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  if (!payments.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Henüz doğrulanmış ödeme kaydı yok.";
    container.appendChild(empty);
    return;
  }
  const table = document.createElement("table");
  table.className = "data-table billing-payment-table";
  const headers = ["Tarih", "Tutar", "Durum"];
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headers.forEach((label) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headerRow.appendChild(cell);
  });
  thead.appendChild(headerRow);
  const tbody = document.createElement("tbody");
  payments.forEach((payment) => {
    const row = document.createElement("tr");
    const date = document.createElement("td");
    date.textContent = formatBillingDate(payment.paymentDate, true);
    const amount = document.createElement("td");
    amount.textContent = formatBillingAmount(payment.amountMinor, payment.currency);
    const status = document.createElement("td");
    status.textContent = billingPaymentStatusLabel(payment.status);
    row.append(date, amount, status);
    tbody.appendChild(row);
  });
  table.append(thead, tbody);
  container.appendChild(table);
}

function renderBillingAccount({ entitlements, catalog, subscription, paymentHistory }) {
  const state = resolveBillingAccountState(subscription, entitlements);
  const supportedState = state && BILLING_ACCOUNT_STATE_LABELS[state];
  const plan = entitlements?.plan || {};
  const checkout = $("billing-account-checkout-start");
  const cancel = $("billing-account-cancel");
  const freeBenefits = $("billing-account-free-benefits");
  const monthly = catalog?.plans?.find((item) => item.billingPeriod === "MONTHLY");
  const checkoutEnabled = Boolean(catalog?.checkoutEnabled && monthly?.configured);
  const stateLabel = $("billing-account-state");
  const summary = $("billing-account-summary");
  const management = $("billing-account-management");
  const period = $("billing-account-period");
  const renewal = $("billing-account-renewal");
  const cancellation = $("billing-account-cancellation");
  const scopeNote = $("billing-account-scope-note");

  latestBillingAccount = { entitlements, catalog, subscription, paymentHistory, state };
  scopeNote.textContent =
    entitlements?.tenant?.type === "INDIVIDUAL"
      ? "Kurum abonelikleri bu ekranın kapsamı dışındadır."
      : "Ödeme yönetimi yalnızca kişisel alanda kullanılabilir; kurum verisi bu ekranda gösterilmez.";
  $("billing-account-plan-title").textContent =
    plan.code === "PLAN_PREMIUM" && plan.active ? "Premium" : "Ücretsiz";
  stateLabel.textContent = supportedState || "Abonelik durumu doğrulanamadı";
  stateLabel.dataset.state = state || "UNKNOWN";

  if (state === BILLING_ACCOUNT_STATES.FREE) {
    summary.textContent = `${billingFreeUsageSummary(entitlements)}. Premium avantajlarını inceleyebilirsin.`;
  } else if (state === BILLING_ACCOUNT_STATES.PREMIUM_ACTIVE) {
    summary.textContent = "Premium avantajları doğrulanmış entitlement ile aktif.";
  } else if (state === BILLING_ACCOUNT_STATES.PREMIUM_PENDING) {
    summary.textContent =
      "Ödeme sağlayıcısı doğrulaması bekleniyor. Doğrulama tamamlanana kadar Premium hakları açılmaz.";
  } else if (state === BILLING_ACCOUNT_STATES.PREMIUM_CANCELING) {
    summary.textContent = "İptal isteği ödeme sağlayıcısı sözleşmesine göre işleniyor.";
  } else if (state === BILLING_ACCOUNT_STATES.PREMIUM_CANCELED) {
    summary.textContent = "Abonelik iptal edildi. Yeni Premium için yeni checkout başlatabilirsin.";
  } else if (state === BILLING_ACCOUNT_STATES.PREMIUM_EXPIRED) {
    summary.textContent =
      "Premium aboneliği sona erdi. Yeni Premium için yeni checkout başlatabilirsin.";
  } else {
    summary.textContent = "Provider durumu doğrulanamadığı için yönetim işlemleri gösterilmiyor.";
  }

  period.textContent = subscription
    ? formatBillingPeriod(subscription.billingPeriod)
    : "Belirtilmemiş";
  renewal.textContent = subscription?.currentPeriodEnd
    ? formatBillingDate(subscription.currentPeriodEnd)
    : "Belirtilmemiş";
  cancellation.textContent = subscription?.canceledAt
    ? `İptal edildi · ${formatBillingDate(subscription.canceledAt)}`
    : subscription?.cancelRequestedAt
      ? `İptal istendi · ${formatBillingDate(subscription.cancelRequestedAt)}`
      : "Yok";

  const checkoutState = [
    BILLING_ACCOUNT_STATES.FREE,
    BILLING_ACCOUNT_STATES.PREMIUM_CANCELED,
    BILLING_ACCOUNT_STATES.PREMIUM_EXPIRED,
  ].includes(state);
  checkout.classList.toggle("hidden", !checkoutState);
  checkout.disabled = !checkoutEnabled;
  checkout.textContent =
    state === BILLING_ACCOUNT_STATES.PREMIUM_CANCELED ||
    state === BILLING_ACCOUNT_STATES.PREMIUM_EXPIRED
      ? "Yeni Premium aboneliği başlat"
      : "Premium'a geç";

  const cancelState = ["PENDING", "TRIAL", "ACTIVE", "PAST_DUE"].includes(subscription?.status);
  const canCancel = Boolean(cancelState && subscription?.providerSubscriptionId);
  cancel.classList.toggle(
    "hidden",
    !canCancel || state === BILLING_ACCOUNT_STATES.PREMIUM_CANCELING,
  );
  cancel.disabled = false;
  freeBenefits.classList.toggle("hidden", state !== BILLING_ACCOUNT_STATES.FREE);

  if (!supportedState) {
    management.textContent = "Abonelik durumu doğrulanamadığı için işlem düğmeleri kapatıldı.";
  } else if (state === BILLING_ACCOUNT_STATES.FREE) {
    management.textContent = checkoutEnabled
      ? "Premium'a geçiş yeni bir checkout akışı başlatır. Haklar yalnızca doğrulanmış webhook sonrası açılır."
      : "iyzico SANDBOX yapılandırması tamamlanmadı; gerçek ödeme başlatılmayacak.";
  } else if (state === BILLING_ACCOUNT_STATES.PREMIUM_PENDING) {
    management.textContent = canCancel
      ? "Ödeme sağlayıcısı doğrulaması bekleniyor. İstersen bekleyen abonelik işlemini iptal edebilirsin."
      : "Ödeme sağlayıcısı abonelik kimliği doğrulanmadığı için iptal düğmesi gösterilmiyor.";
  } else if (state === BILLING_ACCOUNT_STATES.PREMIUM_ACTIVE) {
    management.textContent = canCancel
      ? "Aboneliği iptal etmek için düğmeye bas. İptal isteği ödeme sağlayıcısı katmanı üzerinden gönderilir."
      : "Ödeme sağlayıcısı abonelik kimliği doğrulanmadığı için iptal işlemi kullanılamıyor.";
  } else if (state === BILLING_ACCOUNT_STATES.PREMIUM_CANCELING) {
    management.textContent =
      "İptal isteği işleniyor. Geçerli dönem sonu ödeme sağlayıcısı tarafından bildirilmedikçe varsayım yapılmaz.";
  } else {
    management.textContent =
      "Eski abonelik yeniden ACTIVE yapılmaz. Premium almak için yeni checkout başlatılır.";
  }
  renderBillingPaymentHistory(paymentHistory);
}

async function loadBillingAccount() {
  const page = $("page-billing-account");
  if (!page) return;
  const error = $("billing-account-error");
  const request = ++billingAccountRequest;
  const scope = insightScope();
  error?.classList.add("hidden");
  try {
    const tokens = getStoredTokens();
    const headers = authHeaders(tokens.accessToken, tokens.tenantId);
    const [entitlements, catalog, subscription, paymentHistory] = await Promise.all([
      fetch("/account/entitlements", { headers }).then(parseResponse),
      fetch("/billing/catalog", { headers }).then(parseResponse),
      fetch("/billing/subscription", { headers }).then(parseResponse),
      fetch("/billing/payments", { headers }).then(parseResponse),
    ]);
    if (request !== billingAccountRequest || scope !== insightScope()) return;
    latestEntitlements = entitlements;
    latestBillingSubscription = subscription;
    renderBillingAccount({ entitlements, catalog, subscription, paymentHistory });
  } catch (err) {
    if (request !== billingAccountRequest) return;
    $("billing-account-checkout-start")?.setAttribute("disabled", "true");
    $("billing-account-cancel")?.classList.add("hidden");
    if (error) {
      error.textContent =
        err?.status === 403
          ? "Ödeme yönetimi yalnızca aktif kişisel alanda kullanılabilir. Kurum ödeme verisi gösterilmez."
          : err?.message || "Ödeme bilgileri yüklenemedi.";
      error.classList.remove("hidden");
    }
    renderBillingPaymentHistory({ payments: [] });
  }
}

function renderIyzicoCheckout(content) {
  const container = $("iyzico-checkout-form");
  if (!container || typeof content !== "string" || content.length > 200000) return false;
  const template = document.createElement("template");
  template.innerHTML = content;
  const scripts = [...template.content.querySelectorAll("script")];
  if (!scripts.length) return false;
  container.replaceChildren();
  for (const source of scripts) {
    const script = document.createElement("script");
    for (const attribute of source.attributes) script.setAttribute(attribute.name, attribute.value);
    script.textContent = source.textContent || "";
    container.appendChild(script);
  }
  return true;
}

async function startPremiumSandboxCheckout(options = {}) {
  const start = options.start || $("premium-checkout-start");
  const status = options.status || $("billing-sandbox-status");
  const feedback = options.feedback || status;
  if (!start || !status) return;
  const tokens = getStoredTokens();
  if (!tokens.accessToken || !tokens.tenantId) return;
  let idempotencyKey;
  try {
    idempotencyKey = crypto.randomUUID();
  } catch {
    idempotencyKey = `billing-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  start.disabled = true;
  try {
    const res = await fetch("/billing/checkout", {
      method: "POST",
      headers: {
        ...authHeaders(tokens.accessToken, tokens.tenantId),
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ billingPeriod: "MONTHLY" }),
    });
    const data = await parseResponse(res);
    const checkoutMessage =
      "Sandbox checkout hazırlandı. Premium, doğrulanmış webhook gelene kadar açılmaz.";
    feedback.textContent = checkoutMessage;
    const rendered = data.redirectUrl ? false : renderIyzicoCheckout(data.checkoutFormContent);
    if (data.redirectUrl) window.location.assign(data.redirectUrl);
    else if (!rendered) feedback.textContent = "Sandbox checkout içeriği alınamadı.";
    if (options.account) {
      await loadBillingAccount();
      if (!data.redirectUrl && rendered) feedback.textContent = checkoutMessage;
    }
  } catch (error) {
    feedback.textContent = error?.message || "Sandbox checkout başlatılamadı.";
    start.disabled = false;
  }
}

function openBillingCancellationDialog() {
  const subscription = latestBillingAccount?.subscription || latestBillingSubscription;
  const dialog = $("billing-cancel-dialog");
  if (!subscription || !dialog) return;
  $("billing-cancel-impact").textContent =
    "Mevcut backend kontratı provider'a anında iptal isteği gönderir. İptal sonrasında Premium hakları devam etmeyebilir.";
  $("billing-cancel-period").textContent = subscription.currentPeriodEnd
    ? `Bilinen dönem sonu: ${formatBillingDate(subscription.currentPeriodEnd)}. İptalin bu tarihe kadar sürüp sürmeyeceği bu kontratta garanti edilmez.`
    : "Geçerli dönem sonu backend tarafından bildirilmedi; hak kaybı zamanı için varsayım yapılmayacaktır.";
  $("billing-cancel-result").textContent = "";
  $("billing-cancel-result").setAttribute("role", "status");
  billingCancelTrigger = document.activeElement;
  if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal();
  else dialog.classList.remove("hidden");
  $("billing-cancel-confirm")?.focus();
}

function closeBillingCancellationDialog() {
  const dialog = $("billing-cancel-dialog");
  if (dialog?.open) dialog.close();
  else dialog?.classList.add("hidden");
  if (billingCancelTrigger?.isConnected && typeof billingCancelTrigger.focus === "function")
    billingCancelTrigger.focus({ preventScroll: true });
  billingCancelTrigger = null;
}

async function submitBillingCancellation() {
  const confirm = $("billing-cancel-confirm");
  const result = $("billing-cancel-result");
  const legacyStatus = $("billing-sandbox-status");
  if (!confirm || !result) return;
  confirm.disabled = true;
  try {
    const tokens = getStoredTokens();
    const res = await fetch("/billing/subscription/cancel", {
      method: "POST",
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
      body: JSON.stringify({}),
    });
    const data = await parseResponse(res);
    const message = data?.canceled
      ? "Abonelik iptal edildi. Premium hakları provider/backend sonucu doğrultusunda güncellendi."
      : "Bu abonelik için iptal isteği daha önce işlendi.";
    result.textContent = message;
    if (legacyStatus) legacyStatus.textContent = message;
    closeBillingCancellationDialog();
    await Promise.all([loadBillingAccount(), loadBillingSubscription(), loadEntitlements()]);
  } catch (error) {
    result.textContent = error?.message || "Abonelik iptal edilemedi.";
    result.setAttribute("role", "alert");
    confirm.disabled = false;
  }
}

function renderReviewCard(review) {
  const card = $("review-card");
  const status = $("review-card-status");
  const items = $("review-items");
  if (!card || !status || !items) return;

  const showShortage =
    review && !review.available && (review.blocked?.insufficientVariation ?? 0) > 0;
  if (!review || (!review.available && !showShortage)) {
    card.classList.add("hidden");
    items.replaceChildren();
    return;
  }

  card.classList.remove("hidden");
  if (showShortage) {
    status.textContent =
      "Tekrar için farklı bir yayınlanmış içerik henüz hazır değil. Yeni içerik geldiğinde burada görünecek.";
    items.innerHTML =
      '<p class="muted review-empty">Aynı soru setini tekrar tekrar göstermiyoruz.</p>';
    return;
  }

  status.textContent = "Önceki çalışmalarından kısa bir tekrar.";
  items.innerHTML = review.items
    .slice(0, 3)
    .map(function (item) {
      const priority = item.priority === "HIGH" ? "Öncelikli" : "Sıradaki tekrar";
      const reason =
        item.reason === "LOW_ACCURACY" ? "Geliştirmek için seçildi" : "Uzun süredir bekliyor";
      return (
        '<article class="review-item">' +
        '<div class="review-item-copy"><strong>' +
        escapeHtml(item.skillName || item.skillCode) +
        '</strong><span class="review-priority">' +
        escapeHtml(priority) +
        '</span><p class="muted">' +
        escapeHtml(item.templateTitle) +
        " · " +
        escapeHtml(reason) +
        '</p></div><button type="button" class="btn btn-primary btn-sm" data-review-start="' +
        escapeHtml(item.templateVersionId) +
        '" data-review-skill="' +
        escapeHtml(item.skillId) +
        '">Tekrara başla</button></article>'
      );
    })
    .join("");

  for (const button of items.querySelectorAll("[data-review-start]")) {
    button.addEventListener("click", async function () {
      button.disabled = true;
      const tokens = getStoredTokens();
      try {
        const response = await fetch("/student/review/start", {
          method: "POST",
          headers: authHeaders(tokens.accessToken, tokens.tenantId),
          body: JSON.stringify({
            templateVersionId: button.getAttribute("data-review-start"),
            skillId: button.getAttribute("data-review-skill"),
            clientSessionId: "review-" + Date.now(),
          }),
        });
        const data = await parseResponse(response);
        exerciseRequestedSessionId = data.sessionId;
        navigate("exercise");
      } catch (error) {
        button.disabled = false;
        if (!isPremiumLimitError(error)) alert(error.message);
      }
    });
  }
}

async function loadLearningPath() {
  var container = $("learning-path");
  var progEl = $("learning-path-progress");
  var levelEl = $("learning-path-level");
  if (!container) return;
  const scope = insightScope();
  try {
    var tokens = getStoredTokens();
    var res = await fetch("/student/learning-path", {
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
    });
    var data = await parseResponse(res);
    if (scope !== insightScope()) return;
    renderHomeInsights(data);
    var nodes = data.nodes || [];
    if (progEl)
      progEl.textContent = data.overallProgress
        ? data.overallProgress.completed +
          "/" +
          data.overallProgress.total +
          " tamamlandı · " +
          data.overallProgress.percent +
          "%"
        : "";
    if (levelEl)
      levelEl.textContent = data.currentLevel
        ? "Seviyen: " + data.currentLevel.name
        : "Seviye belirlenmedi — Seviyemi Ölç ile öğren";
    if (!nodes.length) {
      container.innerHTML =
        '<p class="muted" style="text-align:center">Yakında yeni içerikler eklenecek.</p>';
      return;
    }
    container.innerHTML = nodes
      .map(function (n) {
        var icon =
          n.status === "completed"
            ? "✓"
            : n.status === "locked"
              ? "🔒"
              : n.status === "active"
                ? "▶"
                : "○";
        var label = n.label || n.code;
        var disabled = n.status === "locked" ? " disabled" : "";
        var aria = label + " - " + n.status;
        return (
          '<button type="button" class="path-node ' +
          n.status +
          '" data-node-id="' +
          n.id +
          '" data-node-type="' +
          n.type +
          '" data-template="' +
          (n.templateVersionId || "") +
          '" aria-label="' +
          escapeHtml(aria) +
          '"' +
          disabled +
          '><span aria-hidden="true">' +
          icon +
          '</span><span class="path-node-label">' +
          escapeHtml(label) +
          "</span></button>"
        );
      })
      .join("");
    for (var btn of container.querySelectorAll(".path-node:not(.locked)")) {
      btn.addEventListener("click", function (e) {
        var el = e.currentTarget;
        var tv = el.getAttribute("data-template");
        var type = el.getAttribute("data-node-type");
        if (!tv) {
          if (type === "SKILL") alert("Bu beceri için henüz içerik yok");
          return;
        }
        var tokens2 = getStoredTokens();
        fetch("/student/exercises/start", {
          method: "POST",
          headers: authHeaders(tokens2.accessToken, tokens2.tenantId),
          body: JSON.stringify({ templateVersionId: tv, clientSessionId: "path-" + Date.now() }),
        })
          .then(function (r) {
            return parseResponse(r);
          })
          .then(function (data) {
            exerciseRequestedSessionId = data.sessionId;
            navigate("exercise");
          })
          .catch(function (err) {
            if (!isPremiumLimitError(err)) alert(err.message);
          });
      });
    }
  } catch (_e) {
    void _e;
    container.innerHTML = '<p class="muted" style="text-align:center">Öğrenme yolu yüklenemedi</p>';
  }
}

window.resumeTodaySession = async function (id) {
  exerciseRequestedSessionId = id;
  navigate("exercise");
};
window.startTodayAssignment = async function (id) {
  var tokens = getStoredTokens();
  try {
    var r = await fetch("/student/assignments/" + id + "/start", {
      method: "POST",
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
    });
    var data = await parseResponse(r);
    exerciseRequestedSessionId = data.sessionId;
    navigate("exercise");
  } catch (e) {
    if (!isPremiumLimitError(e)) alert(e.message);
  }
};
window.startTodayAssessment = async function (id) {
  var tokens = getStoredTokens();
  try {
    var r = await fetch("/student/assessments/" + id + "/start", {
      method: "POST",
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
      body: JSON.stringify({}),
    });
    var data = await parseResponse(r);
    exerciseRequestedSessionId = data.sessionId;
    navigate("exercise");
  } catch (e) {
    if (!isPremiumLimitError(e)) alert(e.message);
  }
};
window.startTodayExercise = async function () {
  var tokens = getStoredTokens();
  try {
    var r = await fetch("/student/exercises/start", {
      method: "POST",
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
      body: JSON.stringify({}),
    });
    await parseResponse(r);
    navigate("exercise");
  } catch (e) {
    if (!isPremiumLimitError(e)) alert(e.message);
  }
};

function showOnboarding(state) {
  if (state && state.profile) {
    if (state.profile.displayName) $("onboard-displayName").value = state.profile.displayName;
    if (state.profile.birthYear) $("onboard-birthYear").value = state.profile.birthYear;
    if (state.profile.learningGoal) {
      onboardingSelectedGoal = state.profile.learningGoal;
      for (var g of document.querySelectorAll(".goal-card")) {
        var selected = g.dataset.goal === onboardingSelectedGoal;
        g.classList.toggle("active", selected);
        g.setAttribute("aria-checked", String(selected));
      }
    }
    if (state.profile.currentLevelId) {
      // will be selected after levels load
      setTimeout(function () {
        var sel = $("onboard-level");
        if (sel) sel.value = state.profile.currentLevelId;
      }, 300);
    }
    if (state.consents) {
      for (var c of state.consents) {
        if (c.type === "TERMS_OF_SERVICE") $("onboard-consent-terms").checked = true;
        if (c.type === "DATA_PROCESSING") $("onboard-consent-data").checked = true;
        if (c.type === "PARENTAL_CONSENT") $("onboard-consent-parental").checked = true;
      }
    }
    var age = state.profile.birthYear ? new Date().getFullYear() - state.profile.birthYear : 25;
    var needsParental = Array.isArray(state.requiredConsents)
      ? state.requiredConsents.includes("PARENTAL_CONSENT")
      : age < 18;
    $("onboard-parental-wrap").classList.toggle("hidden", !needsParental);
  }
  onboardingStep = 1;
  updateOnboardingStep();
  void loadOnboardingLevels();
  navigate("onboarding");
}

function updateOnboardingStep() {
  for (var i = 1; i <= 3; i++) {
    var el = $("onboarding-step-" + i);
    if (el) el.classList.toggle("hidden", i !== onboardingStep);
  }
  $("onboarding-ready").classList.add("hidden");
  $("onboarding-step-num").textContent = String(onboardingStep);
  var dots = document.querySelectorAll(".onboarding-dot");
  for (var d = 0; d < dots.length; d++) {
    dots[d].classList.toggle("active", d === onboardingStep - 1);
    dots[d].classList.toggle("complete", d < onboardingStep - 1);
  }
  var labels = ["Başlangıç", "Hedefin", "Son dokunuş"];
  var progressLabel = document.querySelector(".onboarding-progress-label");
  if (progressLabel) progressLabel.textContent = labels[onboardingStep - 1] || labels[0];
  $("onboarding-prev").classList.toggle("hidden", onboardingStep === 1);
  $("onboarding-next").classList.toggle("hidden", onboardingStep === 3);
  $("onboarding-complete").classList.toggle("hidden", onboardingStep !== 3);
  $("onboarding-error").classList.add("hidden");
}

async function loadOnboardingLevels() {
  var sel = $("onboard-level");
  if (!sel || sel.options.length > 1) return;
  try {
    var tokens = getStoredTokens();
    var res = await fetch("/student/onboarding/levels", {
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
    });
    var data = await parseResponse(res);
    var items = data.levels || data || [];
    sel.dataset.loadError = "false";
    sel.innerHTML =
      '<option value="">Seviye seçin…</option>' +
      items
        .map(function (l) {
          return '<option value="' + l.id + '">' + escapeHtml(l.name) + "</option>";
        })
        .join("");
  } catch (_e) {
    void _e;
    sel.dataset.loadError = "true";
    sel.innerHTML = '<option value="">Seviyeler yüklenemedi — tekrar dene</option>';
  }
}

async function saveOnboardingStep() {
  var tokens = getStoredTokens();
  if (onboardingStep === 1) {
    var name = $("onboard-displayName").value.trim();
    var by = $("onboard-birthYear").value.trim();
    if (!name) throw new Error("Ad gerekli");
    var payload = { displayName: name };
    if (by) payload.birthYear = Number(by);
    var res = await fetch("/student/profile", {
      method: "PATCH",
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
      body: JSON.stringify(payload),
    });
    await parseResponse(res);
    var age = by ? new Date().getFullYear() - Number(by) : 25;
    $("onboard-parental-wrap").classList.toggle("hidden", age >= 18);
  } else if (onboardingStep === 2) {
    if ($("onboard-level").dataset.loadError === "true") {
      await loadOnboardingLevels();
      if ($("onboard-level").dataset.loadError === "true") throw new Error("Seviyeler yüklenemedi");
    }
    var levelId = $("onboard-level").value;
    if (!levelId) throw new Error("Sınıf seviyesi gerekli");
    if (!onboardingSelectedGoal) throw new Error("Öğrenme amacı seçin");
    var res2 = await fetch("/student/profile", {
      method: "PATCH",
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
      body: JSON.stringify({ currentLevelId: levelId, learningGoal: onboardingSelectedGoal }),
    });
    await parseResponse(res2);
  } else if (onboardingStep === 3) {
    if (!$("onboard-consent-terms").checked || !$("onboard-consent-data").checked)
      throw new Error("Gerekli onaylar verilmeli");
    // grant consents
    await fetch("/student/consents", {
      method: "POST",
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
      body: JSON.stringify({ type: "TERMS_OF_SERVICE", version: "v1" }),
    }).then(function (r) {
      return parseResponse(r);
    });
    await fetch("/student/consents", {
      method: "POST",
      headers: authHeaders(tokens.accessToken, tokens.tenantId),
      body: JSON.stringify({ type: "DATA_PROCESSING", version: "v1" }),
    }).then(function (r) {
      return parseResponse(r);
    });
    if (
      !$("onboard-parental-wrap").classList.contains("hidden") &&
      $("onboard-consent-parental").checked
    ) {
      await fetch("/student/consents", {
        method: "POST",
        headers: authHeaders(tokens.accessToken, tokens.tenantId),
        body: JSON.stringify({ type: "PARENTAL_CONSENT", version: "v1" }),
      }).then(function (r) {
        return parseResponse(r);
      });
    }
  }
}

function setupOnboardingEvents() {
  var next = $("onboarding-next");
  var prev = $("onboarding-prev");
  var complete = $("onboarding-complete");
  if (next)
    next.addEventListener("click", async function () {
      var errEl = $("onboarding-error");
      errEl.classList.add("hidden");
      next.disabled = true;
      next.setAttribute("aria-busy", "true");
      try {
        await saveOnboardingStep();
        onboardingStep++;
        updateOnboardingStep();
      } catch (e) {
        errEl.textContent = (e.message || "Kaydedilemedi") + " Tekrar deneyebilirsin.";
        errEl.classList.remove("hidden");
      } finally {
        next.disabled = false;
        next.removeAttribute("aria-busy");
      }
    });
  if (prev)
    prev.addEventListener("click", function () {
      if (onboardingStep > 1) {
        onboardingStep--;
        updateOnboardingStep();
      }
    });
  if (complete)
    complete.addEventListener("click", async function () {
      var errEl = $("onboarding-error");
      errEl.classList.add("hidden");
      complete.disabled = true;
      complete.setAttribute("aria-busy", "true");
      try {
        await saveOnboardingStep();
        var tokens = getStoredTokens();
        var res = await fetch("/student/onboarding/complete", {
          method: "POST",
          headers: authHeaders(tokens.accessToken, tokens.tenantId),
          body: JSON.stringify({}),
        });
        await parseResponse(res);
        $("onboarding-step-3").classList.add("hidden");
        $("onboarding-ready").classList.remove("hidden");
        $("onboarding-prev").classList.add("hidden");
        $("onboarding-next").classList.add("hidden");
        $("onboarding-complete").classList.add("hidden");
        $("onboarding-step-num").textContent = "✓";
      } catch (e) {
        errEl.textContent = e.message || "Tamamlanamadı";
        errEl.classList.remove("hidden");
      }
      complete.disabled = false;
      complete.removeAttribute("aria-busy");
    });
  for (var btn of document.querySelectorAll(".goal-card")) {
    btn.addEventListener("click", function (e) {
      onboardingSelectedGoal = e.currentTarget.dataset.goal;
      for (var b of document.querySelectorAll(".goal-card")) {
        var selected = b === e.currentTarget;
        b.classList.toggle("active", selected);
        b.setAttribute("aria-checked", String(selected));
      }
      e.currentTarget.focus();
    });
  }
  var quick = $("onboard-quickstart");
  if (quick)
    quick.addEventListener("click", async function () {
      var tokens = getStoredTokens();
      try {
        var res = await fetch("/student/onboarding/quick-start", {
          headers: authHeaders(tokens.accessToken, tokens.tenantId),
        });
        var data = await parseResponse(res);
        if (!data.templateVersionId) throw new Error("Uygun egzersiz bulunamadı");
        var meForSession = await fetchMe(tokens.accessToken, tokens.tenantId);
        var createRes = await fetch("/admin/exercise-sessions", {
          method: "POST",
          headers: authHeaders(tokens.accessToken, tokens.tenantId),
          body: JSON.stringify({
            studentId: meForSession.user.id,
            templateVersionId: data.templateVersionId,
            clientSessionId: "onboard-" + Date.now(),
          }),
        });
        await parseResponse(createRes);
        navigate("exercise");
        // trigger exercise load if needed
        if (typeof loadExercisePage === "function") void loadExercisePage();
      } catch (e) {
        $("onboarding-error").textContent = e.message;
        $("onboarding-error").classList.remove("hidden");
      }
    });
  var place = $("onboard-placement");
  if (place)
    place.addEventListener("click", async function () {
      var tokens = getStoredTokens();
      try {
        var res = await fetch("/student/onboarding/placement", {
          headers: authHeaders(tokens.accessToken, tokens.tenantId),
        });
        var data = await parseResponse(res);
        if (!data.assessmentId) throw new Error("Uygun değerlendirme bulunamadı");
        var startRes = await fetch("/student/assessments/" + data.assessmentId + "/start", {
          method: "POST",
          headers: authHeaders(tokens.accessToken, tokens.tenantId),
        });
        await parseResponse(startRes);
        navigate("assessments");
        void loadAssessments();
      } catch (e) {
        $("onboarding-error").textContent = e.message;
        $("onboarding-error").classList.remove("hidden");
      }
    });
}
void setupOnboardingEvents();

// ---------- Navigasyon ----------

const PAGES = [
  "dashboard",
  "onboarding",
  "premium-info",
  "billing-account",
  "tenants",
  "users",
  "students",
  "teachers",
  "branches",
  "classes",
  "contents",
  "questions",
  "templates",
  "exercise",
  "skills",
  "levels",
  "assignments",
  "assessments",
  "progress",
  "badges",
  "settings",
];

function navigate(page) {
  if (!PAGES.includes(page)) return;
  if (page === "premium-info" && isPlatformUser !== false) return;
  if (page === "billing-account" && isPlatformUser !== false) return;

  for (const name of PAGES) {
    $("page-" + name)?.classList.toggle("hidden", name !== page);
  }
  for (const item of document.querySelectorAll(".nav-item")) {
    const active = item.dataset.page === page;
    item.classList.toggle("active", active);
    item.toggleAttribute("aria-current", active);
    if (active) item.setAttribute("aria-current", "page");
  }
  for (const item of document.querySelectorAll(".bottom-nav-item")) {
    const active = (item.dataset.bottomPage || item.dataset.page) === page;
    item.classList.toggle("active", active);
    item.toggleAttribute("aria-current", active);
    if (active) item.setAttribute("aria-current", "page");
  }
  if (page === "dashboard") {
    if (!isPlatformUser) {
      void loadToday();
      void loadLearningPath();
      void loadEntitlements();
    }
  } else if (page === "premium-info") {
    recordPremiumTelemetry("PREMIUM_INFO_VIEWED");
    void loadBillingCatalog();
    void loadBillingSubscription();
  } else if (page === "billing-account") {
    void loadBillingAccount();
  } else if (page === "tenants") {
    void loadTenants();
  } else if (page === "users") {
    void loadUsers();
  } else if (page === "students") {
    void loadStudents();
    void populateStudentTenantFilter();
  } else if (page === "teachers") {
    void loadTeachers();
    void populateTeacherTenantFilter();
  } else if (page === "branches") {
    void loadBranches();
    void populateBranchTenantFilter();
  } else if (page === "classes") {
    void loadClasses();
    void populateClassTenantFilter();
  } else if (page === "contents") {
    void loadContents();
    void populateContentFilters();
  } else if (page === "questions") {
    void loadQuestions();
    void populateQuestionFilters();
  } else if (page === "templates") {
    void loadTemplates();
    void populateTemplateFilters();
  } else if (page === "exercise") {
    void loadExercisePage();
  } else if (page === "skills") {
    void loadSkills();
  } else if (page === "levels") {
    void loadLevels();
  } else if (page === "assignments") {
    void loadAssignments();
  } else if (page === "assessments") {
    void loadAssessments();
  } else if (page === "progress") {
    void loadProgress();
  } else if (page === "badges") {
    void loadGamification();
  }
  closeSidebar();
}

function closeSidebar() {
  $("sidebar")?.classList.remove("open");
  $("sidebar-backdrop")?.classList.remove("open");
  $("sidebar-toggle")?.setAttribute("aria-expanded", "false");
}

function openSidebar() {
  $("sidebar")?.classList.add("open");
  $("sidebar-backdrop")?.classList.add("open");
  $("sidebar-toggle")?.setAttribute("aria-expanded", "true");
}

const modalFocusTriggers = new WeakMap();
function setupModalAccessibility() {
  const modals = document.querySelectorAll(".modal-backdrop");
  for (const modal of modals) {
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const title = modal.querySelector("h2[id], h3[id]");
    if (title) modal.setAttribute("aria-labelledby", title.id);
  }
  const focusableSelector =
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
  const focusModal = (modal) => {
    if (modal.contains(document.activeElement)) return;
    modal.querySelector(focusableSelector)?.focus();
  };
  const restoreFocus = (modal) => {
    const trigger = modalFocusTriggers.get(modal);
    modalFocusTriggers.delete(modal);
    if (trigger?.isConnected && typeof trigger.focus === "function") trigger.focus();
  };
  const observer = new MutationObserver((entries) => {
    for (const entry of entries) {
      if (!(entry.target instanceof HTMLElement) || !entry.target.matches(".modal-backdrop"))
        continue;
      const wasHidden = (entry.oldValue || "").split(/\s+/).includes("hidden");
      const isHidden = entry.target.classList.contains("hidden");
      if (wasHidden && !isHidden) {
        const active = document.activeElement;
        if (active && active !== document.body && !entry.target.contains(active))
          modalFocusTriggers.set(entry.target, active);
        focusModal(entry.target);
      } else if (!wasHidden && isHidden) {
        restoreFocus(entry.target);
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
    attributeOldValue: true,
  });
}

// ---------- Tenant / Kurum yönetimi ----------

const TENANT_STATUS_LABELS = {
  ACTIVE: "Aktif",
  SUSPENDED: "Askıda",
  CLOSED: "Kapatıldı",
};

const TENANT_TYPE_LABELS = {
  ORGANIZATION: "Kurum",
  INDIVIDUAL: "Bireysel",
};

let tenantPage = 1;
const TENANT_PAGE_SIZE = 20;
let tenantTotal = 0;
let tenantData = [];
let tenantFormMode = "create";
let tenantEditingId = null;
let tenantDetailCurrent = null;

function tenantApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  // DELETE body'sizdir; boş JSON body Fastify'da FST_ERR_CTP_EMPTY_JSON_BODY
  // verir, bu yüzden content-type header'ı eklenmez.
  if (method === "DELETE") {
    delete headers["content-type"];
  }
  return fetch(`/admin/tenants${path}`, {
    ...options,
    method,
    headers,
  });
}

function showTenantError(message) {
  const el = $("tenant-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideTenantError() {
  $("tenant-error").classList.add("hidden");
}

function tenantStatusBadge(status) {
  const cls = {
    ACTIVE: "badge badge-success",
    SUSPENDED: "badge badge-warning",
    CLOSED: "badge badge-danger",
  }[status];
  return `<span class="${cls ?? "badge"}">${TENANT_STATUS_LABELS[status] ?? status}</span>`;
}

function tenantTypeLabel(type) {
  return TENANT_TYPE_LABELS[type] ?? type;
}

async function loadTenants() {
  hideTenantError();
  const tbody = $("tenant-list-body");
  tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Yükleniyor…</td></tr>';

  const search = $("tenant-search").value.trim();
  const status = $("tenant-status-filter").value;
  const params = new URLSearchParams({
    page: tenantPage,
    pageSize: TENANT_PAGE_SIZE,
  });
  if (search) params.set("search", search);
  if (status) params.set("status", status);

  try {
    const res = await tenantApi(`?${params.toString()}`);
    const body = await parseResponse(res);
    tenantData = body.items;
    tenantTotal = body.total;

    renderTenantList();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">—</td></tr>';
    showTenantError(err.message || "Kurumlar yüklenemedi.");
  }
}

function renderTenantList() {
  const tbody = $("tenant-list-body");

  if (tenantData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Kurum bulunamadı.</td></tr>';
  } else {
    tbody.innerHTML = tenantData
      .map(
        (t) => `
      <tr>
        <td>
          <button type="button" class="link-btn" data-detail-id="${t.id}">
            ${escapeHtml(t.name)}
          </button>
          ${t.slug ? `<div class="cell-muted mono">${escapeHtml(t.slug)}</div>` : ""}
        </td>
        <td>${tenantTypeLabel(t.type)}</td>
        <td>${tenantStatusBadge(t.status)}</td>
        <td>${t.membershipCount}</td>
        <td>${new Date(t.createdAt).toLocaleDateString("tr-TR")}</td>
        <td class="text-right">
          <button type="button" class="btn btn-ghost btn-sm" data-edit-id="${t.id}">Düzenle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-delete-id="${t.id}">Sil</button>
        </td>
      </tr>`,
      )
      .join("");
  }

  const totalPages = Math.max(1, Math.ceil(tenantTotal / TENANT_PAGE_SIZE));
  $("tenant-page-info").textContent = `${tenantTotal} kurum · sayfa ${tenantPage}/${totalPages}`;
  $("tenant-prev-btn").disabled = tenantPage <= 1;
  $("tenant-next-btn").disabled = tenantPage >= totalPages;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openTenantForm(mode, tenant = null) {
  tenantFormMode = mode;
  tenantEditingId = tenant?.id ?? null;
  $("tenant-form-title").textContent = mode === "create" ? "Yeni kurum" : "Kurumu düzenle";
  $("tenant-form-id").value = tenant?.id ?? "";
  $("tenant-form-name").value = tenant?.name ?? "";
  $("tenant-form-type").value = tenant?.type ?? "ORGANIZATION";
  $("tenant-form-slug").value = tenant?.slug ?? "";
  $("tenant-form-logo").value = tenant?.logoUrl ?? "";
  $("tenant-form-error").classList.add("hidden");
  $("tenant-form-modal").classList.remove("hidden");
  $("tenant-form-name").focus();
}

function closeTenantForm() {
  $("tenant-form-modal").classList.add("hidden");
}

function setTenantFormLoading(isLoading) {
  const btn = $("tenant-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}

async function submitTenantForm(event) {
  event.preventDefault();
  const errorEl = $("tenant-form-error");
  errorEl.classList.add("hidden");

  const payload = {
    type: $("tenant-form-type").value,
    name: $("tenant-form-name").value.trim(),
  };
  const slug = $("tenant-form-slug").value.trim();
  const logoUrl = $("tenant-form-logo").value.trim();
  if (slug) payload.slug = slug;
  if (logoUrl) payload.logoUrl = logoUrl;

  if (!payload.name) {
    errorEl.textContent = "Kurum adı gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }

  setTenantFormLoading(true);
  try {
    const isCreate = tenantFormMode === "create";
    const res = isCreate
      ? await tenantApi("", { method: "POST", body: JSON.stringify(payload) })
      : await tenantApi(`/${tenantEditingId}`, { method: "PATCH", body: JSON.stringify(payload) });
    await parseResponse(res);
    closeTenantForm();
    tenantPage = 1;
    await loadTenants();
  } catch (err) {
    errorEl.textContent = err.message || "Kayıt başarısız.";
    errorEl.classList.remove("hidden");
  } finally {
    setTenantFormLoading(false);
  }
}

async function openTenantDetail(id) {
  const modal = $("tenant-detail-modal");
  $("tenant-detail-body").innerHTML = '<p class="muted">Yükleniyor…</p>';
  modal.classList.remove("hidden");

  try {
    const res = await tenantApi(`/${encodeURIComponent(id)}`);
    const detail = await parseResponse(res);
    tenantDetailCurrent = detail;
    renderTenantDetail(detail);
  } catch (err) {
    tenantDetailCurrent = null;
    $("tenant-detail-body").innerHTML =
      `<p class="error">${escapeHtml(err.message || "Detay yüklenemedi.")}</p>`;
  }
}

function renderTenantDetail(t) {
  $("tenant-detail-title").textContent = t.name;

  const rows = [
    ["Kurum kimliği", `<span class="mono">${escapeHtml(t.id)}</span>`],
    ["Tip", tenantTypeLabel(t.type)],
    ["Slug", t.slug ? `<span class="mono">${escapeHtml(t.slug)}</span>` : "—"],
    ["Durum", tenantStatusBadge(t.status)],
    ["Logo", t.logoUrl ? `<span class="mono">${escapeHtml(t.logoUrl)}</span>` : "—"],
    ["Oluşturulma", new Date(t.createdAt).toLocaleDateString("tr-TR")],
    ["Üyeler", String(t.counts.memberships)],
    ["Şubeler", String(t.counts.branches)],
    ["Sınıflar", String(t.counts.classes)],
    ["İçerikler", String(t.counts.contents)],
    ["Ödevler", String(t.counts.assignments)],
  ];

  $("tenant-detail-body").innerHTML = `<dl class="info-grid">${rows
    .map(
      ([k, v]) => `
        <div class="info-item">
          <dt>${k}</dt>
          <dd>${v}</dd>
        </div>`,
    )
    .join("")}</dl>`;

  // Durum değiştirme (yazma işlemi) platform yetkisiyle yapılır; açılır menü.
  const statusSelect = `
    <div class="detail-status-row">
      <label class="field inline-field">
        <span>Durum değiştir</span>
        <select id="tenant-detail-status">
          <option value="ACTIVE" ${t.status === "ACTIVE" ? "selected" : ""}>Aktif</option>
          <option value="SUSPENDED" ${t.status === "SUSPENDED" ? "selected" : ""}>Askıda</option>
          <option value="CLOSED" ${t.status === "CLOSED" ? "selected" : ""}>Kapatıldı</option>
        </select>
      </label>
      <button id="tenant-detail-status-btn" type="button" class="btn btn-ghost btn-sm">Uygula</button>
    </div>`;
  $("tenant-detail-body").insertAdjacentHTML("beforeend", statusSelect);

  $("tenant-detail-status-btn").addEventListener("click", async () => {
    const status = $("tenant-detail-status").value;
    if (status === t.status) return;
    try {
      const res = await tenantApi(`/${encodeURIComponent(t.id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const updated = await parseResponse(res);
      tenantDetailCurrent = updated;
      renderTenantDetail(updated);
      await loadTenants();
    } catch (err) {
      showTenantError(err.message || "Durum güncellenemedi.");
    }
  });
}

async function deleteTenant(id) {
  const tenant = tenantData.find((t) => t.id === id);
  const label = tenant ? tenant.name : id;
  if (!window.confirm(`"${label}" kurumu silmek istediğinize emin misiniz?`)) return;

  try {
    const res = await tenantApi(`/${encodeURIComponent(id)}`, { method: "DELETE" });
    await parseResponse(res);
    tenantPage = 1;
    await loadTenants();
  } catch (err) {
    showTenantError(err.message || "Kurum silinemedi.");
  }
}

function setupTenantEvents() {
  $("tenant-list-body").addEventListener("click", (event) => {
    const detailBtn = event.target.closest("[data-detail-id]");
    const editBtn = event.target.closest("[data-edit-id]");
    const deleteBtn = event.target.closest("[data-delete-id]");

    if (detailBtn) {
      void openTenantDetail(detailBtn.dataset.detailId);
    } else if (editBtn) {
      const tenant = tenantData.find((t) => t.id === editBtn.dataset.editId);
      if (tenant) openTenantForm("edit", tenant);
    } else if (deleteBtn) {
      void deleteTenant(deleteBtn.dataset.deleteId);
    }
  });

  $("tenant-search").addEventListener("input", () => {
    tenantPage = 1;
    void loadTenants();
  });
  $("tenant-status-filter").addEventListener("change", () => {
    tenantPage = 1;
    void loadTenants();
  });
  $("tenant-prev-btn").addEventListener("click", () => {
    if (tenantPage > 1) {
      tenantPage -= 1;
      void loadTenants();
    }
  });
  $("tenant-next-btn").addEventListener("click", () => {
    tenantPage += 1;
    void loadTenants();
  });

  $("tenant-create-btn").addEventListener("click", () => openTenantForm("create"));
  $("tenant-form").addEventListener("submit", submitTenantForm);
  $("tenant-form-close").addEventListener("click", closeTenantForm);
  $("tenant-form-cancel").addEventListener("click", closeTenantForm);

  $("tenant-detail-close").addEventListener("click", () => {
    $("tenant-detail-modal").classList.add("hidden");
  });
  $("tenant-detail-edit").addEventListener("click", () => {
    if (!tenantDetailCurrent) return;
    $("tenant-detail-modal").classList.add("hidden");
    openTenantForm("edit", tenantDetailCurrent);
  });
  $("tenant-detail-delete").addEventListener("click", () => {
    if (!tenantDetailCurrent) return;
    $("tenant-detail-modal").classList.add("hidden");
    void deleteTenant(tenantDetailCurrent.id);
  });
}

// ---------- Login formu ----------

function setLoading(isLoading) {
  const submitBtn = $("login-submit");
  submitBtn.disabled = isLoading;
  submitBtn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  submitBtn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
  $("login-error").classList.add("hidden");
}

function setSignupLoading(isLoading) {
  const submitBtn = $("signup-submit");
  submitBtn.disabled = isLoading;
  submitBtn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  submitBtn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
  $("signup-error").classList.add("hidden");
}

function showSignupForm() {
  $("login-form").classList.add("hidden");
  $("signup-form").classList.remove("hidden");
  $("signup-display-name").focus();
}

function showLoginForm() {
  $("signup-form").classList.add("hidden");
  $("login-form").classList.remove("hidden");
  $("login-email").focus();
}

$("show-signup-btn").addEventListener("click", showSignupForm);
$("show-login-btn").addEventListener("click", showLoginForm);

$("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (inFlight) return;

  const displayName = $("signup-display-name").value.trim();
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;

  if (!displayName || !email || password.length < 8) {
    $("signup-error").textContent = "Ad, geçerli e-posta ve en az 8 karakter şifre gereklidir.";
    $("signup-error").classList.remove("hidden");
    return;
  }

  inFlight = true;
  setSignupLoading(true);
  try {
    const session = await signup(displayName, email, password);
    setStoredSession(session);
    showDashboard(session);
  } catch (err) {
    $("signup-error").textContent = err.message || "Hesap oluşturulamadı.";
    $("signup-error").classList.remove("hidden");
  } finally {
    inFlight = false;
    setSignupLoading(false);
  }
});

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (inFlight) return;

  const email = $("login-email").value.trim();
  const password = $("login-password").value;

  if (!email || !password) {
    $("login-error").textContent = "E-posta ve şifre gereklidir.";
    $("login-error").classList.remove("hidden");
    return;
  }

  inFlight = true;
  setLoading(true);
  try {
    const session = await login(email, password);
    setStoredSession(session);
    showDashboard(session);
  } catch (err) {
    $("login-error").textContent = err.message || "Giriş başarısız.";
    $("login-error").classList.remove("hidden");
  } finally {
    inFlight = false;
    setLoading(false);
  }
});

// ---------- Logout ----------

$("logout-btn").addEventListener("click", async () => {
  const { refreshToken, tenantId } = getStoredTokens();
  try {
    if (refreshToken) {
      await logout(refreshToken, tenantId);
    }
  } catch (_e) {
    void _e;
    // Sunucu tarafı iptal başarısız olsa bile yerel session temizlenir.
  } finally {
    clearStoredSession();
    showLogin();
  }
});

// ---------- Navigasyon (menü) ----------

const sidebarBackdrop = document.createElement("div");
sidebarBackdrop.className = "sidebar-backdrop";
sidebarBackdrop.id = "sidebar-backdrop";
document.body.appendChild(sidebarBackdrop);

for (const item of document.querySelectorAll(".nav-item")) {
  item.addEventListener("click", () => navigate(item.dataset.page));
}
for (const item of document.querySelectorAll(".bottom-nav-item")) {
  item.addEventListener("click", () => navigate(item.dataset.bottomPage || item.dataset.page));
}

$("sidebar-toggle").addEventListener("click", () => {
  const isOpen = $("sidebar").classList.contains("open");
  if (isOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
});

$("sidebar-backdrop").addEventListener("click", closeSidebar);

// ---------- Kullanıcı / Üyelik yönetimi ----------

const USER_STATUS_LABELS = {
  ACTIVE: "Aktif",
  INVITED: "Davetli",
  SUSPENDED: "Askıda",
  CLOSED: "Kapatıldı",
};

const MEMBERSHIP_ROLE_LABELS = {
  OWNER: "Sahip",
  ORG_ADMIN: "Kurum Yöneticisi",
  BRANCH_MANAGER: "Şube Müdürü",
  TEACHER: "Öğretmen",
  STUDENT: "Öğrenci",
  PARENT: "Veli",
};

const MEMBERSHIP_STATUS_LABELS = {
  PENDING: "Beklemede",
  ACTIVE: "Aktif",
  INACTIVE: "Pasif",
  REMOVED: "Kaldırıldı",
};

let userPage = 1;
const USER_PAGE_SIZE = 20;
let userTotal = 0;
let userData = [];
let userFormMode = "create";
let userEditingId = null;
let userDetailCurrent = null;

function userApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (method === "DELETE") {
    delete headers["content-type"];
  }
  return fetch(`/admin/users${path}`, { ...options, method, headers });
}

function membershipApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (method === "DELETE") {
    delete headers["content-type"];
  }
  return fetch(`/admin/memberships${path}`, { ...options, method, headers });
}

function showUserError(message) {
  const el = $("user-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideUserError() {
  $("user-error").classList.add("hidden");
}

function userStatusBadge(status) {
  const cls = {
    ACTIVE: "badge badge-success",
    INVITED: "badge badge-info",
    SUSPENDED: "badge badge-warning",
    CLOSED: "badge badge-danger",
  }[status];
  return `<span class="${cls ?? "badge"}">${USER_STATUS_LABELS[status] ?? status}</span>`;
}

function membershipStatusBadge(status) {
  const cls = {
    PENDING: "badge badge-warning",
    ACTIVE: "badge badge-success",
    INACTIVE: "badge badge-neutral",
    REMOVED: "badge badge-danger",
  }[status];
  return `<span class="${cls ?? "badge"}">${MEMBERSHIP_STATUS_LABELS[status] ?? status}</span>`;
}

async function loadUsers() {
  hideUserError();
  const tbody = $("user-list-body");
  tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Yükleniyor…</td></tr>';

  const search = $("user-search").value.trim();
  const status = $("user-status-filter").value;
  const params = new URLSearchParams({
    page: userPage,
    pageSize: USER_PAGE_SIZE,
  });
  if (search) params.set("search", search);
  if (status) params.set("status", status);

  try {
    const res = await userApi(`?${params.toString()}`);
    const body = await parseResponse(res);
    userData = body.items;
    userTotal = body.total;

    renderUserList();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">—</td></tr>';
    showUserError(err.message || "Kullanıcılar yüklenemedi.");
  }
}

function renderUserList() {
  const tbody = $("user-list-body");

  if (userData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Kullanıcı bulunamadı.</td></tr>';
  } else {
    tbody.innerHTML = userData
      .map(
        (u) => `
      <tr>
        <td>
          <button type="button" class="link-btn" data-user-detail-id="${u.id}">
            ${escapeHtml(u.displayName)}
          </button>
          ${u.email ? `<div class="cell-muted">${escapeHtml(u.email)}</div>` : ""}
        </td>
        <td>${u.phone ? escapeHtml(u.phone) : "—"}</td>
        <td>${u.birthYear ?? "—"}</td>
        <td>${userStatusBadge(u.status)}</td>
        <td>${u.membershipCount}</td>
        <td class="text-right">
          <button type="button" class="btn btn-ghost btn-sm" data-user-edit-id="${u.id}">Düzenle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-user-delete-id="${u.id}">Sil</button>
        </td>
      </tr>`,
      )
      .join("");
  }

  const totalPages = Math.max(1, Math.ceil(userTotal / USER_PAGE_SIZE));
  $("user-page-info").textContent = `${userTotal} kullanıcı · sayfa ${userPage}/${totalPages}`;
  $("user-prev-btn").disabled = userPage <= 1;
  $("user-next-btn").disabled = userPage >= totalPages;
}

const INDIVIDUAL_ALLOWED_ROLES = ["STUDENT", "PARENT"];

function membershipRoleOptions(tenantType) {
  const entries = Object.entries(MEMBERSHIP_ROLE_LABELS);
  const allowed = tenantType === "INDIVIDUAL" ? INDIVIDUAL_ALLOWED_ROLES : null;
  return entries
    .filter(([value]) => !allowed || allowed.includes(value))
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
}

function openUserForm(mode, user = null) {
  userFormMode = mode;
  userEditingId = user?.id ?? null;
  $("user-form-title").textContent = mode === "create" ? "Yeni kullanıcı" : "Kullanıcıyı düzenle";
  $("user-form-id").value = user?.id ?? "";
  $("user-form-name").value = user?.displayName ?? "";
  $("user-form-email").value = user?.email ?? "";
  $("user-form-phone").value = user?.phone ?? "";
  $("user-form-birthyear").value = user?.birthYear ?? "";
  $("user-form-status").value = user?.status ?? "ACTIVE";
  $("user-form-password").value = "";
  // Parola yalnızca oluştururken istenir.
  const isCreate = mode === "create";
  $("user-form-password-field").classList.toggle("hidden", !isCreate);
  $("user-form-password").required = isCreate;
  // İlk kurum üyeliği yalnızca oluştururken sunulur.
  $("user-form-initial-membership").classList.toggle("hidden", !isCreate);
  if (isCreate) {
    $("user-form-tenant").value = "";
    $("user-form-role").innerHTML = `<option value="">Rol seçin…</option>`;
    void populateUserFormTenantSelect();
  }
  $("user-form-error").classList.add("hidden");
  $("user-form-modal").classList.remove("hidden");
  $("user-form-name").focus();
}

async function populateUserFormTenantSelect() {
  const select = $("user-form-tenant");
  select.innerHTML = `<option value="">Kurum seçin…</option>`;
  try {
    const res = await userApi("/../tenants?page=1&pageSize=100");
    const body = await parseResponse(res);
    const options = body.items
      .map(
        (t) =>
          `<option value="${t.id}" data-type="${t.type}">${escapeHtml(t.name)} (${tenantTypeLabel(t.type)})</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Kurum seçin…</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }
}

function closeUserForm() {
  $("user-form-modal").classList.add("hidden");
}

function setUserFormLoading(isLoading) {
  const btn = $("user-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}

async function submitUserForm(event) {
  event.preventDefault();
  const errorEl = $("user-form-error");
  errorEl.classList.add("hidden");

  const payload = {
    displayName: $("user-form-name").value.trim(),
    email: $("user-form-email").value.trim(),
    status: $("user-form-status").value,
  };
  const phone = $("user-form-phone").value.trim();
  const birthYear = $("user-form-birthyear").value.trim();
  if (phone) payload.phone = phone;
  if (birthYear) payload.birthYear = Number(birthYear);
  if (userFormMode === "create") payload.password = $("user-form-password").value;

  if (!payload.displayName) {
    errorEl.textContent = "Ad gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!payload.email) {
    errorEl.textContent = "E-posta gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (userFormMode === "create" && !payload.password) {
    errorEl.textContent = "Parola gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }

  setUserFormLoading(true);
  try {
    const isCreate = userFormMode === "create";
    const res = isCreate
      ? await userApi("", { method: "POST", body: JSON.stringify(payload) })
      : await userApi(`/${userEditingId}`, { method: "PATCH", body: JSON.stringify(payload) });
    const created = await parseResponse(res);

    // Kullanıcı oluşturulduktan sonra ilk kurum üyeliği de eklenir (tek akış).
    if (isCreate) {
      const tenantId = $("user-form-tenant").value;
      const role = $("user-form-role").value;
      if (tenantId && role) {
        try {
          const memRes = await membershipApi("", {
            method: "POST",
            body: JSON.stringify({
              userId: created.id,
              tenantId,
              role,
              status: "ACTIVE",
            }),
          });
          await parseResponse(memRes);
        } catch (memErr) {
          errorEl.textContent = `Kullanıcı oluşturuldu ancak üyelik eklenemedi: ${memErr.message || "Bilinmeyen hata"}`;
          errorEl.classList.remove("hidden");
          closeUserForm();
          userPage = 1;
          await loadUsers();
          return;
        }
      }
    }

    closeUserForm();
    userPage = 1;
    await loadUsers();
  } catch (err) {
    errorEl.textContent = err.message || "Kayıt başarısız.";
    errorEl.classList.remove("hidden");
  } finally {
    setUserFormLoading(false);
  }
}

async function openUserDetail(id) {
  const modal = $("user-detail-modal");
  $("user-detail-body").innerHTML = '<p class="muted">Yükleniyor…</p>';
  modal.classList.remove("hidden");

  try {
    const res = await userApi(`/${encodeURIComponent(id)}`);
    const detail = await parseResponse(res);
    userDetailCurrent = detail;
    renderUserDetail(detail);
  } catch (err) {
    userDetailCurrent = null;
    $("user-detail-body").innerHTML =
      `<p class="error">${escapeHtml(err.message || "Detay yüklenemedi.")}</p>`;
  }
}

function renderUserDetail(u) {
  $("user-detail-title").textContent = u.displayName;

  const rows = [
    ["Kullanıcı kimliği", `<span class="mono">${escapeHtml(u.id)}</span>`],
    ["E-posta", u.email ? escapeHtml(u.email) : "—"],
    ["Telefon", u.phone ? escapeHtml(u.phone) : "—"],
    ["Doğum yılı", u.birthYear ?? "—"],
    ["Durum", userStatusBadge(u.status)],
    [
      "Platform rolü",
      u.platformRole ? `<span class="mono">${escapeHtml(u.platformRole)}</span>` : "Yok",
    ],
    [
      "E-posta doğrulandı",
      u.emailVerifiedAt ? new Date(u.emailVerifiedAt).toLocaleString("tr-TR") : "Hayır",
    ],
    ["Son giriş", u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("tr-TR") : "—"],
    ["Oluşturulma", u.createdAt ? new Date(u.createdAt).toLocaleDateString("tr-TR") : "—"],
  ];

  const statusOptions = Object.entries(MEMBERSHIP_STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");

  const memberships = u.memberships ?? [];
  const membershipRows = memberships.length
    ? memberships
        .map(
          (m) => `
      <tr>
        <td>${escapeHtml(m.tenantName)}</td>
        <td>${tenantTypeLabel(m.tenantType)}</td>
        <td>
          <select class="mem-role-select" data-mem-role="${m.id}">
            ${setSelectedOption(membershipRoleOptions(m.tenantType), m.role)}
          </select>
        </td>
        <td>
          <div class="mem-status-cell">
            ${membershipStatusBadge(m.status)}
            <select class="mem-status-select" data-mem-status="${m.id}">
              ${setSelectedOption(statusOptions, m.status)}
            </select>
          </div>
        </td>
        <td class="text-right">
          <div class="membership-row-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-mem-update="${m.id}">Uygula</button>
            <button type="button" class="btn btn-ghost btn-sm" data-mem-remove="${m.id}">Kaldır</button>
          </div>
        </td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="empty-cell">Üyelik yok.</td></tr>';

  $("user-detail-body").innerHTML = `
    <dl class="info-grid">${rows
      .map(
        ([k, v]) => `
        <div class="info-item">
          <dt>${k}</dt>
          <dd>${v}</dd>
        </div>`,
      )
      .join("")}</dl>

    <div class="membership-section">
      <h4>Üyelik ekle</h4>
      <div class="membership-add-row">
        <label class="field">
          <span>Kurum *</span>
          <select id="membership-add-tenant">
            <option value="">Yükleniyor…</option>
          </select>
        </label>
        <label class="field">
          <span>Rol *</span>
          <select id="membership-add-role"><option value="">Rol seçin…</option></select>
        </label>
        <label class="field">
          <span>Durum *</span>
          <select id="membership-add-status">${statusOptions}</select>
        </label>
        <button id="membership-add-btn" type="button" class="btn btn-primary">Ekle</button>
      </div>

      <h4>Üyelikler (${memberships.length})</h4>
      <div class="card table-card">
        <table class="data-table membership-table">
          <thead>
            <tr>
              <th>Kurum</th>
              <th>Tenant Tipi</th>
              <th>Rol</th>
              <th>Durum</th>
              <th class="text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>${membershipRows}</tbody>
        </table>
      </div>
    </div>`;

  void populateMembershipTenantSelect();
}

async function populateMembershipTenantSelect() {
  const select = $("membership-add-tenant");
  if (!select) return;
  try {
    const res = await fetch("/admin/tenants?page=1&pageSize=100", {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .map(
        (t) =>
          `<option value="${t.id}" data-type="${t.type}">${escapeHtml(t.name)} (${tenantTypeLabel(t.type)})</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Kurum seçin…</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }
}

function setSelectedOption(html, value) {
  return html
    .split("</option>")
    .join("</option>")
    .replace(new RegExp(`value="${value}"`), `value="${value}" selected`);
}

async function updateMembership(membershipId) {
  const roleSelect = document.querySelector(`[data-mem-role="${membershipId}"]`);
  const statusSelect = document.querySelector(`[data-mem-status="${membershipId}"]`);
  if (!roleSelect || !statusSelect) return;

  const payload = {};
  const role = roleSelect.value;
  const status = statusSelect.value;
  if (role) payload.role = role;
  if (status) payload.status = status;

  try {
    const res = await membershipApi(`/${encodeURIComponent(membershipId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    await parseResponse(res);
    await openUserDetail(userDetailCurrent.id);
  } catch (err) {
    showUserError(err.message || "Üyelik güncellenemedi.");
  }
}

async function removeMembership(membershipId) {
  if (!window.confirm("Bu üyeliği kaldırmak istediğinize emin misiniz?")) return;
  try {
    const res = await membershipApi(`/${encodeURIComponent(membershipId)}`, {
      method: "DELETE",
    });
    await parseResponse(res);
    await openUserDetail(userDetailCurrent.id);
  } catch (err) {
    showUserError(err.message || "Üyelik kaldırılamadı.");
  }
}

async function addMembership() {
  const tenantId = $("membership-add-tenant").value;
  const role = $("membership-add-role").value;
  const status = $("membership-add-status").value;

  if (!tenantId) {
    showUserError("Lütfen bir kurum seçin.");
    return;
  }

  try {
    const res = await membershipApi("", {
      method: "POST",
      body: JSON.stringify({ userId: userDetailCurrent.id, tenantId, role, status }),
    });
    await parseResponse(res);
    await openUserDetail(userDetailCurrent.id);
  } catch (err) {
    showUserError(err.message || "Üyelik eklenemedi.");
  }
}

async function deleteUser(id) {
  const user = userData.find((u) => u.id === id);
  const label = user ? user.displayName : id;
  if (!window.confirm(`"${label}" kullanıcısını silmek istediğinize emin misiniz?`)) return;

  try {
    const res = await userApi(`/${encodeURIComponent(id)}`, { method: "DELETE" });
    await parseResponse(res);
    userPage = 1;
    await loadUsers();
  } catch (err) {
    showUserError(err.message || "Kullanıcı silinemedi.");
  }
}

function setupUserEvents() {
  $("user-list-body").addEventListener("click", (event) => {
    const detailBtn = event.target.closest("[data-user-detail-id]");
    const editBtn = event.target.closest("[data-user-edit-id]");
    const deleteBtn = event.target.closest("[data-user-delete-id]");

    if (detailBtn) {
      void openUserDetail(detailBtn.dataset.userDetailId);
    } else if (editBtn) {
      const user = userData.find((u) => u.id === editBtn.dataset.userEditId);
      if (user) openUserForm("edit", user);
    } else if (deleteBtn) {
      void deleteUser(deleteBtn.dataset.userDeleteId);
    }
  });

  $("user-search").addEventListener("input", () => {
    userPage = 1;
    void loadUsers();
  });
  $("user-status-filter").addEventListener("change", () => {
    userPage = 1;
    void loadUsers();
  });
  $("user-prev-btn").addEventListener("click", () => {
    if (userPage > 1) {
      userPage -= 1;
      void loadUsers();
    }
  });
  $("user-next-btn").addEventListener("click", () => {
    userPage += 1;
    void loadUsers();
  });

  $("user-create-btn").addEventListener("click", () => openUserForm("create"));
  $("user-form").addEventListener("submit", submitUserForm);
  $("user-form-close").addEventListener("click", closeUserForm);
  $("user-form-cancel").addEventListener("click", closeUserForm);

  // Kurum seçildiğinde rol seçenekleri tenant tipine göre filtrelenir.
  $("user-form-tenant").addEventListener("change", (event) => {
    const option = event.target.selectedOptions[0];
    const tenantType = option?.dataset?.type ?? "";
    $("user-form-role").innerHTML =
      `<option value="">Rol seçin…</option>${membershipRoleOptions(tenantType)}`;
  });

  // Üyelik ekleme bölümünde de kurum tipine göre rol filtresi.
  $("user-detail-body").addEventListener("change", (event) => {
    if (event.target.id !== "membership-add-tenant") return;
    const option = event.target.selectedOptions[0];
    const tenantType = option?.dataset?.type ?? "";
    $("membership-add-role").innerHTML =
      `<option value="">Rol seçin…</option>${membershipRoleOptions(tenantType)}`;
  });

  $("user-detail-close").addEventListener("click", () => {
    $("user-detail-modal").classList.add("hidden");
  });
  $("user-detail-edit").addEventListener("click", () => {
    if (!userDetailCurrent) return;
    $("user-detail-modal").classList.add("hidden");
    openUserForm("edit", userDetailCurrent);
  });
  $("user-detail-delete").addEventListener("click", () => {
    if (!userDetailCurrent) return;
    $("user-detail-modal").classList.add("hidden");
    void deleteUser(userDetailCurrent.id);
  });

  // Üyelik ekleme / güncelleme / kaldırma (detay modalı içinde).
  $("user-detail-body").addEventListener("click", (event) => {
    const addBtn = event.target.closest("#membership-add-btn");
    const updateBtn = event.target.closest("[data-mem-update]");
    const removeBtn = event.target.closest("[data-mem-remove]");

    if (addBtn) {
      void addMembership();
    } else if (updateBtn) {
      void updateMembership(updateBtn.dataset.memUpdate);
    } else if (removeBtn) {
      void removeMembership(removeBtn.dataset.memRemove);
    }
  });
}

// ---------- Öğrenci / sınıf kayıtları yönetimi ----------

const ENROLLMENT_STATUS_LABELS = {
  ACTIVE: "Aktif",
  LEFT: "Ayrıldı",
  COMPLETED: "Tamamlandı",
};

let studentPage = 1;
const STUDENT_PAGE_SIZE = 20;
let studentTotal = 0;
let studentData = [];
let studentFormMode = "create";
let studentEditingId = null;
let studentDetailCurrent = null;
let studentFilterTenantsLoaded = false;

function studentApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (method === "DELETE") {
    delete headers["content-type"];
  }
  return fetch(`/admin/students${path}`, { ...options, method, headers });
}

function studentOptionsApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  return fetch(`/admin/student-options${path}`, { ...options, method, headers });
}

function showStudentError(message) {
  const el = $("student-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideStudentError() {
  $("student-error").classList.add("hidden");
}

function enrollmentStatusBadge(status) {
  const cls = {
    ACTIVE: "badge badge-success",
    LEFT: "badge badge-neutral",
    COMPLETED: "badge badge-info",
  }[status];
  return `<span class="${cls ?? "badge"}">${ENROLLMENT_STATUS_LABELS[status] ?? status}</span>`;
}

async function populateStudentTenantFilter() {
  const select = $("student-tenant-filter");
  if (studentFilterTenantsLoaded) return;
  try {
    const res = await fetch("/admin/tenants?page=1&pageSize=100", {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .map(
        (t) =>
          `<option value="${t.id}" data-type="${t.type}">${escapeHtml(t.name)} (${tenantTypeLabel(t.type)})</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Tüm kurumlar</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
    studentFilterTenantsLoaded = true;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }
}

async function loadStudents() {
  hideStudentError();
  const tbody = $("student-list-body");
  tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Yükleniyor…</td></tr>';

  const search = $("student-search").value.trim();
  const tenantId = $("student-tenant-filter").value;
  const status = $("student-status-filter").value;
  const params = new URLSearchParams({
    page: studentPage,
    pageSize: STUDENT_PAGE_SIZE,
  });
  if (search) params.set("search", search);
  if (tenantId) params.set("tenantId", tenantId);
  if (status) params.set("status", status);

  try {
    const res = await studentApi(`?${params.toString()}`);
    const body = await parseResponse(res);
    studentData = body.items;
    studentTotal = body.total;

    renderStudentList();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">—</td></tr>';
    showStudentError(err.message || "Öğrenciler yüklenemedi.");
  }
}

function renderStudentList() {
  const tbody = $("student-list-body");

  if (studentData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Öğrenci bulunamadı.</td></tr>';
  } else {
    tbody.innerHTML = studentData
      .map(
        (s) => `
      <tr>
        <td>
          <button type="button" class="link-btn" data-student-detail-id="${s.id}">
            ${escapeHtml(s.displayName)}
          </button>
        </td>
        <td>${s.email ? escapeHtml(s.email) : "—"}</td>
        <td>${escapeHtml(s.tenantName)}</td>
        <td>${s.className ? escapeHtml(s.className) : "—"}</td>
        <td>${userStatusBadge(s.status)}</td>
        <td class="text-right">
          <button type="button" class="btn btn-ghost btn-sm" data-student-edit-id="${s.id}">Düzenle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-student-delete-id="${s.id}">Sil</button>
        </td>
      </tr>`,
      )
      .join("");
  }

  const totalPages = Math.max(1, Math.ceil(studentTotal / STUDENT_PAGE_SIZE));
  $("student-page-info").textContent =
    `${studentTotal} öğrenci · sayfa ${studentPage}/${totalPages}`;
  $("student-prev-btn").disabled = studentPage <= 1;
  $("student-next-btn").disabled = studentPage >= totalPages;
}

async function populateStudentLevelSelects() {
  const select = $("student-form-current-level");
  const target = $("student-form-target-level");
  try {
    const res = await studentOptionsApi("/levels");
    const body = await parseResponse(res);
    const options = body
      .map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`)
      .join("");
    const empty = `<option value="">Seviye seçin…</option>`;
    select.innerHTML = options ? empty + options : `<option value="">Seviye bulunamadı</option>`;
    target.innerHTML = options ? empty + options : `<option value="">Seviye bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Seviyeler yüklenemedi</option>`;
    target.innerHTML = `<option value="">Seviyeler yüklenemedi</option>`;
  }
}

async function populateStudentTenantSelect() {
  const select = $("student-form-tenant");
  select.innerHTML = `<option value="">Kurum seçin…</option>`;
  try {
    const res = await fetch("/admin/tenants?page=1&pageSize=100", {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .map(
        (t) =>
          `<option value="${t.id}" data-type="${t.type}">${escapeHtml(t.name)} (${tenantTypeLabel(t.type)})</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Kurum seçin…</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }
}

async function loadStudentAcademicYears(tenantId) {
  const select = $("student-form-academic-year");
  select.innerHTML = `<option value="">Akademik yıl seçin…</option>`;
  if (!tenantId) return;
  try {
    const res = await studentOptionsApi(`/academic-years?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await parseResponse(res);
    const options = body
      .map(
        (y) =>
          `<option value="${y.id}">${escapeHtml(y.name)}${y.status === "ACTIVE" ? " (Aktif)" : ""}</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Akademik yıl seçin…</option>${options}`
      : `<option value="">Akademik yıl bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Akademik yıllar yüklenemedi</option>`;
  }
}

async function loadStudentClasses(tenantId, academicYearId) {
  const select = $("student-form-class");
  select.innerHTML = `<option value="">Sınıf seçin…</option>`;
  if (!tenantId) return;
  try {
    const params = new URLSearchParams({ tenantId });
    if (academicYearId) params.set("academicYearId", academicYearId);
    const res = await studentOptionsApi(`/classes?${params.toString()}`);
    const body = await parseResponse(res);
    const options = body
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join("");
    select.innerHTML = options
      ? `<option value="">Sınıf seçin…</option>${options}`
      : `<option value="">Sınıf bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Sınıflar yüklenemedi</option>`;
  }
}

function openStudentForm(mode, student = null) {
  studentFormMode = mode;
  studentEditingId = student?.id ?? null;
  $("student-form-title").textContent = mode === "create" ? "Yeni öğrenci" : "Öğrenciyi düzenle";
  $("student-form-id").value = student?.id ?? "";
  $("student-form-name").value = student?.user?.displayName ?? "";
  $("student-form-email").value = student?.user?.email ?? "";
  $("student-form-phone").value = student?.user?.phone ?? "";
  $("student-form-birthyear").value = student?.user?.birthYear ?? "";
  $("student-form-status").value = student?.user?.status ?? "ACTIVE";
  $("student-form-password").value = "";

  const isCreate = mode === "create";
  $("student-form-password-field").classList.toggle("hidden", !isCreate);
  $("student-form-password").required = isCreate;
  $("student-form-tenant-field").classList.toggle("hidden", !isCreate);
  $("student-form-enrollment").classList.toggle("hidden", !isCreate);
  $("student-form-started-field").classList.toggle("hidden", isCreate);

  if (isCreate) {
    $("student-form-tenant").value = "";
    $("student-form-academic-year").innerHTML = `<option value="">Akademik yıl seçin…</option>`;
    $("student-form-class").innerHTML = `<option value="">Sınıf seçin…</option>`;
    void populateStudentTenantSelect();
  } else {
    $("student-form-current-level").value = student?.profile?.currentLevel?.id ?? "";
    $("student-form-target-level").value = student?.profile?.targetLevel?.id ?? "";
    const started = student?.profile?.startedAt;
    $("student-form-started").value = started ? new Date(started).toISOString().slice(0, 10) : "";
  }

  void populateStudentLevelSelects();
  $("student-form-error").classList.add("hidden");
  $("student-form-modal").classList.remove("hidden");
  $("student-form-name").focus();
}

function closeStudentForm() {
  $("student-form-modal").classList.add("hidden");
}

function setStudentFormLoading(isLoading) {
  const btn = $("student-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}

async function submitStudentForm(event) {
  event.preventDefault();
  const errorEl = $("student-form-error");
  errorEl.classList.add("hidden");

  const isCreate = studentFormMode === "create";
  const payload = {
    displayName: $("student-form-name").value.trim(),
    email: $("student-form-email").value.trim(),
    status: $("student-form-status").value,
  };
  const phone = $("student-form-phone").value.trim();
  const birthYear = $("student-form-birthyear").value.trim();
  if (phone) payload.phone = phone;
  if (birthYear) payload.birthYear = Number(birthYear);

  if (!payload.displayName) {
    errorEl.textContent = "Ad gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!payload.email) {
    errorEl.textContent = "E-posta gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (isCreate) {
    const tenantId = $("student-form-tenant").value;
    if (!tenantId) {
      errorEl.textContent = "Kurum gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    const password = $("student-form-password").value;
    if (!password) {
      errorEl.textContent = "Parola gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    payload.tenantId = tenantId;
    payload.password = password;
    const currentLevelId = $("student-form-current-level").value;
    const targetLevelId = $("student-form-target-level").value;
    if (currentLevelId) payload.currentLevelId = currentLevelId;
    if (targetLevelId) payload.targetLevelId = targetLevelId;
    const classId = $("student-form-class").value;
    if (classId) payload.classId = classId;
  } else {
    const currentLevelId = $("student-form-current-level").value;
    const targetLevelId = $("student-form-target-level").value;
    if (currentLevelId) payload.currentLevelId = currentLevelId;
    else payload.currentLevelId = null;
    if (targetLevelId) payload.targetLevelId = targetLevelId;
    else payload.targetLevelId = null;
    const started = $("student-form-started").value;
    if (started) payload.startedAt = started;
  }

  setStudentFormLoading(true);
  try {
    const res = isCreate
      ? await studentApi("", { method: "POST", body: JSON.stringify(payload) })
      : await studentApi(`/${studentEditingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
    await parseResponse(res);
    closeStudentForm();
    studentPage = 1;
    await loadStudents();
  } catch (err) {
    errorEl.textContent = err.message || "Kayıt başarısız.";
    errorEl.classList.remove("hidden");
  } finally {
    setStudentFormLoading(false);
  }
}

async function openStudentDetail(id) {
  const modal = $("student-detail-modal");
  $("student-detail-body").innerHTML = '<p class="muted">Yükleniyor…</p>';
  modal.classList.remove("hidden");

  try {
    const res = await studentApi(`/${encodeURIComponent(id)}`);
    const detail = await parseResponse(res);
    studentDetailCurrent = detail;
    renderStudentDetail(detail);
  } catch (err) {
    studentDetailCurrent = null;
    $("student-detail-body").innerHTML =
      `<p class="error">${escapeHtml(err.message || "Detay yüklenemedi.")}</p>`;
  }
}

function renderStudentDetail(d) {
  $("student-detail-title").textContent = d.user.displayName;

  const infoRows = [
    ["Ad Soyad", escapeHtml(d.user.displayName)],
    ["E-posta", d.user.email ? escapeHtml(d.user.email) : "—"],
    ["Telefon", d.user.phone ? escapeHtml(d.user.phone) : "—"],
    ["Doğum yılı", d.user.birthYear ?? "—"],
    ["Hesap durumu", userStatusBadge(d.user.status)],
    [
      "Kayıt tarihi",
      d.user.createdAt ? new Date(d.user.createdAt).toLocaleDateString("tr-TR") : "—",
    ],
  ];

  const memberships = d.memberships ?? [];
  const membershipRows = memberships.length
    ? memberships
        .map(
          (m) => `
      <tr>
        <td>${escapeHtml(m.tenantName)}</td>
        <td>${tenantTypeLabel(m.tenantType)}</td>
        <td>${MEMBERSHIP_ROLE_LABELS[m.role] ?? m.role}</td>
        <td>${membershipStatusBadge(m.status)}</td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="4" class="empty-cell">Üyelik yok.</td></tr>';

  const profile = d.profile;
  const profileRows = [
    ["Mevcut seviye", profile.currentLevel ? escapeHtml(profile.currentLevel.name) : "—"],
    ["Hedef seviye", profile.targetLevel ? escapeHtml(profile.targetLevel.name) : "—"],
    [
      "Başlangıç tarihi",
      profile.startedAt ? new Date(profile.startedAt).toLocaleDateString("tr-TR") : "—",
    ],
  ];

  const enrollments = d.enrollments ?? [];
  const enrollmentRows = enrollments.length
    ? enrollments
        .map(
          (e) => `
      <tr>
        <td>${escapeHtml(e.academicYearName)}</td>
        <td>${escapeHtml(e.className)}</td>
        <td>${enrollmentStatusBadge(e.status)}</td>
        <td>${e.enrolledAt ? new Date(e.enrolledAt).toLocaleDateString("tr-TR") : "—"}</td>
        <td>${e.leftAt ? new Date(e.leftAt).toLocaleDateString("tr-TR") : "—"}</td>
        <td class="text-right">
          <select class="enr-status-select" data-enr-status="${e.id}">
            ${setSelectedOption(enrollmentStatusOptions(), e.status)}
          </select>
          <button type="button" class="btn btn-ghost btn-sm" data-enr-update="${e.id}">Uygula</button>
        </td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="6" class="empty-cell">Sınıf kaydı yok.</td></tr>';

  $("student-detail-body").innerHTML = `
    <section class="detail-section">
      <h4>Kişisel Bilgiler</h4>
      <dl class="info-grid">${infoRows
        .slice(0, 4)
        .map(([k, v]) => `<div class="info-item"><dt>${k}</dt><dd>${v}</dd></div>`)
        .join("")}</dl>
    </section>

    <section class="detail-section">
      <h4>Hesap Bilgileri</h4>
      <dl class="info-grid">${infoRows
        .slice(4)
        .map(([k, v]) => `<div class="info-item"><dt>${k}</dt><dd>${v}</dd></div>`)
        .join("")}</dl>
    </section>

    <section class="detail-section">
      <h4>Kurumlar</h4>
      <div class="card table-card">
        <table class="data-table">
          <thead>
            <tr><th>Kurum</th><th>Tip</th><th>Rol</th><th>Durum</th></tr>
          </thead>
          <tbody>${membershipRows}</tbody>
        </table>
      </div>
    </section>

    <section class="detail-section">
      <h4>Öğrenci Profili</h4>
      <dl class="info-grid">${profileRows
        .map(([k, v]) => `<div class="info-item"><dt>${k}</dt><dd>${v}</dd></div>`)
        .join("")}</dl>
    </section>

    <section class="detail-section">
      <h4>Sınıf Kayıtları</h4>
      <div class="enrollment-add-row">
        <label class="field">
          <span>Akademik yıl</span>
          <select id="enroll-add-year"><option value="">Yükleniyor…</option></select>
        </label>
        <label class="field">
          <span>Sınıf</span>
          <select id="enroll-add-class"><option value="">Sınıf seçin…</option></select>
        </label>
        <button id="enroll-add-btn" type="button" class="btn btn-primary">Kayıt ekle</button>
      </div>
      <div class="card table-card">
        <table class="data-table">
          <thead>
            <tr><th>Akademik Yıl</th><th>Sınıf</th><th>Durum</th><th>Başlangıç</th><th>Ayrılma</th><th class="text-right">İşlemler</th></tr>
          </thead>
          <tbody>${enrollmentRows}</tbody>
        </table>
      </div>
    </section>`;

  void populateEnrollmentAddYear(d.tenant.id);
}

function enrollmentStatusOptions() {
  return Object.entries(ENROLLMENT_STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
}

async function populateEnrollmentAddYear(tenantId) {
  const year = $("enroll-add-year");
  const cls = $("enroll-add-class");
  if (!year) return;
  try {
    const res = await studentOptionsApi(`/academic-years?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await parseResponse(res);
    const options = body
      .map(
        (y) =>
          `<option value="${y.id}">${escapeHtml(y.name)}${y.status === "ACTIVE" ? " (Aktif)" : ""}</option>`,
      )
      .join("");
    year.innerHTML = options
      ? `<option value="">Akademik yıl seçin…</option>${options}`
      : `<option value="">Akademik yıl bulunamadı</option>`;
  } catch (_e) {
    void _e;
    year.innerHTML = `<option value="">Akademik yıllar yüklenemedi</option>`;
  }
  cls.innerHTML = `<option value="">Sınıf seçin…</option>`;
}

async function populateEnrollmentAddClasses(tenantId, academicYearId) {
  const cls = $("enroll-add-class");
  if (!cls) return;
  const params = new URLSearchParams({ tenantId });
  if (academicYearId) params.set("academicYearId", academicYearId);
  try {
    const res = await studentOptionsApi(`/classes?${params.toString()}`);
    const body = await parseResponse(res);
    const options = body
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join("");
    cls.innerHTML = options
      ? `<option value="">Sınıf seçin…</option>${options}`
      : `<option value="">Sınıf bulunamadı</option>`;
  } catch (_e) {
    void _e;
    cls.innerHTML = `<option value="">Sınıflar yüklenemedi</option>`;
  }
}

async function addEnrollment() {
  const classId = $("enroll-add-class")?.value;
  if (!classId || !studentDetailCurrent) {
    showStudentError("Lütfen bir sınıf seçin.");
    return;
  }
  try {
    const res = await studentApi(`/${studentDetailCurrent.id}/enrollments`, {
      method: "POST",
      body: JSON.stringify({ classId }),
    });
    await parseResponse(res);
    await openStudentDetail(studentDetailCurrent.id);
  } catch (err) {
    showStudentError(err.message || "Sınıf kaydı eklenemedi.");
  }
}

async function updateEnrollment(enrollmentId) {
  const statusSelect = document.querySelector(`[data-enr-status="${enrollmentId}"]`);
  if (!statusSelect) return;
  try {
    const res = await fetch(`/admin/enrollments/${encodeURIComponent(enrollmentId)}`, {
      method: "PATCH",
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
      body: JSON.stringify({ status: statusSelect.value }),
    });
    await parseResponse(res);
    await openStudentDetail(studentDetailCurrent.id);
  } catch (err) {
    showStudentError(err.message || "Sınıf kaydı güncellenemedi.");
  }
}

async function deleteStudent(id) {
  const student = studentData.find((s) => s.id === id);
  const label = student ? student.displayName : id;
  if (!window.confirm(`"${label}" öğrencisini silmek istediğinize emin misiniz?`)) return;

  try {
    const res = await studentApi(`/${encodeURIComponent(id)}`, { method: "DELETE" });
    await parseResponse(res);
    studentPage = 1;
    await loadStudents();
  } catch (err) {
    showStudentError(err.message || "Öğrenci silinemedi.");
  }
}

function setupStudentEvents() {
  $("student-list-body").addEventListener("click", (event) => {
    const detailBtn = event.target.closest("[data-student-detail-id]");
    const editBtn = event.target.closest("[data-student-edit-id]");
    const deleteBtn = event.target.closest("[data-student-delete-id]");

    if (detailBtn) {
      void openStudentDetail(detailBtn.dataset.studentDetailId);
    } else if (editBtn) {
      const student = studentData.find((s) => s.id === editBtn.dataset.studentEditId);
      if (student) {
        // Düzenleme detay gerektirir (profil/hesap alanları listede yok).
        void openStudentDetail(editBtn.dataset.studentEditId).then(() => {
          $("student-detail-modal").classList.add("hidden");
          openStudentForm("edit", studentDetailCurrent);
        });
      }
    } else if (deleteBtn) {
      void deleteStudent(deleteBtn.dataset.studentDeleteId);
    }
  });

  $("student-search").addEventListener("input", () => {
    studentPage = 1;
    void loadStudents();
  });
  $("student-tenant-filter").addEventListener("change", () => {
    studentPage = 1;
    void loadStudents();
  });
  $("student-status-filter").addEventListener("change", () => {
    studentPage = 1;
    void loadStudents();
  });
  $("student-prev-btn").addEventListener("click", () => {
    if (studentPage > 1) {
      studentPage -= 1;
      void loadStudents();
    }
  });
  $("student-next-btn").addEventListener("click", () => {
    studentPage += 1;
    void loadStudents();
  });

  $("student-create-btn").addEventListener("click", () => openStudentForm("create"));
  $("student-form").addEventListener("submit", submitStudentForm);
  $("student-form-close").addEventListener("click", closeStudentForm);
  $("student-form-cancel").addEventListener("click", closeStudentForm);

  // Kurum seçilince akademik yıl + sınıf yüklenir.
  $("student-form-tenant").addEventListener("change", (event) => {
    const tenantId = event.target.value;
    void loadStudentAcademicYears(tenantId);
    void loadStudentClasses(tenantId, "");
  });
  // Akademik yıl seçilince sınıflar filtrelenir.
  $("student-form-academic-year").addEventListener("change", (event) => {
    const tenantId = $("student-form-tenant").value;
    void loadStudentClasses(tenantId, event.target.value);
  });

  $("student-detail-close").addEventListener("click", () => {
    $("student-detail-modal").classList.add("hidden");
  });
  $("student-detail-edit").addEventListener("click", () => {
    if (!studentDetailCurrent) return;
    $("student-detail-modal").classList.add("hidden");
    openStudentForm("edit", studentDetailCurrent);
  });
  $("student-detail-delete").addEventListener("click", () => {
    if (!studentDetailCurrent) return;
    $("student-detail-modal").classList.add("hidden");
    void deleteStudent(studentDetailCurrent.id);
  });

  // Detay içi olaylar: kayıt ekleme, durum değiştirme.
  $("student-detail-body").addEventListener("click", (event) => {
    const addBtn = event.target.closest("#enroll-add-btn");
    const updateBtn = event.target.closest("[data-enr-update]");

    if (addBtn) {
      void addEnrollment();
    } else if (updateBtn) {
      void updateEnrollment(updateBtn.dataset.enrUpdate);
    }
  });
  $("student-detail-body").addEventListener("change", (event) => {
    if (event.target.id === "enroll-add-year" && studentDetailCurrent) {
      void populateEnrollmentAddClasses(studentDetailCurrent.tenant.id, event.target.value);
    }
  });
}

// ---------- Öğretmen yönetimi ----------

let teacherPage = 1;
const TEACHER_PAGE_SIZE = 20;
let teacherTotal = 0;
let teacherData = [];
let teacherFormMode = "create";
let teacherEditingId = null;
let teacherDetailCurrent = null;

function teacherApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (method === "DELETE") {
    delete headers["content-type"];
  }
  return fetch(`/admin/teachers${path}`, { ...options, method, headers });
}

function teacherOptionsApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  return fetch(`/admin/teacher-options${path}`, { ...options, method, headers });
}

// /admin/teacher-branches ve /admin/teacher-class-assignments alt uçları için.
function teacherSubApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (method === "DELETE") {
    delete headers["content-type"];
  }
  return fetch(`/admin${path}`, { ...options, method, headers });
}

function showTeacherError(message) {
  const el = $("teacher-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideTeacherError() {
  $("teacher-error").classList.add("hidden");
}

async function populateTeacherTenantFilter() {
  const select = $("teacher-tenant-filter");
  try {
    const res = await fetch("/admin/tenants?page=1&pageSize=100", {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .map(
        (t) =>
          `<option value="${t.id}" data-type="${t.type}">${escapeHtml(t.name)} (${tenantTypeLabel(t.type)})</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Tüm kurumlar</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }
}

async function loadTeachers() {
  hideTeacherError();
  const tbody = $("teacher-list-body");
  tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Yükleniyor…</td></tr>';

  const search = $("teacher-search").value.trim();
  const tenantId = $("teacher-tenant-filter").value;
  const status = $("teacher-status-filter").value;
  const params = new URLSearchParams({
    page: teacherPage,
    pageSize: TEACHER_PAGE_SIZE,
  });
  if (search) params.set("search", search);
  if (tenantId) params.set("tenantId", tenantId);
  if (status) params.set("status", status);

  try {
    const res = await teacherApi(`?${params.toString()}`);
    const body = await parseResponse(res);
    teacherData = body.items;
    teacherTotal = body.total;
    renderTeacherList();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">—</td></tr>';
    showTeacherError(err.message || "Öğretmenler yüklenemedi.");
  }
}

function renderTeacherList() {
  const tbody = $("teacher-list-body");

  if (teacherData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Öğretmen bulunamadı.</td></tr>';
  } else {
    tbody.innerHTML = teacherData
      .map(
        (t) => `
      <tr>
        <td>
          <button type="button" class="link-btn" data-teacher-detail-id="${t.userId}">
            ${escapeHtml(t.displayName)}
          </button>
        </td>
        <td>${t.email ? escapeHtml(t.email) : "—"}</td>
        <td>${escapeHtml(t.tenantName)}</td>
        <td>${t.branchCount > 0 ? `${t.branchCount} şube` : "—"}</td>
        <td>${t.classCount > 0 ? `${t.classCount} sınıf` : "—"}</td>
        <td>${userStatusBadge(t.status)}</td>
        <td class="text-right">
          <button type="button" class="btn btn-ghost btn-sm" data-teacher-edit-id="${t.userId}">Düzenle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-teacher-delete-id="${t.userId}">Sil</button>
        </td>
      </tr>`,
      )
      .join("");
  }

  const totalPages = Math.max(1, Math.ceil(teacherTotal / TEACHER_PAGE_SIZE));
  $("teacher-page-info").textContent =
    `${teacherTotal} öğretmen · sayfa ${teacherPage}/${totalPages}`;
  $("teacher-prev-btn").disabled = teacherPage <= 1;
  $("teacher-next-btn").disabled = teacherPage >= totalPages;
}

async function populateTeacherTenantSelect() {
  const select = $("teacher-form-tenant");
  select.innerHTML = `<option value="">Kurum seçin…</option>`;
  try {
    const res = await fetch("/admin/tenants?page=1&pageSize=100", {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .map(
        (t) =>
          `<option value="${t.id}" data-type="${t.type}">${escapeHtml(t.name)} (${tenantTypeLabel(t.type)})</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Kurum seçin…</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }
}

function openTeacherForm(mode, teacher = null) {
  teacherFormMode = mode;
  teacherEditingId = teacher?.user?.id ?? null;
  $("teacher-form-title").textContent = mode === "create" ? "Yeni öğretmen" : "Öğretmeni düzenle";
  $("teacher-form-id").value = teacher?.user?.id ?? "";
  $("teacher-form-name").value = teacher?.user?.displayName ?? "";
  $("teacher-form-email").value = teacher?.user?.email ?? "";
  $("teacher-form-phone").value = teacher?.user?.phone ?? "";
  $("teacher-form-birthyear").value = teacher?.user?.birthYear ?? "";
  $("teacher-form-status").value = teacher?.user?.status ?? "ACTIVE";
  $("teacher-form-password").value = "";
  $("teacher-form-individual-hint").classList.add("hidden");

  const isCreate = mode === "create";
  $("teacher-form-password-field").classList.toggle("hidden", !isCreate);
  $("teacher-form-password").required = isCreate;
  $("teacher-form-tenant-field").classList.toggle("hidden", !isCreate);

  if (isCreate) {
    $("teacher-form-tenant").value = "";
    void populateTeacherTenantSelect();
  }

  $("teacher-form-error").classList.add("hidden");
  $("teacher-form-modal").classList.remove("hidden");
  $("teacher-form-name").focus();
}

function closeTeacherForm() {
  $("teacher-form-modal").classList.add("hidden");
}

function setTeacherFormLoading(isLoading) {
  const btn = $("teacher-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}

async function submitTeacherForm(event) {
  event.preventDefault();
  const errorEl = $("teacher-form-error");
  errorEl.classList.add("hidden");

  const isCreate = teacherFormMode === "create";
  const payload = {
    displayName: $("teacher-form-name").value.trim(),
    email: $("teacher-form-email").value.trim(),
    status: $("teacher-form-status").value,
  };
  const phone = $("teacher-form-phone").value.trim();
  const birthYear = $("teacher-form-birthyear").value.trim();
  if (phone) payload.phone = phone;
  if (birthYear) payload.birthYear = Number(birthYear);

  if (!payload.displayName) {
    errorEl.textContent = "Ad gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!payload.email) {
    errorEl.textContent = "E-posta gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (isCreate) {
    const tenantId = $("teacher-form-tenant").value;
    if (!tenantId) {
      errorEl.textContent = "Kurum gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    const password = $("teacher-form-password").value;
    if (!password) {
      errorEl.textContent = "Parola gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    const opt = $("teacher-form-tenant").selectedOptions[0];
    if (opt?.dataset?.type === "INDIVIDUAL") {
      errorEl.textContent = "Bireysel kurumda öğretmen rolü kullanılamaz.";
      errorEl.classList.remove("hidden");
      return;
    }
    payload.tenantId = tenantId;
    payload.password = password;
  }

  setTeacherFormLoading(true);
  try {
    const res = isCreate
      ? await teacherApi("", { method: "POST", body: JSON.stringify(payload) })
      : await teacherApi(`/${teacherEditingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
    await parseResponse(res);
    closeTeacherForm();
    teacherPage = 1;
    await loadTeachers();
  } catch (err) {
    errorEl.textContent = err.message || "Kayıt başarısız.";
    errorEl.classList.remove("hidden");
  } finally {
    setTeacherFormLoading(false);
  }
}

async function openTeacherDetail(userId) {
  const modal = $("teacher-detail-modal");
  $("teacher-detail-body").innerHTML = '<p class="muted">Yükleniyor…</p>';
  modal.classList.remove("hidden");

  try {
    const res = await teacherApi(`/${encodeURIComponent(userId)}`);
    const detail = await parseResponse(res);
    teacherDetailCurrent = detail;
    renderTeacherDetail(detail);
  } catch (err) {
    teacherDetailCurrent = null;
    $("teacher-detail-body").innerHTML =
      `<p class="error">${escapeHtml(err.message || "Detay yüklenemedi.")}</p>`;
  }
}

function teacherMembershipStatusOptions() {
  return Object.entries(MEMBERSHIP_STATUS_LABELS)
    .filter(([value]) => ["ACTIVE", "INACTIVE", "REMOVED"].includes(value))
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
}

function renderTeacherDetail(d) {
  $("teacher-detail-title").textContent = d.user.displayName;

  const infoRows = [
    ["Ad Soyad", escapeHtml(d.user.displayName)],
    ["E-posta", d.user.email ? escapeHtml(d.user.email) : "—"],
    ["Telefon", d.user.phone ? escapeHtml(d.user.phone) : "—"],
    ["Doğum yılı", d.user.birthYear ?? "—"],
    ["Hesap durumu", userStatusBadge(d.user.status)],
    [
      "Kayıt tarihi",
      d.user.createdAt ? new Date(d.user.createdAt).toLocaleDateString("tr-TR") : "—",
    ],
  ];

  const memberships = d.memberships ?? [];
  const membershipRows = memberships.length
    ? memberships
        .map(
          (m) => `
      <tr>
        <td>${escapeHtml(m.tenantName)}</td>
        <td>${tenantTypeLabel(m.tenantType)}</td>
        <td>${MEMBERSHIP_ROLE_LABELS[m.role] ?? m.role}</td>
        <td>${membershipStatusBadge(m.status)}</td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="4" class="empty-cell">Üyelik yok.</td></tr>';

  // Öğretmen kurumları (kurum seçimi için TEACHER üyelikleri).
  const teacherTenants = memberships.filter((m) => m.role === "TEACHER");
  const tenantOptions = teacherTenants.length
    ? teacherTenants
        .map((m) => `<option value="${m.tenantId}">${escapeHtml(m.tenantName)}</option>`)
        .join("")
    : '<option value="">Kurum yok</option>';

  const branches = d.branches ?? [];
  const branchRows = branches.length
    ? branches
        .map(
          (b) => `
      <tr>
        <td>${escapeHtml(b.tenantName)}</td>
        <td>${escapeHtml(b.branchName)}</td>
        <td>${membershipStatusBadge(b.status)}</td>
        <td class="text-right">
          <select class="enr-status-select" data-tbranch-status="${b.id}">
            ${setSelectedOption(teacherMembershipStatusOptions(), b.status)}
          </select>
          <button type="button" class="btn btn-ghost btn-sm" data-tbranch-update="${b.id}">Uygula</button>
          <button type="button" class="btn btn-ghost btn-sm" data-tbranch-remove="${b.id}">Kaldır</button>
        </td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="4" class="empty-cell">Şube üyeliği yok.</td></tr>';

  const assignments = d.classAssignments ?? [];
  const assignmentRows = assignments.length
    ? assignments
        .map(
          (c) => `
      <tr>
        <td>${escapeHtml(c.tenantName)}</td>
        <td>${escapeHtml(c.academicYearName)}</td>
        <td>${escapeHtml(c.className)}</td>
        <td>${escapeHtml(c.branchName)}</td>
        <td>${c.subject ? escapeHtml(c.subject) : "—"}</td>
        <td>${membershipStatusBadge(c.status)}</td>
        <td class="text-right">
          <select class="enr-status-select" data-tclass-status="${c.id}">
            ${setSelectedOption(teacherMembershipStatusOptions(), c.status)}
          </select>
          <button type="button" class="btn btn-ghost btn-sm" data-tclass-update="${c.id}">Uygula</button>
          <button type="button" class="btn btn-ghost btn-sm" data-tclass-remove="${c.id}">Kaldır</button>
        </td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="7" class="empty-cell">Sınıf ataması yok.</td></tr>';

  $("teacher-detail-body").innerHTML = `
    <section class="detail-section">
      <h4>Kişisel Bilgiler</h4>
      <dl class="info-grid">${infoRows
        .slice(0, 4)
        .map(([k, v]) => `<div class="info-item"><dt>${k}</dt><dd>${v}</dd></div>`)
        .join("")}</dl>
    </section>

    <section class="detail-section">
      <h4>Hesap Bilgileri</h4>
      <dl class="info-grid">${infoRows
        .slice(4)
        .map(([k, v]) => `<div class="info-item"><dt>${k}</dt><dd>${v}</dd></div>`)
        .join("")}</dl>
    </section>

    <section class="detail-section">
      <h4>Kurumlar</h4>
      <div class="card table-card">
        <table class="data-table">
          <thead>
            <tr><th>Kurum</th><th>Tip</th><th>Rol</th><th>Durum</th></tr>
          </thead>
          <tbody>${membershipRows}</tbody>
        </table>
      </div>
    </section>

    <section class="detail-section">
      <h4>Şube Üyelikleri</h4>
      <label class="field">
        <span>Kurum</span>
        <select id="teacher-detail-tenant">${tenantOptions}</select>
      </label>
      <div class="enrollment-add-row">
        <label class="field">
          <span>Şube</span>
          <select id="tbranch-add-branch"><option value="">Yükleniyor…</option></select>
        </label>
        <button data-tbranch-add type="button" class="btn btn-primary">Şube ekle</button>
      </div>
      <div class="card table-card">
        <table class="data-table">
          <thead>
            <tr><th>Kurum</th><th>Şube</th><th>Durum</th><th class="text-right">İşlemler</th></tr>
          </thead>
          <tbody>${branchRows}</tbody>
        </table>
      </div>
    </section>

    <section class="detail-section">
      <h4>Sınıf Atamaları</h4>
      <div class="enrollment-add-row">
        <label class="field">
          <span>Akademik yıl</span>
          <select id="teacher-class-year"><option value="">Yükleniyor…</option></select>
        </label>
        <label class="field">
          <span>Sınıf</span>
          <select id="teacher-class-select"><option value="">Sınıf seçin…</option></select>
        </label>
        <label class="field">
          <span>Ders</span>
          <input id="teacher-class-subject" type="text" maxlength="120" placeholder="Matematik" />
        </label>
        <button data-tclass-add type="button" class="btn btn-primary">Sınıf ata</button>
      </div>
      <div class="card table-card">
        <table class="data-table">
          <thead>
            <tr><th>Kurum</th><th>Akademik Yıl</th><th>Sınıf</th><th>Şube</th><th>Ders</th><th>Durum</th><th class="text-right">İşlemler</th></tr>
          </thead>
          <tbody>${assignmentRows}</tbody>
        </table>
      </div>
    </section>`;

  // Kurum seçimine göre şube + sınıf listelerini yükle.
  const defaultTenantId = teacherTenants[0]?.tenantId ?? "";
  const tenantSelect = $("teacher-detail-tenant");
  if (defaultTenantId) {
    tenantSelect.value = defaultTenantId;
    void populateTeacherDetailBranches(defaultTenantId);
    void populateTeacherDetailYears(defaultTenantId);
  } else {
    $("tbranch-add-branch").innerHTML = `<option value="">Kurum yok</option>`;
    $("teacher-class-year").innerHTML = `<option value="">Kurum yok</option>`;
  }
}

async function populateTeacherDetailBranches(tenantId) {
  const select = $("tbranch-add-branch");
  if (!select) return;
  if (!tenantId) {
    select.innerHTML = `<option value="">Kurum seçin…</option>`;
    return;
  }
  try {
    const res = await teacherOptionsApi(`/branches?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await parseResponse(res);
    const options = body
      .map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`)
      .join("");
    select.innerHTML = options
      ? `<option value="">Şube seçin…</option>${options}`
      : `<option value="">Şube bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Şubeler yüklenemedi</option>`;
  }
}

async function populateTeacherDetailYears(tenantId) {
  const year = $("teacher-class-year");
  const cls = $("teacher-class-select");
  if (!year) return;
  if (!tenantId) {
    year.innerHTML = `<option value="">Kurum seçin…</option>`;
    cls.innerHTML = `<option value="">Sınıf seçin…</option>`;
    return;
  }
  try {
    const res = await teacherOptionsApi(`/classes?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await parseResponse(res);
    const years = [];
    const map = new Map();
    for (const c of body) {
      if (!years.some((y) => y.id === c.academicYearId)) {
        years.push({ id: c.academicYearId, name: c.academicYear.name });
      }
      map.set(c.id, c);
    }
    year.innerHTML = years.length
      ? `<option value="">Tüm akademik yıllar</option>${years
          .map((y) => `<option value="${y.id}">${escapeHtml(y.name)}</option>`)
          .join("")}`
      : `<option value="">Akademik yıl bulunamadı</option>`;
    cls.innerHTML = `<option value="">Sınıf seçin…</option>${body
      .map(
        (c) =>
          `<option value="${c.id}" data-year="${c.academicYearId}">${escapeHtml(c.name)}</option>`,
      )
      .join("")}`;
  } catch (_e) {
    void _e;
    year.innerHTML = `<option value="">Akademik yıllar yüklenemedi</option>`;
    cls.innerHTML = `<option value="">Sınıf seçin…</option>`;
  }
}

async function populateTeacherDetailClasses(tenantId, academicYearId) {
  const cls = $("teacher-class-select");
  if (!cls) return;
  const params = new URLSearchParams({ tenantId });
  if (academicYearId) params.set("academicYearId", academicYearId);
  try {
    const res = await teacherOptionsApi(`/classes?${params.toString()}`);
    const body = await parseResponse(res);
    cls.innerHTML = `<option value="">Sınıf seçin…</option>${body
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join("")}`;
  } catch (_e) {
    void _e;
    cls.innerHTML = `<option value="">Sınıflar yüklenemedi</option>`;
  }
}

async function addTeacherBranch() {
  const branchId = $("tbranch-add-branch")?.value;
  if (!branchId || !teacherDetailCurrent) {
    showTeacherError("Lütfen bir şube seçin.");
    return;
  }
  try {
    const res = await teacherApi(`/${teacherDetailCurrent.user.id}/branches`, {
      method: "POST",
      body: JSON.stringify({ branchId }),
    });
    await parseResponse(res);
    await openTeacherDetail(teacherDetailCurrent.user.id);
  } catch (err) {
    showTeacherError(err.message || "Şube üyeliği eklenemedi.");
  }
}

async function addTeacherClass() {
  const classId = $("teacher-class-select")?.value;
  if (!classId || !teacherDetailCurrent) {
    showTeacherError("Lütfen bir sınıf seçin.");
    return;
  }
  const subject = $("teacher-class-subject").value.trim();
  const payload = { classId };
  if (subject) payload.subject = subject;
  try {
    const res = await teacherApi(`/${teacherDetailCurrent.user.id}/classes`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await parseResponse(res);
    await openTeacherDetail(teacherDetailCurrent.user.id);
  } catch (err) {
    showTeacherError(err.message || "Sınıf ataması eklenemedi.");
  }
}

async function updateTeacherBranch(branchMembershipId) {
  const statusSelect = document.querySelector(`[data-tbranch-status="${branchMembershipId}"]`);
  if (!statusSelect) return;
  try {
    const res = await teacherSubApi(`/teacher-branches/${encodeURIComponent(branchMembershipId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: statusSelect.value }),
    });
    await parseResponse(res);
    await openTeacherDetail(teacherDetailCurrent.user.id);
  } catch (err) {
    showTeacherError(err.message || "Şube üyeliği güncellenemedi.");
  }
}

async function removeTeacherBranch(branchMembershipId) {
  const branch = teacherDetailCurrent?.branches?.find((b) => b.id === branchMembershipId);
  const label = branch ? branch.branchName : branchMembershipId;
  if (!window.confirm(`"${label}" şube üyeliğini kaldırmak istediğinize emin misiniz?`)) return;
  try {
    const res = await teacherSubApi(`/teacher-branches/${encodeURIComponent(branchMembershipId)}`, {
      method: "DELETE",
    });
    await parseResponse(res);
    await openTeacherDetail(teacherDetailCurrent.user.id);
  } catch (err) {
    showTeacherError(err.message || "Şube üyeliği kaldırılamadı.");
  }
}

async function updateTeacherClass(assignmentId) {
  const statusSelect = document.querySelector(`[data-tclass-status="${assignmentId}"]`);
  if (!statusSelect) return;
  try {
    const res = await teacherSubApi(
      `/teacher-class-assignments/${encodeURIComponent(assignmentId)}`,
      { method: "PATCH", body: JSON.stringify({ status: statusSelect.value }) },
    );
    await parseResponse(res);
    await openTeacherDetail(teacherDetailCurrent.user.id);
  } catch (err) {
    showTeacherError(err.message || "Sınıf ataması güncellenemedi.");
  }
}

async function removeTeacherClass(assignmentId) {
  const assignment = teacherDetailCurrent?.classAssignments?.find((c) => c.id === assignmentId);
  const label = assignment ? assignment.className : assignmentId;
  if (!window.confirm(`"${label}" sınıf atamasını kaldırmak istediğinize emin misiniz?`)) return;
  try {
    const res = await teacherSubApi(
      `/teacher-class-assignments/${encodeURIComponent(assignmentId)}`,
      { method: "DELETE" },
    );
    await parseResponse(res);
    await openTeacherDetail(teacherDetailCurrent.user.id);
  } catch (err) {
    showTeacherError(err.message || "Sınıf ataması kaldırılamadı.");
  }
}

async function deleteTeacher(userId) {
  const teacher = teacherData.find((t) => t.userId === userId);
  const label = teacher ? teacher.displayName : userId;
  if (!window.confirm(`"${label}" öğretmenini silmek istediğinize emin misiniz?`)) return;

  try {
    const res = await teacherApi(`/${encodeURIComponent(userId)}`, { method: "DELETE" });
    await parseResponse(res);
    teacherPage = 1;
    await loadTeachers();
  } catch (err) {
    showTeacherError(err.message || "Öğretmen silinemedi.");
  }
}

function setupTeacherEvents() {
  $("teacher-list-body").addEventListener("click", (event) => {
    const detailBtn = event.target.closest("[data-teacher-detail-id]");
    const editBtn = event.target.closest("[data-teacher-edit-id]");
    const deleteBtn = event.target.closest("[data-teacher-delete-id]");

    if (detailBtn) {
      void openTeacherDetail(detailBtn.dataset.teacherDetailId);
    } else if (editBtn) {
      const teacher = teacherData.find((t) => t.userId === editBtn.dataset.teacherEditId);
      if (teacher) {
        // Düzenleme detay gerektirir (hesap/telefon alanları listede yok).
        void openTeacherDetail(editBtn.dataset.teacherEditId).then(() => {
          $("teacher-detail-modal").classList.add("hidden");
          openTeacherForm("edit", teacherDetailCurrent);
        });
      }
    } else if (deleteBtn) {
      void deleteTeacher(deleteBtn.dataset.teacherDeleteId);
    }
  });

  $("teacher-search").addEventListener("input", () => {
    teacherPage = 1;
    void loadTeachers();
  });
  $("teacher-tenant-filter").addEventListener("change", () => {
    teacherPage = 1;
    void loadTeachers();
  });
  $("teacher-status-filter").addEventListener("change", () => {
    teacherPage = 1;
    void loadTeachers();
  });
  $("teacher-prev-btn").addEventListener("click", () => {
    if (teacherPage > 1) {
      teacherPage -= 1;
      void loadTeachers();
    }
  });
  $("teacher-next-btn").addEventListener("click", () => {
    teacherPage += 1;
    void loadTeachers();
  });

  $("teacher-create-btn").addEventListener("click", () => openTeacherForm("create"));
  $("teacher-form").addEventListener("submit", submitTeacherForm);
  $("teacher-form-close").addEventListener("click", closeTeacherForm);
  $("teacher-form-cancel").addEventListener("click", closeTeacherForm);

  // Kurum seçilince bireysel kurum uyarısı gösterilir.
  $("teacher-form-tenant").addEventListener("change", (event) => {
    const opt = event.target.selectedOptions[0];
    const isIndividual = opt?.dataset?.type === "INDIVIDUAL";
    $("teacher-form-individual-hint").classList.toggle("hidden", !isIndividual);
  });

  $("teacher-detail-close").addEventListener("click", () => {
    $("teacher-detail-modal").classList.add("hidden");
  });
  $("teacher-detail-edit").addEventListener("click", () => {
    if (!teacherDetailCurrent) return;
    $("teacher-detail-modal").classList.add("hidden");
    openTeacherForm("edit", teacherDetailCurrent);
  });
  $("teacher-detail-delete").addEventListener("click", () => {
    if (!teacherDetailCurrent) return;
    $("teacher-detail-modal").classList.add("hidden");
    void deleteTeacher(teacherDetailCurrent.user.id);
  });

  // Detay içi olaylar: şube ekleme, sınıf atama, durum/kaldırma.
  $("teacher-detail-body").addEventListener("click", (event) => {
    const addBranchBtn = event.target.closest("[data-tbranch-add]");
    const addClassBtn = event.target.closest("[data-tclass-add]");
    const branchUpdateBtn = event.target.closest("[data-tbranch-update]");
    const branchRemoveBtn = event.target.closest("[data-tbranch-remove]");
    const classUpdateBtn = event.target.closest("[data-tclass-update]");
    const classRemoveBtn = event.target.closest("[data-tclass-remove]");

    if (addBranchBtn) {
      void addTeacherBranch();
    } else if (addClassBtn) {
      void addTeacherClass();
    } else if (branchUpdateBtn) {
      void updateTeacherBranch(branchUpdateBtn.dataset.tbranchUpdate);
    } else if (branchRemoveBtn) {
      void removeTeacherBranch(branchRemoveBtn.dataset.tbranchRemove);
    } else if (classUpdateBtn) {
      void updateTeacherClass(classUpdateBtn.dataset.tclassUpdate);
    } else if (classRemoveBtn) {
      void removeTeacherClass(classRemoveBtn.dataset.tclassRemove);
    }
  });
  $("teacher-detail-body").addEventListener("change", (event) => {
    if (!teacherDetailCurrent) return;
    if (event.target.id === "teacher-detail-tenant") {
      const tenantId = event.target.value;
      void populateTeacherDetailBranches(tenantId);
      void populateTeacherDetailYears(tenantId);
    } else if (event.target.id === "teacher-class-year") {
      const tenantId = $("teacher-detail-tenant").value;
      void populateTeacherDetailClasses(tenantId, event.target.value);
    }
  });
}

// ---------- Şube / Branch yönetimi ----------

const BRANCH_STATUS_LABELS = {
  ACTIVE: "Aktif",
  INACTIVE: "Pasif",
  CLOSED: "Kapalı",
};

let branchPage = 1;
const BRANCH_PAGE_SIZE = 20;
let branchTotal = 0;
let branchData = [];
let branchFormMode = "create";
let branchEditingId = null;
let branchDetailCurrent = null;

function branchApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (method === "DELETE") {
    delete headers["content-type"];
  }
  return fetch(`/admin/branches${path}`, { ...options, method, headers });
}

function branchOptionsApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  return fetch(`/admin/branch-options${path}`, { ...options, method, headers });
}

function showBranchError(message) {
  const el = $("branch-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideBranchError() {
  $("branch-error").classList.add("hidden");
}

function branchStatusBadge(status) {
  const cls = {
    ACTIVE: "badge badge-success",
    INACTIVE: "badge badge-neutral",
    CLOSED: "badge badge-danger",
  }[status];
  return `<span class="${cls ?? "badge"}">${BRANCH_STATUS_LABELS[status] ?? status}</span>`;
}

async function populateBranchTenantFilter() {
  const select = $("branch-tenant-filter");
  try {
    const res = await fetch("/admin/tenants?page=1&pageSize=100", {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .filter((t) => t.type === "ORGANIZATION")
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
      .join("");
    select.innerHTML = options
      ? `<option value="">Tüm kurumlar</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }
}

async function loadBranches() {
  hideBranchError();
  const tbody = $("branch-list-body");
  tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Yükleniyor…</td></tr>';

  const search = $("branch-search").value.trim();
  const tenantId = $("branch-tenant-filter").value;
  const status = $("branch-status-filter").value;
  const params = new URLSearchParams({
    page: branchPage,
    pageSize: BRANCH_PAGE_SIZE,
  });
  if (search) params.set("search", search);
  if (tenantId) params.set("tenantId", tenantId);
  if (status) params.set("status", status);

  try {
    const res = await branchApi(`?${params.toString()}`);
    const body = await parseResponse(res);
    branchData = body.items;
    branchTotal = body.total;
    renderBranchList();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">—</td></tr>';
    showBranchError(err.message || "Şubeler yüklenemedi.");
  }
}

function renderBranchList() {
  const tbody = $("branch-list-body");

  if (branchData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Şube bulunamadı.</td></tr>';
  } else {
    tbody.innerHTML = branchData
      .map(
        (b) => `
      <tr>
        <td>
          <button type="button" class="link-btn" data-branch-detail-id="${b.id}">
            ${escapeHtml(b.name)}
          </button>
        </td>
        <td><span class="mono">${escapeHtml(b.code)}</span></td>
        <td>${escapeHtml(b.tenantName)}</td>
        <td>${b.managerName ? escapeHtml(b.managerName) : "—"}</td>
        <td class="numeric">${b.classCount ?? 0}</td>
        <td class="numeric">${b.teacherCount ?? 0}</td>
        <td>${branchStatusBadge(b.status)}</td>
        <td class="text-right">
          <button type="button" class="btn btn-ghost btn-sm" data-branch-edit-id="${b.id}">Düzenle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-branch-delete-id="${b.id}">Sil</button>
        </td>
      </tr>`,
      )
      .join("");
  }

  const totalPages = Math.max(1, Math.ceil(branchTotal / BRANCH_PAGE_SIZE));
  $("branch-page-info").textContent = `${branchTotal} şube · sayfa ${branchPage}/${totalPages}`;
  $("branch-prev-btn").disabled = branchPage <= 1;
  $("branch-next-btn").disabled = branchPage >= totalPages;
}

async function populateBranchFormTenantSelect() {
  const select = $("branch-form-tenant");
  select.innerHTML = `<option value="">Kurum seçin…</option>`;
  try {
    const res = await fetch("/admin/tenants?page=1&pageSize=100", {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .filter((t) => t.type === "ORGANIZATION")
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
      .join("");
    select.innerHTML = options
      ? `<option value="">Kurum seçin…</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }
}

async function populateBranchFormManagers(tenantId) {
  const select = $("branch-form-manager");
  if (!tenantId) {
    select.innerHTML = `<option value="">Kurum seçin…</option>`;
    return;
  }
  select.innerHTML = `<option value="">Yükleniyor…</option>`;
  try {
    const res = await branchOptionsApi(`/managers?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await parseResponse(res);
    const options = body
      .map(
        (m) =>
          `<option value="${m.id}">${escapeHtml(m.displayName)}${m.email ? ` (${escapeHtml(m.email)})` : ""}</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Müdür seçin…</option>${options}`
      : `<option value="">Bu kurumda şube müdürü yok</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Müdürler yüklenemedi</option>`;
  }
}

function openBranchForm(mode, branch = null) {
  branchFormMode = mode;
  branchEditingId = branch?.id ?? null;
  $("branch-form-title").textContent = mode === "create" ? "Yeni Şube" : "Şubeyi düzenle";
  $("branch-form-name").value = branch?.name ?? "";
  $("branch-form-code").value = branch?.code ?? "";
  $("branch-form-address").value = branch?.address ?? "";
  $("branch-form-phone").value = branch?.phone ?? "";

  const isCreate = mode === "create";
  $("branch-form-tenant").closest("label.field").classList.toggle("hidden", !isCreate);
  $("branch-form-manager-field").classList.toggle("hidden", !isCreate);

  if (isCreate) {
    $("branch-form-tenant").value = "";
    void populateBranchFormTenantSelect();
    $("branch-form-manager").innerHTML = `<option value="">Kurum seçin…</option>`;
  }

  $("branch-form-error").classList.add("hidden");
  $("branch-form-modal").classList.remove("hidden");
  $("branch-form-name").focus();
}

function closeBranchForm() {
  $("branch-form-modal").classList.add("hidden");
}

function setBranchFormLoading(isLoading) {
  const btn = $("branch-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}

async function submitBranchForm(event) {
  event.preventDefault();
  const errorEl = $("branch-form-error");
  errorEl.classList.add("hidden");

  const isCreate = branchFormMode === "create";
  const payload = {
    name: $("branch-form-name").value.trim(),
    code: $("branch-form-code").value.trim(),
  };
  const address = $("branch-form-address").value.trim();
  const phone = $("branch-form-phone").value.trim();
  if (address) payload.address = address;
  if (phone) payload.phone = phone;

  if (!payload.name) {
    errorEl.textContent = "Şube adı gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!payload.code) {
    errorEl.textContent = "Şube kodu gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (isCreate) {
    const tenantId = $("branch-form-tenant").value;
    if (!tenantId) {
      errorEl.textContent = "Kurum gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    payload.tenantId = tenantId;
    const managerUserId = $("branch-form-manager").value;
    if (managerUserId) payload.managerUserId = managerUserId;
  }

  setBranchFormLoading(true);
  try {
    const res = isCreate
      ? await branchApi("", { method: "POST", body: JSON.stringify(payload) })
      : await branchApi(`/${encodeURIComponent(branchEditingId)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
    await parseResponse(res);
    closeBranchForm();
    branchPage = 1;
    await loadBranches();
  } catch (err) {
    errorEl.textContent = err.message || "Kayıt başarısız.";
    errorEl.classList.remove("hidden");
  } finally {
    setBranchFormLoading(false);
  }
}

async function openBranchDetail(id) {
  const modal = $("branch-detail-modal");
  $("branch-detail-body").innerHTML = '<p class="muted">Yükleniyor…</p>';
  modal.classList.remove("hidden");

  try {
    const res = await branchApi(`/${encodeURIComponent(id)}`);
    const detail = await parseResponse(res);
    branchDetailCurrent = detail;
    renderBranchDetail(detail);
  } catch (err) {
    branchDetailCurrent = null;
    $("branch-detail-body").innerHTML =
      `<p class="error">${escapeHtml(err.message || "Detay yüklenemedi.")}</p>`;
  }
}

function renderBranchDetail(d) {
  $("branch-detail-title").textContent = d.name;

  const infoRows = [
    ["Şube adı", escapeHtml(d.name)],
    ["Şube kodu", `<span class="mono">${escapeHtml(d.code)}</span>`],
    ["Kurum", `${escapeHtml(d.tenantName)} (${tenantTypeLabel(d.tenantType)})`],
    ["Adres", d.address ? escapeHtml(d.address) : "—"],
    ["Telefon", d.phone ? escapeHtml(d.phone) : "—"],
    ["Durum", branchStatusBadge(d.status)],
    ["Oluşturulma", d.createdAt ? new Date(d.createdAt).toLocaleDateString("tr-TR") : "—"],
  ];

  const manager = d.manager;
  const managerInfo = manager
    ? `<div class="info-item"><dt>Şube Müdürü</dt><dd>${escapeHtml(manager.displayName)}${manager.email ? ` (${escapeHtml(manager.email)})` : ""}</dd></div>`
    : '<div class="info-item"><dt>Şube Müdürü</dt><dd>Atanmamış</dd></div>';
  const removeManagerBtn = manager
    ? `<button data-branch-manager-remove type="button" class="btn btn-ghost btn-sm">Müdürü kaldır</button>`
    : "";

  $("branch-detail-body").innerHTML = `
    <section class="detail-section">
      <h4>Şube Bilgileri</h4>
      <dl class="info-grid">${infoRows
        .map(([k, v]) => `<div class="info-item"><dt>${k}</dt><dd>${v}</dd></div>`)
        .join("")}</dl>
    </section>

    <section class="detail-section">
      <h4>İstatistikler</h4>
      <dl class="info-grid">
        <div class="info-item"><dt>Sınıf sayısı</dt><dd>${d.classCount ?? 0}</dd></div>
        <div class="info-item"><dt>Öğretmen sayısı</dt><dd>${d.teacherCount ?? 0}</dd></div>
      </dl>
    </section>

    <section class="detail-section">
      <h4>Şube Müdürü</h4>
      <dl class="info-grid">${managerInfo}</dl>
      <div class="enrollment-add-row">
        <label class="field">
          <span>Müdür</span>
          <select id="branch-detail-manager"><option value="">Yükleniyor…</option></select>
        </label>
        <button data-branch-manager-assign type="button" class="btn btn-primary">Ata</button>
        ${removeManagerBtn}
      </div>
    </section>

    <section class="detail-section">
      <h4>Şube Durumu</h4>
      <div class="enrollment-add-row">
        <label class="field">
          <span>Durum</span>
          <select id="branch-detail-status">
            <option value="ACTIVE" ${d.status === "ACTIVE" ? "selected" : ""}>Aktif</option>
            <option value="INACTIVE" ${d.status === "INACTIVE" ? "selected" : ""}>Pasif</option>
            <option value="CLOSED" ${d.status === "CLOSED" ? "selected" : ""}>Kapalı</option>
          </select>
        </label>
        <button data-branch-status-apply type="button" class="btn btn-ghost">Uygula</button>
      </div>
      <p class="muted field-hint">"Kapalı" durumu şubeyi silmez; geçmişi korunur. Şubeyi tamamen silmek için "Şubeyi Sil" butonunu kullanın.</p>
    </section>`;

  void populateBranchDetailManagers(d.tenantId);
}

async function populateBranchDetailManagers(tenantId) {
  const select = $("branch-detail-manager");
  if (!select) return;
  select.innerHTML = `<option value="">Yükleniyor…</option>`;
  try {
    const res = await branchOptionsApi(`/managers?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await parseResponse(res);
    const current = branchDetailCurrent?.managerUserId;
    const options = body
      .map(
        (m) =>
          `<option value="${m.id}" ${m.id === current ? "selected" : ""}>${escapeHtml(m.displayName)}${m.email ? ` (${escapeHtml(m.email)})` : ""}</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Müdür seçin…</option>${options}`
      : `<option value="">Bu kurumda şube müdürü yok</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Müdürler yüklenemedi</option>`;
  }
}

async function assignBranchManager(branchId) {
  const managerId = $("branch-detail-manager")?.value;
  if (!managerId) {
    showBranchError("Lütfen bir müdür seçin.");
    return;
  }
  try {
    const res = await branchApi(`/${encodeURIComponent(branchId)}/manager`, {
      method: "PATCH",
      body: JSON.stringify({ managerUserId: managerId }),
    });
    await parseResponse(res);
    await openBranchDetail(branchId);
    await loadBranches();
  } catch (err) {
    showBranchError(err.message || "Müdür atanamadı.");
  }
}

async function removeBranchManager(branchId) {
  if (!window.confirm("Şube müdürünü kaldırmak istediğinize emin misiniz?")) return;
  try {
    const res = await branchApi(`/${encodeURIComponent(branchId)}/manager`, {
      method: "PATCH",
      body: JSON.stringify({ managerUserId: null }),
    });
    await parseResponse(res);
    await openBranchDetail(branchId);
    await loadBranches();
  } catch (err) {
    showBranchError(err.message || "Müdür kaldırılamadı.");
  }
}

async function applyBranchStatus(branchId) {
  const status = $("branch-detail-status")?.value;
  if (!status || !branchDetailCurrent) return;
  if (status === branchDetailCurrent.status) return;
  try {
    const res = await branchApi(`/${encodeURIComponent(branchId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await parseResponse(res);
    await openBranchDetail(branchId);
    await loadBranches();
  } catch (err) {
    showBranchError(err.message || "Şube durumu güncellenemedi.");
  }
}

async function deleteBranch(branchId) {
  if (!window.confirm("Bu şubeyi silmek istediğinize emin misiniz?")) return;

  try {
    const res = await branchApi(`/${encodeURIComponent(branchId)}`, { method: "DELETE" });
    await parseResponse(res);
    branchPage = 1;
    await loadBranches();
  } catch (err) {
    showBranchError(err.message || "Şube silinemedi.");
  }
}

// ---------- Sınıf / Class yönetimi ----------

const CLASS_STATUS_LABELS = {
  ACTIVE: "Aktif",
  ARCHIVED: "Arşivlenmiş",
};

let classPage = 1;
const CLASS_PAGE_SIZE = 20;
let classTotal = 0;
let classData = [];
let classFormMode = "create";
let classEditingId = null;
let classDetailCurrent = null;
let classDetailStudents = [];
let classDetailTeachers = [];

function classApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (method === "DELETE") {
    delete headers["content-type"];
  }
  return fetch(`/admin/classes${path}`, { ...options, method, headers });
}

// /admin/enrollments ve /admin/teacher-class-assignments gibi alt uçlar için.
function classSubApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (method === "DELETE") {
    delete headers["content-type"];
  }
  return fetch(`/admin${path}`, { ...options, method, headers });
}

function showClassError(message) {
  const el = $("class-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideClassError() {
  $("class-error").classList.add("hidden");
}

function classStatusBadge(status) {
  const cls = {
    ACTIVE: "badge badge-success",
    ARCHIVED: "badge badge-neutral",
  }[status];
  return `<span class="${cls ?? "badge"}">${CLASS_STATUS_LABELS[status] ?? status}</span>`;
}

async function populateClassTenantFilter() {
  const select = $("class-tenant-filter");
  const yearSelect = $("class-year-filter");
  yearSelect.innerHTML = `<option value="">Tüm akademik yıllar</option>`;
  yearSelect.disabled = true;
  try {
    const res = await fetch("/admin/tenants?page=1&pageSize=100", {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .filter((t) => t.type === "ORGANIZATION")
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
      .join("");
    select.innerHTML = options
      ? `<option value="">Tüm kurumlar</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }
}

async function populateClassYearFilter(tenantId) {
  const select = $("class-year-filter");
  if (!tenantId) {
    select.innerHTML = `<option value="">Tüm akademik yıllar</option>`;
    select.disabled = true;
    return;
  }
  select.innerHTML = `<option value="">Yükleniyor…</option>`;
  try {
    const res = await fetch(
      `/admin/student-options/academic-years?tenantId=${encodeURIComponent(tenantId)}`,
      { headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId) },
    );
    const body = await parseResponse(res);
    const options = body
      .map((y) => `<option value="${y.id}">${escapeHtml(y.name)}</option>`)
      .join("");
    select.innerHTML = options
      ? `<option value="">Tüm akademik yıllar</option>${options}`
      : `<option value="">Akademik yıl bulunamadı</option>`;
    select.disabled = false;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Akademik yıllar yüklenemedi</option>`;
  }
}

async function loadClasses() {
  hideClassError();
  const tbody = $("class-list-body");
  tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Yükleniyor…</td></tr>';

  const search = $("class-search").value.trim();
  const tenantId = $("class-tenant-filter").value;
  const yearId = $("class-year-filter").value;
  const status = $("class-status-filter").value;
  const params = new URLSearchParams({
    page: classPage,
    pageSize: CLASS_PAGE_SIZE,
  });
  if (search) params.set("search", search);
  if (tenantId) params.set("tenantId", tenantId);
  if (yearId) params.set("academicYearId", yearId);
  if (status) params.set("status", status);

  try {
    const res = await classApi(`?${params.toString()}`);
    const body = await parseResponse(res);
    classData = body.items;
    classTotal = body.total;
    renderClassList();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">—</td></tr>';
    showClassError(err.message || "Sınıflar yüklenemedi.");
  }
}

function renderClassList() {
  const tbody = $("class-list-body");

  if (classData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Sınıf bulunamadı.</td></tr>';
  } else {
    tbody.innerHTML = classData
      .map(
        (c) => `
      <tr>
        <td>
          <button type="button" class="link-btn" data-class-detail-id="${c.id}">
            ${escapeHtml(c.name)}
          </button>
        </td>
        <td>${escapeHtml(c.tenantName)}</td>
        <td>${escapeHtml(c.branchName)}</td>
        <td>${escapeHtml(c.academicYearName)}</td>
        <td class="numeric">${c.gradeLevel}. sınıf</td>
        <td>${classStatusBadge(c.status)}</td>
        <td class="text-right">
          <button type="button" class="btn btn-ghost btn-sm" data-class-edit-id="${c.id}">Düzenle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-class-delete-id="${c.id}">Sil</button>
        </td>
      </tr>`,
      )
      .join("");
  }

  const totalPages = Math.max(1, Math.ceil(classTotal / CLASS_PAGE_SIZE));
  $("class-page-info").textContent = `${classTotal} sınıf · sayfa ${classPage}/${totalPages}`;
  $("class-prev-btn").disabled = classPage <= 1;
  $("class-next-btn").disabled = classPage >= totalPages;
}

async function populateClassFormTenantSelect() {
  const select = $("class-form-tenant");
  select.innerHTML = `<option value="">Kurum seçin…</option>`;
  try {
    const res = await fetch("/admin/tenants?page=1&pageSize=100", {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .map(
        (t) =>
          `<option value="${t.id}" data-type="${t.type}">${escapeHtml(t.name)} (${tenantTypeLabel(t.type)})</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Kurum seçin…</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }
}

async function populateClassFormBranches(tenantId) {
  const select = $("class-form-branch");
  if (!tenantId) {
    select.innerHTML = `<option value="">Önce kurum seçin…</option>`;
    select.disabled = true;
    return;
  }
  select.innerHTML = `<option value="">Yükleniyor…</option>`;
  try {
    const params = new URLSearchParams({ tenantId, status: "ACTIVE", page: "1", pageSize: "100" });
    const res = await fetch(`/admin/branches?${params.toString()}`, {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`)
      .join("");
    select.innerHTML = options
      ? `<option value="">Şube seçin…</option>${options}`
      : `<option value="">Aktif şube bulunamadı</option>`;
    select.disabled = false;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Şubeler yüklenemedi</option>`;
  }
}

async function populateClassFormYears(tenantId) {
  const select = $("class-form-year");
  if (!tenantId) {
    select.innerHTML = `<option value="">Önce kurum seçin…</option>`;
    select.disabled = true;
    return;
  }
  select.innerHTML = `<option value="">Yükleniyor…</option>`;
  try {
    const res = await fetch(
      `/admin/student-options/academic-years?tenantId=${encodeURIComponent(tenantId)}`,
      { headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId) },
    );
    const body = await parseResponse(res);
    const options = body
      .map(
        (y) =>
          `<option value="${y.id}">${escapeHtml(y.name)}${y.status === "ACTIVE" ? " (Aktif)" : ""}</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Akademik yıl seçin…</option>${options}`
      : `<option value="">Akademik yıl bulunamadı</option>`;
    select.disabled = false;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Akademik yıllar yüklenemedi</option>`;
  }
}

function openClassForm(mode, cls = null) {
  classFormMode = mode;
  classEditingId = cls?.id ?? null;
  $("class-form-title").textContent = mode === "create" ? "Yeni Sınıf" : "Sınıfı düzenle";
  $("class-form-name").value = cls?.name ?? "";
  $("class-form-grade").value = cls?.gradeLevel ? String(cls.gradeLevel) : "";

  const isCreate = mode === "create";
  $("class-form-tenant-field").classList.toggle("hidden", !isCreate);
  $("class-form-branch-field").classList.toggle("hidden", !isCreate);
  $("class-form-year-field").classList.toggle("hidden", !isCreate);

  if (isCreate) {
    $("class-form-tenant").value = "";
    $("class-form-branch").innerHTML = `<option value="">Önce kurum seçin…</option>`;
    $("class-form-branch").disabled = true;
    $("class-form-year").innerHTML = `<option value="">Önce kurum seçin…</option>`;
    $("class-form-year").disabled = true;
    $("class-form-individual-hint").classList.add("hidden");
    void populateClassFormTenantSelect();
  }

  $("class-form-error").classList.add("hidden");
  $("class-form-modal").classList.remove("hidden");
  $("class-form-name").focus();
}

function closeClassForm() {
  $("class-form-modal").classList.add("hidden");
}

function setClassFormLoading(isLoading) {
  const btn = $("class-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}

async function submitClassForm(event) {
  event.preventDefault();
  const errorEl = $("class-form-error");
  errorEl.classList.add("hidden");

  const isCreate = classFormMode === "create";
  const payload = {
    name: $("class-form-name").value.trim(),
    gradeLevel: Number($("class-form-grade").value),
  };

  if (!payload.name) {
    errorEl.textContent = "Sınıf adı gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!payload.gradeLevel) {
    errorEl.textContent = "Kademe/Sınıf düzeyi gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (isCreate) {
    const tenantId = $("class-form-tenant").value;
    const branchId = $("class-form-branch").value;
    const academicYearId = $("class-form-year").value;
    if (!tenantId) {
      errorEl.textContent = "Kurum gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (!branchId) {
      errorEl.textContent = "Şube gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (!academicYearId) {
      errorEl.textContent = "Akademik yıl gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    payload.tenantId = tenantId;
    payload.branchId = branchId;
    payload.academicYearId = academicYearId;
  }

  setClassFormLoading(true);
  try {
    const res = isCreate
      ? await classApi("", { method: "POST", body: JSON.stringify(payload) })
      : await classApi(`/${encodeURIComponent(classEditingId)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
    await parseResponse(res);
    closeClassForm();
    classPage = 1;
    await loadClasses();
  } catch (err) {
    errorEl.textContent = err.message || "Kayıt başarısız.";
    errorEl.classList.remove("hidden");
  } finally {
    setClassFormLoading(false);
  }
}

async function openClassDetail(id) {
  const modal = $("class-detail-modal");
  $("class-detail-body").innerHTML = '<p class="muted">Yükleniyor…</p>';
  modal.classList.remove("hidden");

  try {
    const res = await classApi(`/${encodeURIComponent(id)}`);
    const detail = await parseResponse(res);
    classDetailCurrent = detail;
    renderClassDetail(detail);
  } catch (err) {
    classDetailCurrent = null;
    $("class-detail-body").innerHTML =
      `<p class="error">${escapeHtml(err.message || "Detay yüklenemedi.")}</p>`;
  }
}

function renderClassDetail(d) {
  $("class-detail-title").textContent = d.name;

  $("class-detail-body").innerHTML = `
    <section class="detail-section">
      <h4>Sınıf Bilgileri</h4>
      <dl class="info-grid">
        <div class="info-item"><dt>Sınıf adı</dt><dd>${escapeHtml(d.name)}</dd></div>
        <div class="info-item"><dt>Kademe/Sınıf</dt><dd>${d.gradeLevel}. sınıf</dd></div>
        <div class="info-item"><dt>Durum</dt><dd>${classStatusBadge(d.status)}</dd></div>
        <div class="info-item"><dt>Öğrenci sayısı</dt><dd>${d.studentCount ?? 0}</dd></div>
        <div class="info-item"><dt>Öğretmen sayısı</dt><dd>${d.teacherCount ?? 0}</dd></div>
        <div class="info-item"><dt>Oluşturulma</dt><dd>${d.createdAt ? new Date(d.createdAt).toLocaleDateString("tr-TR") : "—"}</dd></div>
      </dl>
    </section>

    <section class="detail-section">
      <h4>Kurum / Şube</h4>
      <dl class="info-grid">
        <div class="info-item"><dt>Kurum</dt><dd>${escapeHtml(d.tenantName)} (${tenantTypeLabel(d.tenantType)})</dd></div>
        <div class="info-item"><dt>Şube</dt><dd>${escapeHtml(d.branchName)}</dd></div>
      </dl>
    </section>

    <section class="detail-section">
      <h4>Akademik Yıl</h4>
      <dl class="info-grid">
        <div class="info-item"><dt>Akademik yıl</dt><dd>${escapeHtml(d.academicYearName)}</dd></div>
      </dl>
    </section>

    <section class="detail-section">
      <h4>Sınıf Durumu</h4>
      <div class="enrollment-add-row">
        <label class="field">
          <span>Durum</span>
          <select id="class-detail-status">
            <option value="ACTIVE" ${d.status === "ACTIVE" ? "selected" : ""}>Aktif</option>
            <option value="ARCHIVED" ${d.status === "ARCHIVED" ? "selected" : ""}>Arşivlenmiş</option>
          </select>
        </label>
        <button data-class-status-apply type="button" class="btn btn-ghost">Uygula</button>
      </div>
      <p class="muted field-hint">"Arşivlenmiş" durumu sınıfı silmez; tarihçe korunur. Sınıfı tamamen silmek için "Sınıfı Sil" butonunu kullanın.</p>
    </section>

    <section class="detail-section">
      <h4>Öğrenciler</h4>
      <div class="enrollment-add-row">
        <label class="field">
          <span>Öğrenci</span>
          <select id="class-detail-student"><option value="">Yükleniyor…</option></select>
        </label>
        <button data-class-student-add type="button" class="btn btn-primary">Kayıt ekle</button>
      </div>
      <div class="card table-card">
        <table class="data-table">
          <thead>
            <tr><th>Öğrenci</th><th>E-posta</th><th>Kayıt Durumu</th><th>Başlangıç</th><th>Ayrılma</th><th class="text-right">İşlemler</th></tr>
          </thead>
          <tbody id="class-detail-students"><tr><td colspan="6" class="empty-cell">Yükleniyor…</td></tr></tbody>
        </table>
      </div>
    </section>

    <section class="detail-section">
      <h4>Öğretmenler</h4>
      <div class="enrollment-add-row">
        <label class="field">
          <span>Öğretmen</span>
          <select id="class-detail-teacher"><option value="">Yükleniyor…</option></select>
        </label>
        <label class="field">
          <span>Ders</span>
          <input id="class-detail-subject" type="text" maxlength="120" placeholder="Matematik" />
        </label>
        <button data-class-teacher-add type="button" class="btn btn-primary">Sınıf ata</button>
      </div>
      <div class="card table-card">
        <table class="data-table">
          <thead>
            <tr><th>Öğretmen</th><th>E-posta</th><th>Ders</th><th>Durum</th><th class="text-right">İşlemler</th></tr>
          </thead>
          <tbody id="class-detail-teachers"><tr><td colspan="5" class="empty-cell">Yükleniyor…</td></tr></tbody>
        </table>
      </div>
    </section>`;

  void populateClassDetailStudents();
  void populateClassDetailTeachers();
}

async function populateClassDetailStudents() {
  const tbody = $("class-detail-students");
  if (!tbody || !classDetailCurrent) return;
  tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Yükleniyor…</td></tr>';
  try {
    const res = await classApi(`/${encodeURIComponent(classDetailCurrent.id)}/students`);
    const students = await parseResponse(res);
    classDetailStudents = students;
    tbody.innerHTML = students.length
      ? students
          .map(
            (s) => `
      <tr>
        <td>${escapeHtml(s.displayName)}</td>
        <td>${s.email ? escapeHtml(s.email) : "—"}</td>
        <td>${enrollmentStatusBadge(s.enrollmentStatus)}</td>
        <td>${s.enrolledAt ? new Date(s.enrolledAt).toLocaleDateString("tr-TR") : "—"}</td>
        <td>${s.leftAt ? new Date(s.leftAt).toLocaleDateString("tr-TR") : "—"}</td>
        <td class="text-right">
          <button type="button" class="btn btn-ghost btn-sm" data-class-student-remove="${s.id}">Kaldır</button>
        </td>
      </tr>`,
          )
          .join("")
      : '<tr><td colspan="6" class="empty-cell">Bu sınıfta öğrenci yok.</td></tr>';
  } catch (err) {
    classDetailStudents = [];
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">${escapeHtml(err.message || "Öğrenciler yüklenemedi.")}</td></tr>`;
  }
  void populateClassStudentPicker();
}

async function populateClassStudentPicker() {
  const select = $("class-detail-student");
  if (!select || !classDetailCurrent) return;
  try {
    const params = new URLSearchParams({
      tenantId: classDetailCurrent.tenantId,
      page: "1",
      pageSize: "100",
    });
    const res = await fetch(`/admin/students?${params.toString()}`, {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const activeIds = new Set(
      classDetailStudents.filter((s) => s.enrollmentStatus === "ACTIVE").map((s) => s.studentId),
    );
    const options = body.items
      .filter((s) => !activeIds.has(s.studentId))
      .map(
        (s) =>
          `<option value="${s.id}">${escapeHtml(s.displayName)}${s.email ? ` (${escapeHtml(s.email)})` : ""}</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Öğrenci seçin…</option>${options}`
      : `<option value="">Uygun öğrenci yok</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Öğrenciler yüklenemedi</option>`;
  }
}

async function populateClassDetailTeachers() {
  const tbody = $("class-detail-teachers");
  if (!tbody || !classDetailCurrent) return;
  tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Yükleniyor…</td></tr>';
  try {
    const res = await classApi(`/${encodeURIComponent(classDetailCurrent.id)}/teachers`);
    const teachers = await parseResponse(res);
    classDetailTeachers = teachers;
    tbody.innerHTML = teachers.length
      ? teachers
          .map(
            (t) => `
      <tr>
        <td>${escapeHtml(t.displayName)}</td>
        <td>${t.email ? escapeHtml(t.email) : "—"}</td>
        <td>${t.subject ? escapeHtml(t.subject) : "—"}</td>
        <td>${membershipStatusBadge(t.status)}</td>
        <td class="text-right">
          <select class="enr-status-select" data-class-tstatus="${t.id}">
            ${setSelectedOption(teacherMembershipStatusOptions(), t.status)}
          </select>
          <button type="button" class="btn btn-ghost btn-sm" data-class-tupdate="${t.id}">Uygula</button>
          <button type="button" class="btn btn-ghost btn-sm" data-class-tremove="${t.id}">Kaldır</button>
        </td>
      </tr>`,
          )
          .join("")
      : '<tr><td colspan="5" class="empty-cell">Bu sınıfta öğretmen yok.</td></tr>';
  } catch (err) {
    classDetailTeachers = [];
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">${escapeHtml(err.message || "Öğretmenler yüklenemedi.")}</td></tr>`;
  }
  void populateClassTeacherPicker();
}

async function populateClassTeacherPicker() {
  const select = $("class-detail-teacher");
  if (!select || !classDetailCurrent) return;
  try {
    const params = new URLSearchParams({
      tenantId: classDetailCurrent.tenantId,
      page: "1",
      pageSize: "100",
    });
    const res = await fetch(`/admin/teachers?${params.toString()}`, {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const activeIds = new Set(
      classDetailTeachers.filter((t) => t.status === "ACTIVE").map((t) => t.teacherId),
    );
    const options = body.items
      .filter((t) => !activeIds.has(t.userId))
      .map(
        (t) =>
          `<option value="${t.userId}">${escapeHtml(t.displayName)}${t.email ? ` (${escapeHtml(t.email)})` : ""}</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Öğretmen seçin…</option>${options}`
      : `<option value="">Uygun öğretmen yok</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Öğretmenler yüklenemedi</option>`;
  }
}

async function addClassStudent() {
  const profileId = $("class-detail-student")?.value;
  if (!profileId || !classDetailCurrent) {
    showClassError("Lütfen bir öğrenci seçin.");
    return;
  }
  try {
    const res = await classSubApi(`/students/${encodeURIComponent(profileId)}/enrollments`, {
      method: "POST",
      body: JSON.stringify({ classId: classDetailCurrent.id }),
    });
    await parseResponse(res);
    await openClassDetail(classDetailCurrent.id);
  } catch (err) {
    showClassError(err.message || "Öğrenci kaydı eklenemedi.");
  }
}

async function removeClassStudent(enrollmentId) {
  const student = classDetailStudents.find((s) => s.id === enrollmentId);
  const label = student ? student.displayName : enrollmentId;
  if (
    !window.confirm(
      `"${label}" öğrencisinin bu sınıftaki kaydını kaldırmak istediğinize emin misiniz?`,
    )
  )
    return;
  try {
    const res = await classSubApi(`/enrollments/${encodeURIComponent(enrollmentId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "LEFT" }),
    });
    await parseResponse(res);
    await openClassDetail(classDetailCurrent.id);
  } catch (err) {
    showClassError(err.message || "Öğrenci kaydı kaldırılamadı.");
  }
}

async function addClassTeacher() {
  const teacherId = $("class-detail-teacher")?.value;
  if (!teacherId || !classDetailCurrent) {
    showClassError("Lütfen bir öğretmen seçin.");
    return;
  }
  const subject = $("class-detail-subject").value.trim();
  const payload = { teacherId };
  if (subject) payload.subject = subject;
  try {
    const res = await classApi(`/${encodeURIComponent(classDetailCurrent.id)}/teachers`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await parseResponse(res);
    await openClassDetail(classDetailCurrent.id);
  } catch (err) {
    showClassError(err.message || "Öğretmen atanamadı.");
  }
}

async function updateClassTeacher(assignmentId) {
  const statusSelect = document.querySelector(`[data-class-tstatus="${assignmentId}"]`);
  if (!statusSelect) return;
  try {
    const res = await classSubApi(
      `/teacher-class-assignments/${encodeURIComponent(assignmentId)}`,
      { method: "PATCH", body: JSON.stringify({ status: statusSelect.value }) },
    );
    await parseResponse(res);
    await openClassDetail(classDetailCurrent.id);
  } catch (err) {
    showClassError(err.message || "Sınıf ataması güncellenemedi.");
  }
}

async function removeClassTeacher(assignmentId) {
  const teacher = classDetailTeachers.find((t) => t.id === assignmentId);
  const label = teacher ? teacher.displayName : assignmentId;
  if (!window.confirm(`"${label}" öğretmenini bu sınıftan kaldırmak istediğinize emin misiniz?`))
    return;
  try {
    const res = await classSubApi(
      `/teacher-class-assignments/${encodeURIComponent(assignmentId)}`,
      { method: "DELETE" },
    );
    await parseResponse(res);
    await openClassDetail(classDetailCurrent.id);
  } catch (err) {
    showClassError(err.message || "Öğretmen kaldırılamadı.");
  }
}

async function applyClassStatus(classId) {
  const status = $("class-detail-status")?.value;
  if (!status || !classDetailCurrent) return;
  if (status === classDetailCurrent.status) return;
  try {
    const res = await classApi(`/${encodeURIComponent(classId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await parseResponse(res);
    await openClassDetail(classId);
    await loadClasses();
  } catch (err) {
    showClassError(err.message || "Sınıf durumu güncellenemedi.");
  }
}

async function deleteClass(classId) {
  if (!window.confirm("Bu sınıfı silmek istediğinize emin misiniz?")) return;

  try {
    const res = await classApi(`/${encodeURIComponent(classId)}`, { method: "DELETE" });
    await parseResponse(res);
    classPage = 1;
    await loadClasses();
  } catch (err) {
    showClassError(err.message || "Sınıf silinemedi.");
  }
}

function setupClassEvents() {
  $("class-list-body").addEventListener("click", (event) => {
    const detailBtn = event.target.closest("[data-class-detail-id]");
    const editBtn = event.target.closest("[data-class-edit-id]");
    const deleteBtn = event.target.closest("[data-class-delete-id]");

    if (detailBtn) {
      void openClassDetail(detailBtn.dataset.classDetailId);
    } else if (editBtn) {
      const cls = classData.find((c) => c.id === editBtn.dataset.classEditId);
      if (cls) openClassForm("edit", cls);
    } else if (deleteBtn) {
      void deleteClass(deleteBtn.dataset.classDeleteId);
    }
  });

  $("class-search").addEventListener("input", () => {
    classPage = 1;
    void loadClasses();
  });
  $("class-tenant-filter").addEventListener("change", (event) => {
    classPage = 1;
    void populateClassYearFilter(event.target.value);
    void loadClasses();
  });
  $("class-year-filter").addEventListener("change", () => {
    classPage = 1;
    void loadClasses();
  });
  $("class-status-filter").addEventListener("change", () => {
    classPage = 1;
    void loadClasses();
  });
  $("class-prev-btn").addEventListener("click", () => {
    if (classPage > 1) {
      classPage -= 1;
      void loadClasses();
    }
  });
  $("class-next-btn").addEventListener("click", () => {
    classPage += 1;
    void loadClasses();
  });

  $("class-create-btn").addEventListener("click", () => openClassForm("create"));
  $("class-form").addEventListener("submit", submitClassForm);
  $("class-form-close").addEventListener("click", closeClassForm);
  $("class-form-cancel").addEventListener("click", closeClassForm);

  // Kurum seçilince şube + akademik yıl yüklenir; bireysel kurum uyarısı gösterilir.
  $("class-form-tenant").addEventListener("change", (event) => {
    const tenantId = event.target.value;
    const opt = event.target.selectedOptions[0];
    const isIndividual = opt?.dataset?.type === "INDIVIDUAL";
    $("class-form-individual-hint").classList.toggle("hidden", !isIndividual);
    if (isIndividual) {
      $("class-form-branch").innerHTML = `<option value="">Bireysel kurumda şube yok</option>`;
      $("class-form-branch").disabled = true;
      $("class-form-year").innerHTML =
        `<option value="">Bireysel kurumda akademik yıl yok</option>`;
      $("class-form-year").disabled = true;
    } else {
      void populateClassFormBranches(tenantId);
      void populateClassFormYears(tenantId);
    }
  });

  $("class-detail-close").addEventListener("click", () => {
    $("class-detail-modal").classList.add("hidden");
  });
  $("class-detail-edit").addEventListener("click", () => {
    if (!classDetailCurrent) return;
    $("class-detail-modal").classList.add("hidden");
    openClassForm("edit", classDetailCurrent);
  });
  $("class-detail-delete").addEventListener("click", () => {
    if (!classDetailCurrent) return;
    $("class-detail-modal").classList.add("hidden");
    void deleteClass(classDetailCurrent.id);
  });

  // Detay içi olaylar: öğrenci/öğretmen ekleme-kaldırma, durum uygulama.
  $("class-detail-body").addEventListener("click", (event) => {
    const studentAdd = event.target.closest("[data-class-student-add]");
    const studentRemove = event.target.closest("[data-class-student-remove]");
    const teacherAdd = event.target.closest("[data-class-teacher-add]");
    const teacherUpdate = event.target.closest("[data-class-tupdate]");
    const teacherRemove = event.target.closest("[data-class-tremove]");
    const statusApply = event.target.closest("[data-class-status-apply]");

    if (studentAdd) {
      void addClassStudent();
    } else if (studentRemove) {
      void removeClassStudent(studentRemove.dataset.classStudentRemove);
    } else if (teacherAdd) {
      void addClassTeacher();
    } else if (teacherUpdate) {
      void updateClassTeacher(teacherUpdate.dataset.classTupdate);
    } else if (teacherRemove) {
      void removeClassTeacher(teacherRemove.dataset.classTremove);
    } else if (statusApply) {
      void applyClassStatus(classDetailCurrent?.id);
    }
  });
}

// ---------- İçerik Yönetimi ----------

const CONTENT_TYPE_LABELS = {
  PASSAGE: "Okuma Parçası",
  STORY: "Hikâye",
  POEM: "Şiir",
  ARTICLE: "Makale",
  DIALOGUE: "Diyalog",
};

const CONTENT_STATUS_LABELS = {
  DRAFT: "Taslak",
  PUBLISHED: "Yayında",
  ARCHIVED: "Arşivlenmiş",
};

const VERSION_STATUS_LABELS = {
  DRAFT: "Taslak",
  REVIEW: "İncelemede",
  PUBLISHED: "Yayında",
  ARCHIVED: "Arşivlenmiş",
};

const SKILL_CATEGORY_LABELS = {
  MAIN_IDEA: "Ana Fikir",
  DETAIL: "Ayrıntı",
  INFERENCE: "Çıkarım",
  VOCABULARY: "Kelime Bilgisi",
  FACTUAL: "Gerçek Bilgi",
  COMPREHENSION: "Anlama",
};

const SCOPE_LABELS = {
  GLOBAL: "Global",
  TENANT: "Kurum",
};

let contentPage = 1;
const CONTENT_PAGE_SIZE = 10;
let contentTotal = 0;
let contentData = [];
let contentFormMode = "create";
let contentEditingId = null;
let contentDetailCurrent = null;
let contentDetailVersions = [];
let contentDetailSkills = [];

const QUESTION_TYPE_LABELS = {
  MULTIPLE_CHOICE: "Çoktan Seçmeli",
  TRUE_FALSE: "Doğru / Yanlış",
  OPEN_ENDED: "Açık Uçlu",
  MATCHING: "Eşleştirme",
  FILL_BLANK: "Boşluk Doldurma",
};

const QUESTION_STATUS_LABELS = {
  DRAFT: "Taslak",
  REVIEW: "İncelemede",
  PUBLISHED: "Yayında",
  ARCHIVED: "Arşivlenmiş",
};

let questionPage = 1;
let questionPageSize = 10;
let questionTotal = 0;
let questionData = [];
let currentQuestionId = null;
let currentQuestionType = null;
let currentVersionId = null;
let questionVersionData = [];
let questionFormMode = "createQuestion";
let editingVersionId = null;
let editingQuestionId = null;
let templatePage = 1;
let templatePageSize = 10;
let templateTotal = 0;
let templateData = [];
let currentTemplateId = null;
let templateVersionData = [];
let currentTemplateVersionId = null;
let exerciseSession = null;
let exerciseQuestions = [];
let questionMediaData = [];
let questionVersionMediaData = [];
let currentExerciseQuestionIndex = 0;
let exerciseAttempts = new Map();
let exerciseAwaitingNext = false;
let exerciseBusy = false;
let exerciseLoading = false;
let exerciseGamification = null;
let exerciseGamificationRequest = 0;
let exerciseRequest = null;
let exerciseRequestedSessionId = null;
let exerciseScope = null;

let skillPage = 1;
const SKILL_PAGE_SIZE = 50;
let skillTotal = 0;
let skillData = [];
let skillFormMode = "create";
let skillEditingId = null;

let levelPage = 1;
const LEVEL_PAGE_SIZE = 50;
let levelTotal = 0;
let levelData = [];
let levelFormMode = "create";
let levelEditingId = null;

function contentApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (method === "DELETE") {
    delete headers["content-type"];
  }
  return fetch(`/admin${path}`, { ...options, method, headers });
}

function showContentError(message) {
  const el = $("content-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideContentError() {
  $("content-error").classList.add("hidden");
}

function contentStatusBadge(status) {
  const cls = {
    DRAFT: "badge badge-neutral",
    PUBLISHED: "badge badge-success",
    ARCHIVED: "badge badge-warning",
  }[status];
  return `<span class="${cls ?? "badge"}">${CONTENT_STATUS_LABELS[status] ?? status}</span>`;
}

function versionStatusBadge(status) {
  const cls = {
    DRAFT: "badge badge-neutral",
    REVIEW: "badge badge-info",
    PUBLISHED: "badge badge-success",
    ARCHIVED: "badge badge-warning",
  }[status];
  return `<span class="${cls ?? "badge"}">${VERSION_STATUS_LABELS[status] ?? status}</span>`;
}

function scopeBadge(tenantId) {
  const isGlobal = tenantId == null;
  const cls = isGlobal ? "badge scope-badge-global" : "badge scope-badge-tenant";
  const label = isGlobal ? SCOPE_LABELS.GLOBAL : SCOPE_LABELS.TENANT;
  return `<span class="${cls}">${label}</span>`;
}

function contentTypeLabel(type) {
  return CONTENT_TYPE_LABELS[type] ?? type;
}

function skillCategoryLabel(category) {
  return SKILL_CATEGORY_LABELS[category] ?? category;
}

function difficultyLabel(value) {
  if (value == null) return "—";
  return `%${Math.round(Number(value) * 100)}`;
}

async function populateContentFilters() {
  const tenantSelect = $("content-tenant-filter");
  const skillSelect = $("content-skill-filter");
  const typeSelect = $("content-type-filter");

  try {
    const res = await fetch("/admin/tenants?page=1&pageSize=100", {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
      .join("");
    tenantSelect.innerHTML = options
      ? `<option value="">Tüm kurumlar</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
  } catch (_e) {
    void _e;
    tenantSelect.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }

  try {
    const res = await contentApi("/skills?page=1&pageSize=100");
    const body = await parseResponse(res);
    const options = body.items
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join("");
    skillSelect.innerHTML = options
      ? `<option value="">Tüm beceriler</option>${options}`
      : `<option value="">Beceri bulunamadı</option>`;
  } catch (_e) {
    void _e;
    skillSelect.innerHTML = `<option value="">Beceriler yüklenemedi</option>`;
  }

  const typeOptions = Object.entries(CONTENT_TYPE_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  typeSelect.innerHTML = `<option value="">Tüm türler</option>${typeOptions}`;
}

async function loadContents() {
  hideContentError();
  const tbody = $("content-list-body");
  tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Yükleniyor…</td></tr>';

  const search = $("content-search").value.trim();
  const scope = $("content-scope-filter").value;
  const tenantId = $("content-tenant-filter").value;
  const type = $("content-type-filter").value;
  const status = $("content-status-filter").value;
  const skillId = $("content-skill-filter").value;

  const params = new URLSearchParams({
    page: contentPage,
    pageSize: CONTENT_PAGE_SIZE,
  });
  if (search) params.set("search", search);
  if (scope) params.set("scope", scope);
  if (tenantId && scope !== "GLOBAL") params.set("tenantId", tenantId);
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  if (skillId) params.set("skillId", skillId);

  try {
    const res = await contentApi(`/contents?${params.toString()}`);
    const body = await parseResponse(res);
    contentData = body.items;
    contentTotal = body.total;
    renderContentList();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">—</td></tr>';
    showContentError(err.message || "İçerikler yüklenemedi.");
  }
}

function renderContentList() {
  const tbody = $("content-list-body");

  if (contentData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">İçerik bulunamadı.</td></tr>';
  } else {
    tbody.innerHTML = contentData
      .map(
        (c) => `
      <tr>
        <td>
          <button type="button" class="link-btn" data-content-detail-id="${c.id}">
            ${escapeHtml(c.title)}
          </button>
        </td>
        <td>${scopeBadge(c.tenantId)}</td>
        <td>${escapeHtml(contentTypeLabel(c.type))}</td>
        <td class="numeric">${difficultyLabel(c.difficulty)}</td>
        <td class="numeric">${c.currentVersionNumber ?? "—"}</td>
        <td>${contentStatusBadge(c.status)}</td>
        <td class="text-right">
          <button type="button" class="btn btn-ghost btn-sm" data-content-edit-id="${c.id}">Düzenle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-content-delete-id="${c.id}">Sil</button>
        </td>
      </tr>`,
      )
      .join("");
  }

  const totalPages = Math.max(1, Math.ceil(contentTotal / CONTENT_PAGE_SIZE));
  $("content-page-info").textContent =
    `${contentTotal} içerik · sayfa ${contentPage}/${totalPages}`;
  $("content-prev-btn").disabled = contentPage <= 1;
  $("content-next-btn").disabled = contentPage >= totalPages;
}

// ---------- Soru Bankası ----------
function questionTypeLabel(type) {
  return QUESTION_TYPE_LABELS[type] ?? type;
}
function questionStatusBadge(status) {
  const cls = {
    DRAFT: "badge badge-neutral",
    REVIEW: "badge badge-info",
    PUBLISHED: "badge badge-success",
    ARCHIVED: "badge badge-warning",
  }[status];
  return `<span class="${cls ?? "badge"}">${QUESTION_STATUS_LABELS[status] ?? status}</span>`;
}
function questionApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (options.method === "DELETE") delete headers["content-type"];
  return fetch(`/admin${path}`, { ...options, headers });
}
function showQuestionError(message) {
  const el = $("question-error");
  el.textContent = message;
  el.classList.remove("hidden");
}
function hideQuestionError() {
  $("question-error").classList.add("hidden");
}
async function populateQuestionFilters() {
  const contentSelect = $("question-content-filter");
  const skillSelect = $("question-skill-filter");
  try {
    const res = await contentApi("/contents?page=1&pageSize=100");
    const body = await parseResponse(res);
    const options = body.items
      .map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`)
      .join("");
    contentSelect.innerHTML = options
      ? `<option value="">Tüm içerikler</option>${options}`
      : `<option value="">İçerik bulunamadı</option>`;
  } catch (_e) {
    void _e;
    contentSelect.innerHTML = `<option value="">İçerikler yüklenemedi</option>`;
  }
  try {
    const res = await questionApi("/skills?page=1&pageSize=100");
    const body = await parseResponse(res);
    const options = body.items
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join("");
    skillSelect.innerHTML = options
      ? `<option value="">Tüm beceriler</option>${options}`
      : `<option value="">Beceri bulunamadı</option>`;
  } catch (_e) {
    void _e;
    skillSelect.innerHTML = `<option value="">Beceriler yüklenemedi</option>`;
  }
}
async function loadQuestions() {
  hideQuestionError();
  const tbody = $("question-list-body");
  tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Yükleniyor…</td></tr>';
  const search = $("question-search").value.trim();
  const contentId = $("question-content-filter").value;
  const type = $("question-type-filter").value;
  const skillId = $("question-skill-filter").value;
  const status = $("question-status-filter").value;
  const pageSize = Number($("question-page-size").value) || 10;
  questionPageSize = pageSize;
  const params = new URLSearchParams({ page: String(questionPage), pageSize: String(pageSize) });
  if (search) params.set("search", search);
  if (contentId) params.set("contentId", contentId);
  if (type) params.set("type", type);
  if (skillId) params.set("skillId", skillId);
  if (status) params.set("status", status);
  try {
    const res = await questionApi(`/questions?${params.toString()}`);
    const body = await parseResponse(res);
    questionData = body.items;
    questionTotal = body.total;
    renderQuestionList();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">—</td></tr>';
    showQuestionError(err.message || "Sorular yüklenirken bir hata oluştu.");
  }
}
function renderQuestionList() {
  const tbody = $("question-list-body");
  if (questionData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Henüz soru bulunmuyor.</td></tr>';
  } else {
    tbody.innerHTML = questionData
      .map(
        (q) => `
      <tr>
        <td><button type="button" class="link-btn" data-question-detail-id="${q.id}">${escapeHtml((q.prompt ?? q.id).slice(0, 60))}</button></td>
        <td>${escapeHtml(q.contentTitle ?? q.contentId ?? "—")}</td>
        <td>${escapeHtml(questionTypeLabel(q.type))}</td>
        <td>${escapeHtml(q.skill?.name ?? "—")}</td>
        <td class="numeric">${q.difficulty != null ? difficultyLabel(q.difficulty) : "—"}</td>
        <td class="numeric">${q.versionCount ?? q.versions?.length ?? "—"}</td>
        <td>${questionStatusBadge(q.status)}</td>
        <td class="text-right"><button type="button" class="btn btn-ghost btn-sm" data-question-detail-id="${q.id}">Detay</button></td>
      </tr>`,
      )
      .join("");
  }
  const totalPages = Math.max(1, Math.ceil(questionTotal / questionPageSize));
  $("question-page-info").textContent =
    `Toplam ${questionTotal} soru · Sayfa ${questionPage}/${totalPages}`;
  $("question-prev-btn").disabled = questionPage <= 1;
  $("question-next-btn").disabled = questionPage >= totalPages;
}
async function openQuestionDetail(id) {
  currentQuestionId = id;
  const modal = $("question-detail-modal");
  const body = $("question-detail-body");
  const title = $("question-detail-title");
  body.innerHTML = '<p class="muted">Yükleniyor…</p>';
  title.textContent = "Soru detayı";
  $("question-version-list").innerHTML = "Yükleniyor…";
  $("question-version-error").classList.add("hidden");
  modal.classList.remove("hidden");
  try {
    const res = await questionApi(`/questions/${id}`);
    const data = await parseResponse(res);
    const q = data;
    currentQuestionType = q.type;
    const current = q.currentVersion ?? (q.versions && q.versions[0]) ?? null;
    title.textContent = (q.prompt ?? "Soru detayı").slice(0, 80);
    body.innerHTML = `
      <div class="detail-grid">
        <div class="info-item"><dt>Soru</dt><dd>${escapeHtml(q.prompt ?? current?.prompt ?? "—")}</dd></div>
        <div class="info-item"><dt>Tür</dt><dd>${escapeHtml(questionTypeLabel(q.type))}</dd></div>
        <div class="info-item"><dt>İçerik</dt><dd>${escapeHtml(q.contentTitle ?? q.contentId ?? "—")}</dd></div>
        <div class="info-item"><dt>Beceri</dt><dd>${escapeHtml(q.skill?.name ?? "—")}</dd></div>
        <div class="info-item"><dt>Zorluk</dt><dd>${q.difficulty != null ? escapeHtml(difficultyLabel(q.difficulty)) : "—"}</dd></div>
        <div class="info-item"><dt>Durum</dt><dd>${questionStatusBadge(q.status)}</dd></div>
        <div class="info-item"><dt>Sürüm</dt><dd>${current ? `v${current.version} · ${QUESTION_STATUS_LABELS[current.status] ?? current.status}` : "—"}</dd></div>
        ${current?.prompt ? `<div class="info-item"><dt>Mevcut Sürüm Prompt</dt><dd>${escapeHtml(current.prompt)}</dd></div>` : ""}
        ${q.explanation ? `<div class="info-item"><dt>Açıklama</dt><dd>${escapeHtml(q.explanation)}</dd></div>` : ""}
        ${q.hint ? `<div class="info-item"><dt>İpucu</dt><dd>${escapeHtml(q.hint)}</dd></div>` : ""}
      </div>`;
    void loadQuestionVersions(id);
    if (current) {
      currentVersionId = current.id;
      void loadQuestionMedia(current.id);
    } else {
      currentVersionId = null;
      $("question-media-list").innerHTML = '<p class="muted">Sürüm bulunamadı.</p>';
    }
  } catch (err) {
    body.innerHTML = `<p class="error">${escapeHtml(err.message || "Soru detayı yüklenemedi.")}</p>`;
    $("question-version-list").innerHTML = '<p class="error">Sürümler yüklenemedi.</p>';
  }
}
function closeQuestionDetail() {
  $("question-detail-modal").classList.add("hidden");
}
async function loadQuestionVersions(questionId) {
  const listEl = $("question-version-list");
  const errEl = $("question-version-error");
  errEl.classList.add("hidden");
  listEl.innerHTML = "Yükleniyor…";
  try {
    const res = await questionApi(`/questions/${questionId}/versions`);
    const data = await parseResponse(res);
    questionVersionData = Array.isArray(data) ? data : (data.items ?? data.versions ?? []);
    renderQuestionVersionList();
  } catch (err) {
    listEl.innerHTML = '<p class="error">Sürümler yüklenemedi.</p>';
    errEl.textContent = err.message || "Sürümler yüklenemedi.";
    errEl.classList.remove("hidden");
  }
}
function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("tr-TR");
  } catch (_e) {
    void _e;
    return String(value);
  }
}
function renderQuestionVersionList() {
  const listEl = $("question-version-list");
  if (!questionVersionData || questionVersionData.length === 0) {
    listEl.innerHTML = '<p class="muted">Henüz sürüm bulunmuyor.</p>';
    return;
  }
  listEl.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Sürüm</th><th>Durum</th><th>Oluşturulma</th><th>Yayınlanma</th><th>İşlemler</th></tr></thead>
        <tbody>
          ${questionVersionData
            .map(
              (v) => `
            <tr>
              <td>v${escapeHtml(String(v.version))}</td>
              <td>${versionStatusBadge(v.status)}</td>
              <td>${escapeHtml(formatDateTime(v.createdAt))}</td>
              <td>${escapeHtml(formatDateTime(v.publishedAt))}</td>
              <td>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button type="button" class="btn btn-ghost btn-sm" data-qversion-view="${escapeHtml(v.id)}">Detay</button>
                  ${v.status === "DRAFT" ? `<button type="button" class="btn btn-ghost btn-sm" data-qversion-edit="${escapeHtml(v.id)}">Düzenle</button>` : ""}
                  ${v.status === "DRAFT" ? `<button type="button" class="btn btn-ghost btn-sm" data-qversion-review="${escapeHtml(v.id)}">İncelemeye Al</button>` : ""}
                  ${v.status === "DRAFT" || v.status === "REVIEW" ? `<button type="button" class="btn btn-primary btn-sm" data-qversion-publish="${escapeHtml(v.id)}">Yayınla</button>` : ""}
                </div>
              </td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}
async function openQuestionVersionDetail(versionId) {
  currentVersionId = versionId;
  const modal = $("question-version-detail-modal");
  const body = $("question-version-detail-body");
  const title = $("question-version-detail-title");
  body.innerHTML = '<p class="muted">Yükleniyor…</p>';
  title.textContent = "Sürüm detayı";
  modal.classList.remove("hidden");
  void loadQuestionVersionMedia(versionId);
  try {
    const res = await questionApi(`/questions/versions/${versionId}`);
    const v = await parseResponse(res);
    title.textContent = `v${v.version} · ${VERSION_STATUS_LABELS[v.status] ?? v.status}`;
    const safeJson = (val) => {
      try {
        return escapeHtml(JSON.stringify(val, null, 2));
      } catch (_e) {
        void _e;
        return escapeHtml(String(val));
      }
    };
    body.innerHTML = `
      <div class="detail-grid">
        <div class="info-item"><dt>Sürüm</dt><dd>v${escapeHtml(String(v.version))}</dd></div>
        <div class="info-item"><dt>Durum</dt><dd>${versionStatusBadge(v.status)}</dd></div>
        <div class="info-item"><dt>Oluşturulma</dt><dd>${escapeHtml(formatDateTime(v.createdAt))}</dd></div>
        <div class="info-item"><dt>Yayınlanma</dt><dd>${escapeHtml(formatDateTime(v.publishedAt))}</dd></div>
        <div class="info-item"><dt>Prompt</dt><dd>${escapeHtml(v.prompt ?? "—")}</dd></div>
        <div class="info-item"><dt>Soru Tipi</dt><dd>${escapeHtml(v.questionType ?? currentQuestionType ?? "—")}</dd></div>
        <div class="info-item"><dt>Seçenekler</dt><dd><pre style="white-space:pre-wrap; max-height:180px; overflow:auto;">${safeJson(v.options)}</pre></dd></div>
        <div class="info-item"><dt>Doğru Cevap</dt><dd><pre style="white-space:pre-wrap; max-height:180px; overflow:auto;">${safeJson(v.correctAnswer)}</pre></dd></div>
        <div class="info-item"><dt>Açıklama</dt><dd>${escapeHtml(v.explanation ?? "—")}</dd></div>
        <div class="info-item"><dt>İpucu</dt><dd>${escapeHtml(v.hint ?? "—")}</dd></div>
        <div class="info-item"><dt>Zorluk</dt><dd>${v.difficulty != null ? escapeHtml(String(v.difficulty)) : "—"}</dd></div>
        <div class="info-item"><dt>Kısmi Puan</dt><dd>${v.partialCreditEnabled ? "Evet" : "Hayır"}</dd></div>
        <div class="info-item"><dt>Oluşturan</dt><dd>${escapeHtml(v.createdByName ?? "—")}</dd></div>
        ${v.generationMetadata ? `<div class="info-item"><dt>Üretim Metadatası</dt><dd><pre style="white-space:pre-wrap; max-height:120px; overflow:auto;">${safeJson(v.generationMetadata)}</pre></dd></div>` : ""}
      </div>`;
  } catch (err) {
    body.innerHTML = `<p class="error">${escapeHtml(err.message || "Sürüm detayı yüklenemedi.")}</p>`;
  }
}
function closeQuestionVersionDetail() {
  $("question-version-detail-modal").classList.add("hidden");
}
async function handleQuestionVersionReview(versionId) {
  const errEl = $("question-version-error");
  errEl.classList.add("hidden");
  try {
    const res = await questionApi(`/questions/versions/${versionId}/review`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await parseResponse(res);
    if (currentQuestionId) {
      void loadQuestionVersions(currentQuestionId);
      void loadQuestions();
    }
    showQuestionError("Sürüm incelemeye alındı.");
    setTimeout(hideQuestionError, 3000);
  } catch (err) {
    errEl.textContent = err.message || "İncelemeye alma başarısız.";
    errEl.classList.remove("hidden");
    showQuestionError(err.message || "İncelemeye alma başarısız.");
  }
}
async function handleQuestionVersionPublish(versionId) {
  const errEl = $("question-version-error");
  errEl.classList.add("hidden");
  try {
    const res = await questionApi(`/questions/versions/${versionId}/publish`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await parseResponse(res);
    if (currentQuestionId) {
      void loadQuestionVersions(currentQuestionId);
      void loadQuestions();
    }
    showQuestionError("Sürüm yayınlandı.");
    setTimeout(hideQuestionError, 3000);
  } catch (err) {
    errEl.textContent = err.message || "Yayınlama başarısız.";
    errEl.classList.remove("hidden");
    showQuestionError(err.message || "Yayınlama başarısız.");
  }
}
async function handleQuestionNewVersion() {
  if (!currentQuestionId) return;
  const errEl = $("question-version-error");
  errEl.classList.add("hidden");
  try {
    const res = await questionApi(`/questions/${currentQuestionId}/versions`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await parseResponse(res);
    void loadQuestionVersions(currentQuestionId);
    void loadQuestions();
    showQuestionError("Yeni sürüm oluşturuldu.");
    setTimeout(hideQuestionError, 3000);
  } catch (err) {
    errEl.textContent = err.message || "Yeni sürüm oluşturulamadı.";
    errEl.classList.remove("hidden");
  }
}
async function handleQuestionVersionEdit(versionId) {
  try {
    const res = await questionApi(`/questions/versions/${versionId}`);
    const v = await parseResponse(res);
    if (v.status !== "DRAFT") {
      const errEl = $("question-version-error");
      errEl.textContent = "Yalnızca taslak sürüm düzenlenebilir.";
      errEl.classList.remove("hidden");
      return;
    }
    questionFormMode = "editVersion";
    editingVersionId = versionId;
    editingQuestionId = v.questionId ?? currentQuestionId;
    await populateQuestionFormForVersion(v);
    $("question-form-modal").classList.remove("hidden");
  } catch (err) {
    const errEl = $("question-version-error");
    errEl.textContent = err.message || "Sürüm yüklenemedi.";
    errEl.classList.remove("hidden");
  }
}
async function populateQuestionFormForVersion(v) {
  resetQuestionForm();
  await populateQuestionFormSelects();
  const type = currentQuestionType ?? v.questionType ?? $("question-form-type").value;
  $("question-form-type").value = type;
  $("question-form-type").disabled = true;
  $("question-form-content").closest(".field").classList.add("hidden");
  $("question-form-skill").closest(".field").classList.add("hidden");
  $("question-form-position").closest(".field").classList.add("hidden");
  $("question-form-title").textContent = `Sürüm Düzenle v${v.version}`;
  $("question-form-prompt").value = v.prompt ?? "";
  $("question-form-explanation").value = v.explanation ?? "";
  $("question-form-hint").value = v.hint ?? "";
  $("question-form-difficulty").value = v.difficulty != null ? String(v.difficulty) : "";
  const correctAnswer = v.correctAnswer;
  const options = v.options ?? [];
  $("question-form-mc-options").innerHTML = "";
  $("question-form-matching-options").innerHTML = "";
  $("question-form-matching-pairs").innerHTML = "";
  $("question-form-blank-list").innerHTML = "";
  $("question-form-oe-rubric-list").innerHTML = "";
  if (type === "MULTIPLE_CHOICE") {
    const allowMultiple = correctAnswer?.allowMultiple ?? false;
    const partialCredit = correctAnswer?.partialCredit ?? true;
    $("question-form-mc-allow-multiple").checked = allowMultiple;
    $("question-form-mc-partial").checked = partialCredit;
    for (const opt of options) {
      const isCorrect =
        Array.isArray(correctAnswer?.correctOptionIds) &&
        correctAnswer.correctOptionIds.includes(opt.id);
      addMcOption(opt.id, opt.text, isCorrect);
    }
    if (options.length === 0) {
      addMcOption("", "", false);
      addMcOption("", "", false);
    }
  } else if (type === "TRUE_FALSE") {
    const ans = correctAnswer?.answer;
    $("question-form-tf-answer").value = ans === false ? "false" : "true";
  } else if (type === "OPEN_ENDED") {
    $("question-form-oe-expected").value = correctAnswer?.expectedAnswer ?? "";
    $("question-form-oe-variants").value = (correctAnswer?.acceptableVariants ?? []).join(", ");
    $("question-form-oe-case").checked = !!correctAnswer?.caseSensitive;
    const rubric = correctAnswer?.rubric ?? [];
    for (const r of rubric) addOeRubric(r.criteria, r.points);
    if (rubric.length === 0) addOeRubric("", 1);
  } else if (type === "MATCHING") {
    for (const opt of options) addMatchingOption(opt.id, opt.text, opt.matchGroup ?? "left");
    const pairs = correctAnswer?.pairs ?? [];
    $("question-form-matching-pairs").innerHTML = "";
    $("question-form-matching-partial").checked = correctAnswer?.partialCredit ?? true;
    for (const p of pairs) addMatchingPair(p.leftId, p.rightId);
    if (pairs.length === 0) addMatchingPair("", "");
  } else if (type === "FILL_BLANK") {
    const blanks = correctAnswer?.blanks ?? [];
    $("question-form-blank-partial").checked = correctAnswer?.partialCredit ?? true;
    for (const b of blanks) addBlankField(b.blankId, (b.acceptedAnswers ?? []).join(", "));
    const rows = document.querySelectorAll("#question-form-blank-list .blank-row");
    blanks.forEach((b, idx) => {
      const row = rows[idx];
      if (!row) return;
      const caseEl = row.querySelector("[data-blank-case]");
      const regexEl = row.querySelector("[data-blank-regex]");
      if (caseEl) caseEl.checked = !!b.caseSensitive;
      if (regexEl) regexEl.value = b.regex ?? "";
    });
    if (blanks.length === 0) addBlankField("", "");
  }
  updateQuestionFormTypeVisibility();
  $("question-form-content").focus();
}
function setupQuestionEvents() {
  $("question-search").addEventListener("input", () => {
    questionPage = 1;
    void loadQuestions();
  });
  $("question-content-filter").addEventListener("change", () => {
    questionPage = 1;
    void loadQuestions();
  });
  $("question-type-filter").addEventListener("change", () => {
    questionPage = 1;
    void loadQuestions();
  });
  $("question-skill-filter").addEventListener("change", () => {
    questionPage = 1;
    void loadQuestions();
  });
  $("question-status-filter").addEventListener("change", () => {
    questionPage = 1;
    void loadQuestions();
  });
  $("question-page-size").addEventListener("change", () => {
    questionPage = 1;
    void loadQuestions();
  });
  $("question-prev-btn").addEventListener("click", () => {
    if (questionPage > 1) {
      questionPage--;
      void loadQuestions();
    }
  });
  $("question-next-btn").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(questionTotal / questionPageSize));
    if (questionPage < totalPages) {
      questionPage++;
      void loadQuestions();
    }
  });
  $("question-list-body").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-question-detail-id]");
    if (btn) void openQuestionDetail(btn.dataset.questionDetailId);
  });
  $("question-detail-close").addEventListener("click", closeQuestionDetail);
  $("question-detail-close-action").addEventListener("click", closeQuestionDetail);
  $("question-create-btn").addEventListener("click", openQuestionForm);
  $("question-form-close").addEventListener("click", closeQuestionForm);
  $("question-form-cancel").addEventListener("click", closeQuestionForm);
  const form = $("question-form");
  if (form) {
    form.addEventListener("submit", submitQuestionForm);
  }
  $("question-form-type").addEventListener("change", updateQuestionFormTypeVisibility);
  $("question-form-mc-add").addEventListener("click", () => addMcOption());
  $("question-form-matching-add").addEventListener("click", () => addMatchingOption());
  $("question-form-matching-pair-add").addEventListener("click", () => addMatchingPair());
  $("question-form-blank-add").addEventListener("click", () => addBlankField());
  $("question-form-oe-rubric-add").addEventListener("click", () => addOeRubric());
  $("question-form-mc-options").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mc-remove]");
    if (btn) btn.closest(".mc-option-row").remove();
  });
  $("question-form-matching-options").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-matching-opt-remove]");
    if (btn) btn.closest(".matching-opt-row").remove();
  });
  $("question-form-matching-pairs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pair-remove]");
    if (btn) btn.closest(".pair-row").remove();
  });
  $("question-form-blank-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-blank-remove]");
    if (btn) btn.closest(".blank-row").remove();
  });
  $("question-form-oe-rubric-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rubric-remove]");
    if (btn) btn.closest(".rubric-row").remove();
  });
  $("question-new-version-btn").addEventListener("click", handleQuestionNewVersion);
  $("question-version-list").addEventListener("click", (e) => {
    const viewBtn = e.target.closest("[data-qversion-view]");
    if (viewBtn) void openQuestionVersionDetail(viewBtn.dataset.qversionView);
    const editBtn = e.target.closest("[data-qversion-edit]");
    if (editBtn) void handleQuestionVersionEdit(editBtn.dataset.qversionEdit);
    const reviewBtn = e.target.closest("[data-qversion-review]");
    if (reviewBtn) void handleQuestionVersionReview(reviewBtn.dataset.qversionReview);
    const publishBtn = e.target.closest("[data-qversion-publish]");
    if (publishBtn) void handleQuestionVersionPublish(publishBtn.dataset.qversionPublish);
  });
  $("question-version-detail-close").addEventListener("click", closeQuestionVersionDetail);
  $("question-version-detail-close-action").addEventListener("click", closeQuestionVersionDetail);
  // Question Media events
  const qmAddBtn = $("question-media-add-btn");
  if (qmAddBtn) qmAddBtn.addEventListener("click", handleQuestionMediaAttach);
  const qmList = $("question-media-list");
  if (qmList) {
    qmList.addEventListener("click", (e) => {
      const viewBtn = e.target.closest("[data-qmedia-view]");
      if (viewBtn) void openQuestionMediaDetail(viewBtn.dataset.qmediaView);
      const detachBtn = e.target.closest("[data-qmedia-detach]");
      if (detachBtn) void handleQuestionMediaDetach(detachBtn.dataset.qmediaDetach);
    });
  }
  const qvmDetailClose = $("question-version-media-detail-close");
  if (qvmDetailClose) qvmDetailClose.addEventListener("click", closeQuestionVersionMediaDetail);
  const qvmDetailCloseAction = $("question-version-media-detail-close-action");
  if (qvmDetailCloseAction)
    qvmDetailCloseAction.addEventListener("click", closeQuestionVersionMediaDetail);
  const qmDetailClose = $("question-media-detail-close");
  if (qmDetailClose) qmDetailClose.addEventListener("click", closeQuestionMediaDetail);
  const qmDetailCloseAction = $("question-media-detail-close-action");
  if (qmDetailCloseAction) qmDetailCloseAction.addEventListener("click", closeQuestionMediaDetail);
}
// ========== Question Media ==========
const MEDIA_ROLE_LABELS = {
  MAIN: "Ana Görsel",
  OPTION: "Seçenek Medyası",
  EXPLANATION: "Açıklama",
  HINT: "İpucu",
};
function mediaRoleLabel(role) {
  return MEDIA_ROLE_LABELS[role] ?? role;
}
async function loadQuestionMedia(versionId) {
  const listEl = $("question-media-list");
  const errEl = $("question-media-error");
  errEl.classList.add("hidden");
  listEl.innerHTML = "Yükleniyor…";
  if (!versionId) {
    listEl.innerHTML = '<p class="muted">Sürüm seçilmedi.</p>';
    return;
  }
  try {
    const res = await questionApi(`/questions/versions/${versionId}/media`);
    const data = await parseResponse(res);
    questionMediaData = Array.isArray(data) ? data : (data.items ?? data.media ?? []);
    renderQuestionMediaList();
  } catch (err) {
    listEl.innerHTML = '<p class="error">Medya yüklenemedi.</p>';
    errEl.textContent = err.message || "Medya yüklenemedi.";
    errEl.classList.remove("hidden");
  }
}
function renderQuestionMediaList() {
  const listEl = $("question-media-list");
  if (!questionMediaData || questionMediaData.length === 0) {
    listEl.innerHTML = '<p class="muted">Henüz medya bulunmuyor.</p>';
    return;
  }
  listEl.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Tip</th><th>Rol</th><th>Pozisyon</th><th>Yüklenme</th><th>İşlemler</th></tr></thead>
        <tbody>
          ${questionMediaData
            .map(
              (m) => `
            <tr>
              <td>${escapeHtml(m.type)}</td>
              <td>${mediaRoleLabel(m.role)}</td>
              <td>${m.position}</td>
              <td>${escapeHtml(formatDateTime(m.createdAt))}</td>
              <td>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button type="button" class="btn btn-ghost btn-sm" data-qmedia-view="${escapeHtml(m.id)}">Detay</button>
                  <button type="button" class="btn btn-ghost btn-sm" data-qmedia-detach="${escapeHtml(m.id)}">Kaldır</button>
                </div>
              </td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}
async function loadQuestionVersionMedia(versionId) {
  const listEl = $("question-version-media-list");
  const errEl = $("question-version-media-error");
  if (errEl) errEl.classList.add("hidden");
  if (listEl) listEl.innerHTML = "Yükleniyor…";
  if (!versionId) {
    if (listEl) listEl.innerHTML = '<p class="muted">Sürüm seçilmedi.</p>';
    return;
  }
  try {
    const res = await questionApi(`/questions/versions/${versionId}/media`);
    const data = await parseResponse(res);
    questionVersionMediaData = Array.isArray(data) ? data : (data.items ?? data.media ?? []);
    renderQuestionVersionMediaList();
  } catch (err) {
    if (listEl) listEl.innerHTML = '<p class="error">Medya yüklenemedi.</p>';
    if (errEl) {
      errEl.textContent = err.message || "Medya yüklenemedi.";
      errEl.classList.remove("hidden");
    }
  }
}
function renderQuestionVersionMediaList() {
  const listEl = $("question-version-media-list");
  if (!listEl) return;
  if (!questionVersionMediaData || questionVersionMediaData.length === 0) {
    listEl.innerHTML = '<p class="muted">Henüz medya bulunmuyor.</p>';
    return;
  }
  listEl.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Tip</th><th>Rol</th><th>Pozisyon</th><th>İşlemler</th></tr></thead>
        <tbody>
          ${questionVersionMediaData
            .map(
              (m) => `
            <tr>
              <td>${escapeHtml(m.type ?? m.media?.type ?? "—")}</td>
              <td>${qvMediaRoleLabel(m.role)}</td>
              <td>${m.position}</td>
              <td>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button type="button" class="btn btn-ghost btn-sm" data-qvmedia-view="${escapeHtml(m.mediaId)}">Detay</button>
                  <button type="button" class="btn btn-ghost btn-sm" data-qvmedia-detach="${escapeHtml(m.mediaId)}">Kaldır</button>
                </div>
              </td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}
async function openQuestionMediaDetail(mediaId) {
  const modal = $("question-media-detail-modal");
  const body = $("question-media-detail-body");
  const title = $("question-media-detail-title");
  if (!body) return;
  body.innerHTML = '<p class="muted">Yükleniyor…</p>';
  title.textContent = "Medya detayı";
  modal.classList.remove("hidden");
  try {
    const res = await questionApi(`/media/${mediaId}`);
    const m = await parseResponse(res);
    title.textContent = `${m.type} · ${mediaRoleLabel(m.role)}`;
    body.innerHTML = `
      <div class="detail-grid">
        <div class="info-item"><dt>Tip</dt><dd>${escapeHtml(m.type)}</dd></div>
        <div class="info-item"><dt>Rol</dt><dd>${mediaRoleLabel(m.role)}</dd></div>
        <div class="info-item"><dt>Pozisyon</dt><dd>${m.position}</dd></div>
        <div class="info-item"><dt>URL</dt><dd>${escapeHtml(m.url)}</dd></div>
        <div class="info-item"><dt>MIME</dt><dd>${escapeHtml(m.mimeType)}</dd></div>
        <div class="info-item"><dt>Boyut</dt><dd>${m.width ?? "—"} × ${m.height ?? "—"}</dd></div>
        <div class="info-item"><dt>Süre</dt><dd>${m.durationMs ? m.durationMs + " ms" : "—"}</dd></div>
        <div class="info-item"><dt>Alt Metin</dt><dd>${escapeHtml(m.altText ?? "—")}</dd></div>
        <div class="info-item"><dt>Altyazı</dt><dd>${escapeHtml(m.caption ?? "—")}</dd></div>
        <div class="info-item"><dt>Boyut</dt><dd>${m.sizeBytes ?? "—"} byte</dd></div>
        <div class="info-item"><dt>Hash</dt><dd>${escapeHtml(m.hash)}</dd></div>
        <div class="info-item"><dt>Oluşturulma</dt><dd>${escapeHtml(formatDateTime(m.createdAt))}</dd></div>
        <div class="info-item"><dt>Oluşturan</dt><dd>${escapeHtml(m.createdByName ?? "—")}</dd></div>
      </div>`;
  } catch (err) {
    body.innerHTML = `<p class="error">${escapeHtml(err.message || "Medya detayı yüklenemedi.")}</p>`;
  }
}
async function handleQuestionMediaAttach() {
  if (!currentVersionId) return;
  const sel = $("question-media-select");
  const posEl = $("question-media-position");
  const errEl = $("question-media-error");
  errEl.classList.add("hidden");
  const mediaId = sel?.value?.trim();
  const position = Number(posEl?.value) || 0;
  if (!mediaId) {
    errEl.textContent = "Medya seçin.";
    errEl.classList.remove("hidden");
    return;
  }
  try {
    const res = await questionApi(`/questions/versions/${currentVersionId}/media`, {
      method: "POST",
      body: JSON.stringify({ mediaId, position }),
    });
    await parseResponse(res);
    showQuestionError("Medya bağlandı.");
    setTimeout(hideQuestionError, 3000);
    void loadQuestionMedia(currentVersionId);
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || "Medya bağlanamadı.";
      errEl.classList.remove("hidden");
    }
  }
}
async function handleQuestionMediaDetach(mediaId) {
  if (!currentVersionId) return;
  const errEl = $("question-media-error");
  errEl.classList.add("hidden");
  try {
    const res = await questionApi(`/questions/versions/${currentVersionId}/media/${mediaId}`, {
      method: "DELETE",
    });
    await parseResponse(res);
    showQuestionError("Medya kaldırıldı.");
    setTimeout(hideQuestionError, 3000);
    void loadQuestionMedia(currentVersionId);
  } catch (err) {
    errEl.textContent = err.message || "Medya kaldırılamadı.";
    errEl.classList.remove("hidden");
  }
}
async function handleVersionMediaAttach() {
  if (!currentVersionId) return;
  const sel = $("question-version-media-select");
  const posEl = $("question-version-media-position");
  const errEl = $("question-version-media-error");
  if (errEl) errEl.classList.add("hidden");
  const mediaId = sel?.value?.trim();
  const position = Number(posEl?.value) || 0;
  if (!mediaId) {
    if (errEl) {
      errEl.textContent = "Medya seçin.";
      errEl.classList.remove("hidden");
    }
    return;
  }
  try {
    const res = await questionApi(`/questions/versions/${currentVersionId}/media`, {
      method: "POST",
      body: JSON.stringify({ mediaId, position }),
    });
    await parseResponse(res);
    void loadQuestionVersionMedia(currentVersionId);
    void loadQuestionMedia(currentVersionId);
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || "Medya bağlanamadı.";
      errEl.classList.remove("hidden");
    }
  }
}
async function handleVersionMediaDetach(mediaId) {
  if (!currentVersionId) return;
  const errEl = $("question-version-media-error");
  if (errEl) errEl.classList.add("hidden");
  try {
    const res = await questionApi(`/questions/versions/${currentVersionId}/media/${mediaId}`, {
      method: "DELETE",
    });
    await parseResponse(res);
    void loadQuestionVersionMedia(currentVersionId);
    void loadQuestionMedia(currentVersionId);
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || "Medya kaldırılamadı.";
      errEl.classList.remove("hidden");
    }
  }
}
async function populateQuestionFormSelects() {
  const contentSel = $("question-form-content");
  const skillSel = $("question-form-skill");
  try {
    const res = await contentApi("/contents?page=1&pageSize=100");
    const body = await parseResponse(res);
    contentSel.innerHTML =
      '<option value="">İçerik seçin…</option>' +
      body.items.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join("");
  } catch (_e) {
    void _e;
    contentSel.innerHTML = '<option value="">İçerikler yüklenemedi</option>';
  }
  try {
    const res = await questionApi("/skills?page=1&pageSize=100");
    const body = await parseResponse(res);
    skillSel.innerHTML =
      '<option value="">Beceri seçin…</option>' +
      body.items.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  } catch (_e) {
    void _e;
    skillSel.innerHTML = '<option value="">Beceriler yüklenemedi</option>';
  }
}
function openQuestionForm() {
  questionFormMode = "createQuestion";
  editingVersionId = null;
  editingQuestionId = null;
  resetQuestionForm();
  $("question-form-title").textContent = "Yeni Soru";
  $("question-form-submit").querySelector(".btn-label").textContent = "Oluştur";
  $("question-form-content").closest(".field").classList.remove("hidden");
  $("question-form-skill").closest(".field").classList.remove("hidden");
  $("question-form-position").closest(".field").classList.remove("hidden");
  $("question-form-type").disabled = false;
  void populateQuestionFormSelects();
  $("question-form-modal").classList.remove("hidden");
  $("question-form-content").focus();
}
function closeQuestionForm() {
  $("question-form-modal").classList.add("hidden");
  questionFormMode = "createQuestion";
  editingVersionId = null;
  editingQuestionId = null;
  $("question-form-content").closest(".field").classList.remove("hidden");
  $("question-form-skill").closest(".field").classList.remove("hidden");
  $("question-form-position").closest(".field").classList.remove("hidden");
  $("question-form-type").disabled = false;
  $("question-form-title").textContent = "Yeni Soru";
  $("question-form-submit").querySelector(".btn-label").textContent = "Oluştur";
}
function resetQuestionForm() {
  $("question-form").reset();
  $("question-form-error").classList.add("hidden");
  $("question-form-error").textContent = "";
  $("question-form-mc-options").innerHTML = "";
  $("question-form-matching-options").innerHTML = "";
  $("question-form-matching-pairs").innerHTML = "";
  $("question-form-blank-list").innerHTML = "";
  $("question-form-oe-rubric-list").innerHTML = "";
  $("question-form-difficulty").value = "";
  $("question-form-position").value = "0";
  $("question-form-mc-allow-multiple").checked = false;
  $("question-form-mc-partial").checked = true;
  $("question-form-matching-partial").checked = true;
  $("question-form-blank-partial").checked = true;
  $("question-form-content").closest(".field").classList.remove("hidden");
  $("question-form-skill").closest(".field").classList.remove("hidden");
  $("question-form-position").closest(".field").classList.remove("hidden");
  $("question-form-type").disabled = false;
  updateQuestionFormTypeVisibility();
  // varsayılan 2 seçenek ekle
  addMcOption("a", "Seçenek A", true);
  addMcOption("b", "Seçenek B", false);
  addMatchingOption("l1", "Sol 1", "left");
  addMatchingOption("r1", "Sağ 1", "right");
  addMatchingPair("l1", "r1");
  addBlankField("blank1", "cevap1, cevap2");
  addOeRubric("doğruluk", 1);
}
function updateQuestionFormTypeVisibility() {
  const type = $("question-form-type").value;
  $("question-form-mc-field").classList.toggle("hidden", type !== "MULTIPLE_CHOICE");
  $("question-form-tf-field").classList.toggle("hidden", type !== "TRUE_FALSE");
  $("question-form-oe-field").classList.toggle("hidden", type !== "OPEN_ENDED");
  $("question-form-matching-field").classList.toggle("hidden", type !== "MATCHING");
  $("question-form-blank-field").classList.toggle("hidden", type !== "FILL_BLANK");
}
function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
function addMcOption(id = "", text = "", checked = false) {
  const rowId = uid("opt");
  const div = document.createElement("div");
  div.className = "mc-option-row form-grid";
  div.innerHTML = `<label class="field"><span>ID</span><input type="text" value="${escapeHtml(id || rowId)}" data-mc-id required></label><label class="field"><span>Metin</span><input type="text" value="${escapeHtml(text)}" data-mc-text required></label><label class="field"><span><input type="checkbox" data-mc-correct ${checked ? "checked" : ""}> Doğru</span></label><button type="button" class="btn btn-ghost btn-sm" data-mc-remove>Sil</button>`;
  $("question-form-mc-options").appendChild(div);
}
function addMatchingOption(id = "", text = "", group = "left") {
  const div = document.createElement("div");
  div.className = "matching-opt-row form-grid";
  div.innerHTML = `<label class="field"><span>ID</span><input type="text" value="${escapeHtml(id || uid("mopt"))}" data-mopt-id required></label><label class="field"><span>Metin</span><input type="text" value="${escapeHtml(text)}" data-mopt-text required></label><label class="field"><span>Grup</span><select data-mopt-group><option value="left" ${group === "left" ? "selected" : ""}>Sol</option><option value="right" ${group === "right" ? "selected" : ""}>Sağ</option></select></label><button type="button" class="btn btn-ghost btn-sm" data-matching-opt-remove>Sil</button>`;
  $("question-form-matching-options").appendChild(div);
}
function addMatchingPair(leftId = "", rightId = "") {
  const div = document.createElement("div");
  div.className = "pair-row form-grid";
  div.innerHTML = `<label class="field"><span>Sol ID</span><input type="text" value="${escapeHtml(leftId)}" data-pair-left placeholder="leftId" required></label><label class="field"><span>Sağ ID</span><input type="text" value="${escapeHtml(rightId)}" data-pair-right placeholder="rightId" required></label><button type="button" class="btn btn-ghost btn-sm" data-pair-remove>Sil</button>`;
  $("question-form-matching-pairs").appendChild(div);
}
function addBlankField(blankId = "", accepted = "") {
  const div = document.createElement("div");
  div.className = "blank-row fieldset-group";
  div.innerHTML = `<label class="field"><span>Blank ID</span><input type="text" value="${escapeHtml(blankId || uid("blank"))}" data-blank-id required></label><label class="field"><span>Kabul edilen cevaplar (virgülle)</span><input type="text" value="${escapeHtml(accepted)}" data-blank-accepted required></label><label class="field"><span>Regex</span><input type="text" data-blank-regex placeholder="^\\d+$"></label><label class="field"><span><input type="checkbox" data-blank-case> Büyük/küçük duyarlı</span></label><button type="button" class="btn btn-ghost btn-sm" data-blank-remove>Sil</button>`;
  $("question-form-blank-list").appendChild(div);
}
function addOeRubric(criteria = "", points = 1) {
  const div = document.createElement("div");
  div.className = "rubric-row form-grid";
  div.innerHTML = `<label class="field"><span>Kriter</span><input type="text" value="${escapeHtml(criteria)}" data-rubric-criteria required></label><label class="field"><span>Puan (0–1)</span><input type="number" min="0" max="1" step="0.1" value="${points}" data-rubric-points required></label><button type="button" class="btn btn-ghost btn-sm" data-rubric-remove>Sil</button>`;
  $("question-form-oe-rubric-list").appendChild(div);
}
function setQuestionFormLoading(isLoading) {
  const btn = $("question-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}
async function submitQuestionForm(event) {
  event.preventDefault();
  const errorEl = $("question-form-error");
  errorEl.classList.add("hidden");
  const isVersionMode = questionFormMode === "editVersion" || questionFormMode === "createVersion";
  const contentId = $("question-form-content").value.trim();
  const type = isVersionMode ? currentQuestionType : $("question-form-type").value;
  const prompt = $("question-form-prompt").value.trim();
  const explanation = $("question-form-explanation").value.trim() || null;
  const hint = $("question-form-hint").value.trim() || null;
  const difficultyRaw = $("question-form-difficulty").value.trim();
  const difficulty = difficultyRaw === "" ? null : Number(difficultyRaw);
  const skillId = $("question-form-skill").value || null;
  const position = Number($("question-form-position").value);
  if (!isVersionMode && !contentId) {
    errorEl.textContent = "İçerik seçimi zorunludur.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!type) {
    errorEl.textContent = "Soru tipi seçimi zorunludur.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!prompt) {
    errorEl.textContent = "Soru metni zorunludur.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!isVersionMode && (!Number.isFinite(position) || position < 0)) {
    errorEl.textContent = "Pozisyon 0 veya daha büyük bir tam sayı olmalı.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (difficulty !== null && (!Number.isFinite(difficulty) || difficulty < 0 || difficulty > 1)) {
    errorEl.textContent = "Zorluk 0 ile 1 arasında olmalı.";
    errorEl.classList.remove("hidden");
    return;
  }
  let options = [];
  let correctAnswer = null;
  try {
    if (type === "MULTIPLE_CHOICE") {
      const rows = [...document.querySelectorAll("#question-form-mc-options .mc-option-row")];
      if (rows.length === 0) throw new Error("En az bir seçenek ekleyin.");
      options = rows.map((row, idx) => {
        const id = row.querySelector("[data-mc-id]").value.trim();
        const text = row.querySelector("[data-mc-text]").value.trim();
        if (!id) throw new Error("Seçenek ID boş olamaz.");
        if (!text) throw new Error("Seçenek metni boş olamaz.");
        return { id, text, position: idx };
      });
      const ids = options.map((o) => o.id);
      if (new Set(ids).size !== ids.length) throw new Error("Seçenek ID'leri benzersiz olmalı.");
      const correctOptionIds = rows
        .filter((r) => r.querySelector("[data-mc-correct]").checked)
        .map((r) => r.querySelector("[data-mc-id]").value.trim())
        .filter(Boolean);
      if (correctOptionIds.length === 0) throw new Error("En az bir doğru seçenek seçin.");
      const allowMultiple = $("question-form-mc-allow-multiple").checked;
      const partialCredit = $("question-form-mc-partial").checked;
      if (!allowMultiple && correctOptionIds.length !== 1)
        throw new Error("Tek seçimli soruda tek doğru olmalı.");
      correctAnswer = { type, correctOptionIds, allowMultiple, partialCredit };
    } else if (type === "TRUE_FALSE") {
      options = [];
      const answer = $("question-form-tf-answer").value === "true";
      correctAnswer = { type, answer };
    } else if (type === "OPEN_ENDED") {
      options = [];
      const expectedAnswer = $("question-form-oe-expected").value.trim();
      if (!expectedAnswer) throw new Error("Beklenen cevap zorunludur.");
      const variantsRaw = $("question-form-oe-variants").value.trim();
      const acceptableVariants = variantsRaw
        ? variantsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      const caseSensitive = $("question-form-oe-case").checked || undefined;
      const rubricRows = [
        ...document.querySelectorAll("#question-form-oe-rubric-list .rubric-row"),
      ];
      let rubric = undefined;
      if (rubricRows.length > 0) {
        rubric = rubricRows.map((r) => {
          const criteria = r.querySelector("[data-rubric-criteria]").value.trim();
          const points = Number(r.querySelector("[data-rubric-points]").value);
          if (!criteria) throw new Error("Rubrik kriter boş olamaz.");
          if (!Number.isFinite(points) || points < 0 || points > 1)
            throw new Error("Rubrik puanı 0–1 arasında olmalı.");
          return { criteria, points };
        });
      }
      correctAnswer = {
        type,
        expectedAnswer,
        ...(acceptableVariants ? { acceptableVariants } : {}),
        ...(caseSensitive ? { caseSensitive } : {}),
        ...(rubric ? { rubric } : {}),
      };
    } else if (type === "MATCHING") {
      const optRows = [
        ...document.querySelectorAll("#question-form-matching-options .matching-opt-row"),
      ];
      if (optRows.length === 0) throw new Error("En az bir seçenek ekleyin.");
      options = optRows.map((row, idx) => {
        const id = row.querySelector("[data-mopt-id]").value.trim();
        const text = row.querySelector("[data-mopt-text]").value.trim();
        const matchGroup = row.querySelector("[data-mopt-group]").value;
        if (!id || !text) throw new Error("Eşleştirme seçenek ID/metin boş olamaz.");
        return { id, text, matchGroup, position: idx };
      });
      const pairRows = [...document.querySelectorAll("#question-form-matching-pairs .pair-row")];
      if (pairRows.length === 0) throw new Error("En az bir doğru eşleşme ekleyin.");
      const pairs = pairRows.map((r) => {
        const leftId = r.querySelector("[data-pair-left]").value.trim();
        const rightId = r.querySelector("[data-pair-right]").value.trim();
        if (!leftId || !rightId) throw new Error("Eşleşme sol/sağ ID boş olamaz.");
        return { leftId, rightId };
      });
      const partialCredit = $("question-form-matching-partial").checked;
      correctAnswer = { type, pairs, partialCredit };
    } else if (type === "FILL_BLANK") {
      options = [];
      const blankRows = [...document.querySelectorAll("#question-form-blank-list .blank-row")];
      if (blankRows.length === 0) throw new Error("En az bir boşluk ekleyin.");
      const blanks = blankRows.map((r) => {
        const blankId = r.querySelector("[data-blank-id]").value.trim();
        const acceptedRaw = r.querySelector("[data-blank-accepted]").value.trim();
        const acceptedAnswers = acceptedRaw
          ? acceptedRaw
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        if (!blankId) throw new Error("Blank ID boş olamaz.");
        if (acceptedAnswers.length === 0) throw new Error("Kabul edilen cevap boş olamaz.");
        const caseSensitive = r.querySelector("[data-blank-case]").checked || undefined;
        const regex = r.querySelector("[data-blank-regex]").value.trim() || null;
        return {
          blankId,
          acceptedAnswers,
          ...(caseSensitive ? { caseSensitive } : {}),
          ...(regex ? { regex } : {}),
        };
      });
      const partialCredit = $("question-form-blank-partial").checked;
      correctAnswer = { type, blanks, partialCredit };
    }
  } catch (e) {
    errorEl.textContent = e.message || "Form verileri hatalı.";
    errorEl.classList.remove("hidden");
    return;
  }
  const versionPayload = {
    prompt,
    options,
    correctAnswer,
    ...(explanation !== null || questionFormMode !== "createQuestion" ? { explanation } : {}),
    ...(hint !== null || questionFormMode !== "createQuestion" ? { hint } : {}),
    ...(difficulty !== null ? { difficulty } : {}),
  };
  const payload = {
    type,
    prompt,
    options,
    correctAnswer,
    ...(explanation ? { explanation } : {}),
    ...(hint ? { hint } : {}),
    ...(difficulty !== null ? { difficulty } : {}),
    ...(skillId ? { skillId } : {}),
    position,
    contentId,
  };
  setQuestionFormLoading(true);
  try {
    if (questionFormMode === "editVersion" && editingVersionId) {
      const res = await questionApi(`/questions/versions/${editingVersionId}`, {
        method: "PATCH",
        body: JSON.stringify(versionPayload),
      });
      await parseResponse(res);
      closeQuestionForm();
      if (editingQuestionId) {
        currentQuestionId = editingQuestionId;
        void loadQuestionVersions(editingQuestionId);
        void loadQuestions();
      } else if (currentQuestionId) {
        void loadQuestionVersions(currentQuestionId);
        void loadQuestions();
      }
      showQuestionError("Sürüm başarıyla güncellendi.");
      setTimeout(hideQuestionError, 3000);
    } else if (questionFormMode === "createVersion" && editingQuestionId) {
      const res = await questionApi(`/questions/${editingQuestionId}/versions`, {
        method: "POST",
        body: JSON.stringify(versionPayload),
      });
      await parseResponse(res);
      closeQuestionForm();
      void loadQuestionVersions(editingQuestionId);
      void loadQuestions();
      showQuestionError("Yeni sürüm oluşturuldu.");
      setTimeout(hideQuestionError, 3000);
    } else {
      const res = await fetch(`/admin/contents/${encodeURIComponent(contentId)}/questions`, {
        method: "POST",
        headers: {
          ...authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      await parseResponse(res);
      closeQuestionForm();
      hideQuestionError();
      questionPage = 1;
      void loadQuestions();
      showQuestionError("Soru başarıyla oluşturuldu.");
      setTimeout(hideQuestionError, 3000);
    }
  } catch (err) {
    errorEl.textContent = err.message || "Soru oluşturulurken bir hata oluştu.";
    errorEl.classList.remove("hidden");
  } finally {
    setQuestionFormLoading(false);
  }
}

// ========== Exercise Template ==========
function templateApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (options.method === "DELETE") delete headers["content-type"];
  return fetch(`/admin${path}`, { ...options, headers });
}
function showTemplateError(message) {
  const el = $("template-error");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
}
function hideTemplateError() {
  const el = $("template-error");
  if (el) el.classList.add("hidden");
}
const TEMPLATE_TYPE_LABELS = {
  COMPREHENSION: "Kavrama",
  FLUENCY: "Akıcılık",
  INFERENCE: "Çıkarım",
  VOCABULARY: "Kelime",
  MIXED: "Karışık",
};
function templateTypeLabel(type) {
  return TEMPLATE_TYPE_LABELS[type] ?? type;
}
const TEMPLATE_STATUS_LABELS = {
  DRAFT: "Taslak",
  PUBLISHED: "Yayında",
  ARCHIVED: "Arşivlenmiş",
};
function templateStatusBadge(status) {
  const cls = {
    DRAFT: "badge badge-neutral",
    PUBLISHED: "badge badge-success",
    ARCHIVED: "badge badge-warning",
  }[status];
  return `<span class="${cls ?? "badge"}">${TEMPLATE_STATUS_LABELS[status] ?? status}</span>`;
}
async function populateTemplateFilters() {
  const skillSel = $("template-skill-filter");
  const formSkill = $("template-form-skill");
  try {
    const res = await questionApi("/skills?page=1&pageSize=100");
    const body = await parseResponse(res);
    const opts = body.items
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join("");
    if (skillSel)
      skillSel.innerHTML = opts
        ? `<option value="">Tüm beceriler</option>${opts}`
        : `<option value="">Beceri bulunamadı</option>`;
    if (formSkill) formSkill.innerHTML = `<option value="">Beceri seçin…</option>${opts}`;
  } catch (_e) {
    void _e;
    if (skillSel) skillSel.innerHTML = `<option value="">Beceriler yüklenemedi</option>`;
    if (formSkill) formSkill.innerHTML = `<option value="">Beceriler yüklenemedi</option>`;
  }
}
async function loadTemplates() {
  hideTemplateError();
  const tbody = $("template-list-body");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="muted">Yükleniyor…</td></tr>';
  const search = ($("template-search")?.value ?? "").trim();
  const type = $("template-type-filter")?.value ?? "";
  const status = $("template-status-filter")?.value ?? "";
  const skillId = $("template-skill-filter")?.value ?? "";
  const pageSize = Number($("template-page-size")?.value) || 10;
  templatePageSize = pageSize;
  const params = new URLSearchParams({ page: String(templatePage), pageSize: String(pageSize) });
  if (search) params.set("search", search);
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  if (skillId) params.set("skillId", skillId);
  try {
    const res = await templateApi(`/templates?${params.toString()}`);
    const body = await parseResponse(res);
    templateData = body.items;
    templateTotal = body.total;
    renderTemplateList();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="error">—</td></tr>';
    showTemplateError(err.message || "Şablonlar yüklenirken bir hata oluştu.");
  }
}
function renderTemplateList() {
  const tbody = $("template-list-body");
  if (!tbody) return;
  if (templateData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Henüz şablon bulunmuyor.</td></tr>';
  } else {
    tbody.innerHTML = templateData
      .map(
        (t) => `
      <tr>
        <td><button type="button" class="link-btn" data-template-detail-id="${t.id}">${escapeHtml(t.title.slice(0, 60))}</button></td>
        <td>${escapeHtml(templateTypeLabel(t.type))}</td>
        <td>${escapeHtml(t.skillName ?? "—")}</td>
        <td>${templateStatusBadge(t.status)}</td>
        <td class="numeric">${t.versionCount ?? "—"}</td>
        <td class="text-right"><button type="button" class="btn btn-ghost btn-sm" data-template-detail-id="${t.id}">Detay</button></td>
      </tr>`,
      )
      .join("");
  }
  const totalPages = Math.max(1, Math.ceil(templateTotal / templatePageSize));
  const info = $("template-page-info");
  if (info)
    info.textContent = `Toplam ${templateTotal} şablon · Sayfa ${templatePage}/${totalPages}`;
  const prev = $("template-prev-btn");
  const next = $("template-next-btn");
  if (prev) prev.disabled = templatePage <= 1;
  if (next) next.disabled = templatePage >= totalPages;
}
async function openTemplateDetail(id) {
  currentTemplateId = id;
  const modal = $("template-detail-modal");
  const body = $("template-detail-body");
  const title = $("template-detail-title");
  if (body) body.innerHTML = '<p class="muted">Yükleniyor…</p>';
  if (title) title.textContent = "Şablon detayı";
  const listEl = $("template-version-list");
  const errEl = $("template-version-error");
  if (listEl) listEl.innerHTML = "Yükleniyor…";
  if (errEl) errEl.classList.add("hidden");
  if (modal) modal.classList.remove("hidden");
  try {
    const res = await templateApi(`/templates/${id}`);
    const t = await parseResponse(res);
    if (title) title.textContent = t.title.slice(0, 80);
    if (body)
      body.innerHTML = `
      <div class="detail-grid">
        <div class="info-item"><dt>Başlık</dt><dd>${escapeHtml(t.title)}</dd></div>
        <div class="info-item"><dt>Tür</dt><dd>${escapeHtml(templateTypeLabel(t.type))}</dd></div>
        <div class="info-item"><dt>Beceri</dt><dd>${escapeHtml(t.skillName ?? "—")}</dd></div>
        <div class="info-item"><dt>Durum</dt><dd>${templateStatusBadge(t.status)}</dd></div>
        <div class="info-item"><dt>Yapılandırma</dt><dd><pre style="white-space:pre-wrap; max-height:120px; overflow:auto;">${escapeHtml(JSON.stringify(t.config ?? {}, null, 2))}</pre></dd></div>
        <div class="info-item"><dt>Oluşturulma</dt><dd>${escapeHtml(formatDateTime(t.createdAt))}</dd></div>
      </div>`;
    void loadTemplateVersions(id);
  } catch (err) {
    if (body)
      body.innerHTML = `<p class="error">${escapeHtml(err.message || "Şablon detayı yüklenemedi.")}</p>`;
    if (listEl) listEl.innerHTML = '<p class="error">Sürümler yüklenemedi.</p>';
  }
}
function closeTemplateDetail() {
  const m = $("template-detail-modal");
  if (m) m.classList.add("hidden");
}
async function loadTemplateVersions(templateId) {
  const listEl = $("template-version-list");
  const errEl = $("template-version-error");
  if (errEl) errEl.classList.add("hidden");
  if (listEl) listEl.innerHTML = "Yükleniyor…";
  try {
    const res = await templateApi(`/templates/${templateId}/versions`);
    const data = await parseResponse(res);
    templateVersionData = Array.isArray(data) ? data : (data.items ?? data.versions ?? []);
    renderTemplateVersionList();
  } catch (err) {
    if (listEl) listEl.innerHTML = '<p class="error">Sürümler yüklenemedi.</p>';
    if (errEl) {
      errEl.textContent = err.message || "Sürümler yüklenemedi.";
      errEl.classList.remove("hidden");
    }
  }
}
function renderTemplateVersionList() {
  const listEl = $("template-version-list");
  if (!listEl) return;
  if (!templateVersionData || templateVersionData.length === 0) {
    listEl.innerHTML = '<p class="muted">Henüz sürüm bulunmuyor.</p>';
    return;
  }
  listEl.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Sürüm</th><th>Durum</th><th>Oluşturulma</th><th>Yayınlanma</th><th>İşlemler</th></tr></thead>
        <tbody>
          ${templateVersionData
            .map(
              (v) => `
            <tr>
              <td>v${escapeHtml(String(v.version))}</td>
              <td>${versionStatusBadge(v.status)}</td>
              <td>${escapeHtml(formatDateTime(v.createdAt))}</td>
              <td>${escapeHtml(formatDateTime(v.publishedAt))}</td>
              <td>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button type="button" class="btn btn-ghost btn-sm" data-tversion-view="${escapeHtml(v.id)}">Detay</button>
                  ${v.status === "DRAFT" ? `<button type="button" class="btn btn-ghost btn-sm" data-tversion-edit="${escapeHtml(v.id)}">Düzenle</button>` : ""}
                  ${v.status === "DRAFT" ? `<button type="button" class="btn btn-ghost btn-sm" data-tversion-review="${escapeHtml(v.id)}">İncelemeye Al</button>` : ""}
                  ${v.status === "DRAFT" || v.status === "REVIEW" ? `<button type="button" class="btn btn-primary btn-sm" data-tversion-publish="${escapeHtml(v.id)}">Yayınla</button>` : ""}
                </div>
              </td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}
async function openTemplateVersionDetail(versionId) {
  currentTemplateVersionId = versionId;
  const modal = $("template-version-detail-modal");
  const body = $("template-version-detail-body");
  const title = $("template-version-detail-title");
  if (body) body.innerHTML = '<p class="muted">Yükleniyor…</p>';
  if (title) title.textContent = "Sürüm detayı";
  if (modal) modal.classList.remove("hidden");
  try {
    const res = await templateApi(`/templates/versions/${versionId}`);
    const v = await parseResponse(res);
    if (title) title.textContent = `v${v.version} · ${VERSION_STATUS_LABELS[v.status] ?? v.status}`;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const safeJson = (val) => {
      try {
        return escapeHtml(JSON.stringify(val, null, 2));
      } catch (_e) {
        void _e;
        return escapeHtml(String(val));
      }
    };
    if (body)
      body.innerHTML = `
      <div class="detail-grid">
        <div class="info-item"><dt>Sürüm</dt><dd>v${escapeHtml(String(v.version))}</dd></div>
        <div class="info-item"><dt>Durum</dt><dd>${versionStatusBadge(v.status)}</dd></div>
        <div class="info-item"><dt>Oluşturulma</dt><dd>${escapeHtml(formatDateTime(v.createdAt))}</dd></div>
        <div class="info-item"><dt>Yayınlanma</dt><dd>${escapeHtml(formatDateTime(v.publishedAt))}</dd></div>
        <div class="info-item"><dt>Oluşturan</dt><dd>${escapeHtml(v.createdByName ?? "—")}</dd></div>
      </div>`;
    // Load bindings
    const contentsEl = $("template-version-contents");
    const questionsEl = $("template-version-questions");
    if (contentsEl) {
      if (!v.contents || v.contents.length === 0)
        contentsEl.innerHTML = '<p class="muted">Bağlı içerik yok.</p>';
      else
        contentsEl.innerHTML = v.contents
          .map(
            (c) =>
              `<div class="info-item" style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border);">
                <span>${escapeHtml(c.contentTitle ?? c.contentVersionTitle ?? c.contentVersionId)} (v${c.contentVersionVersion ?? "?"}) pos:${c.position}</span>
                <button type="button" class="btn btn-ghost btn-sm" data-tcontent-remove="${escapeHtml(c.contentVersionId)}">Kaldır</button>
              </div>`,
          )
          .join("");
    }
    if (questionsEl) {
      if (!v.questions || v.questions.length === 0)
        questionsEl.innerHTML = '<p class="muted">Bağlı soru yok.</p>';
      else
        questionsEl.innerHTML = v.questions
          .map(
            (q) =>
              `<div class="info-item" style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border);">
                <span>${escapeHtml(q.questionVersionPrompt ?? q.questionVersionId)} (v${q.questionVersionVersion ?? "?"}) pos:${q.position}</span>
                <button type="button" class="btn btn-ghost btn-sm" data-tquestion-remove="${escapeHtml(q.questionVersionId)}">Kaldır</button>
              </div>`,
          )
          .join("");
    }
    // Populate selects for adding
    void populateTemplateVersionSelects();
  } catch (err) {
    if (body)
      body.innerHTML = `<p class="error">${escapeHtml(err.message || "Sürüm detayı yüklenemedi.")}</p>`;
  }
}
function closeTemplateVersionDetail() {
  const m = $("template-version-detail-modal");
  if (m) m.classList.add("hidden");
}
async function populateTemplateVersionSelects() {
  const cSel = $("template-version-content-select");
  const qSel = $("template-version-question-select");
  if (cSel) {
    try {
      const res = await contentApi("/contents?page=1&pageSize=100");
      const body = await parseResponse(res);
      const opts = [];
      for (const c of body.items) {
        try {
          const vRes = await contentApi(`/contents/${c.id}/versions`);
          const versions = await parseResponse(vRes);
          for (const v of versions) {
            if (v.status === "PUBLISHED") {
              opts.push(
                `<option value="${v.id}">${escapeHtml(c.title)} - v${v.version} (${v.id.slice(0, 8)})</option>`,
              );
            }
          }
        } catch (_e) {
          void _e;
          // ignore per-content version fetch errors
        }
      }
      cSel.innerHTML = opts.length
        ? `<option value="">Seçin…</option>${opts.join("")}`
        : `<option value="">PUBLISHED içerik sürümü yok</option>`;
    } catch (_e) {
      void _e;
      cSel.innerHTML = `<option value="">Yüklenemedi</option>`;
    }
  }
  if (qSel) {
    try {
      const res = await questionApi("/questions?page=1&pageSize=100");
      const body = await parseResponse(res);
      const qOpts = [];
      for (const q of body.items) {
        try {
          const vRes = await questionApi(`/questions/${q.id}/versions`);
          const versions = await parseResponse(vRes);
          const vs = Array.isArray(versions) ? versions : versions;
          for (const v of vs) {
            if (v.status === "PUBLISHED") {
              qOpts.push(
                `<option value="${v.id}">${escapeHtml(v.prompt?.slice(0, 40) ?? q.id.slice(0, 8))} - v${v.version}</option>`,
              );
            }
          }
        } catch (_e) {
          void _e;
          // ignore per-question version fetch errors
        }
      }
      qSel.innerHTML = qOpts.length
        ? `<option value="">Seçin…</option>${qOpts.join("")}`
        : `<option value="">PUBLISHED soru sürümü yok</option>`;
    } catch (_e) {
      void _e;
      qSel.innerHTML = `<option value="">Yüklenemedi</option>`;
    }
  }
}
async function handleTemplateVersionReview(versionId) {
  const errEl = $("template-version-error");
  if (errEl) errEl.classList.add("hidden");
  try {
    const res = await templateApi(`/templates/versions/${versionId}/review`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await parseResponse(res);
    if (currentTemplateId) {
      void loadTemplateVersions(currentTemplateId);
      void loadTemplates();
    }
    showTemplateError("Sürüm incelemeye alındı.");
    setTimeout(hideTemplateError, 3000);
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || "İncelemeye alma başarısız.";
      errEl.classList.remove("hidden");
    }
    showTemplateError(err.message || "İncelemeye alma başarısız.");
  }
}
async function handleTemplateVersionPublish(versionId) {
  const errEl = $("template-version-error");
  if (errEl) errEl.classList.add("hidden");
  try {
    const res = await templateApi(`/templates/versions/${versionId}/publish`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await parseResponse(res);
    if (currentTemplateId) {
      void loadTemplateVersions(currentTemplateId);
      void loadTemplates();
    }
    showTemplateError("Sürüm yayınlandı.");
    setTimeout(hideTemplateError, 3000);
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || "Yayınlama başarısız.";
      errEl.classList.remove("hidden");
    }
    showTemplateError(err.message || "Yayınlama başarısız.");
  }
}
async function handleTemplateNewVersion() {
  if (!currentTemplateId) return;
  const errEl = $("template-version-error");
  if (errEl) errEl.classList.add("hidden");
  try {
    const res = await templateApi(`/templates/${currentTemplateId}/versions`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await parseResponse(res);
    void loadTemplateVersions(currentTemplateId);
    void loadTemplates();
    showTemplateError("Yeni sürüm oluşturuldu.");
    setTimeout(hideTemplateError, 3000);
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || "Yeni sürüm oluşturulamadı.";
      errEl.classList.remove("hidden");
    }
  }
}
async function handleTemplateVersionContentAdd() {
  if (!currentTemplateVersionId) return;
  const sel = $("template-version-content-select");
  const posEl = $("template-version-content-position");
  const errEl = $("template-version-content-error");
  if (errEl) errEl.classList.add("hidden");
  const contentVersionId = sel?.value?.trim();
  const position = Number(posEl?.value);
  if (!contentVersionId) {
    if (errEl) {
      errEl.textContent = "İçerik sürümü seçin.";
      errEl.classList.remove("hidden");
    }
    return;
  }
  try {
    const detailRes = await templateApi(`/templates/versions/${currentTemplateVersionId}`);
    const detail = await parseResponse(detailRes);
    const existing = detail.contents || [];
    const payload = {
      contents: [
        ...existing.map((c) => ({ contentVersionId: c.contentVersionId, position: c.position })),
        { contentVersionId, position: Number.isFinite(position) ? position : existing.length },
      ],
    };
    const res = await templateApi(`/template-versions/${currentTemplateVersionId}/contents`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await parseResponse(res);
    void openTemplateVersionDetail(currentTemplateVersionId);
    if (currentTemplateId) void loadTemplateVersions(currentTemplateId);
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || "İçerik bağlanamadı.";
      errEl.classList.remove("hidden");
    }
  }
}
async function handleTemplateVersionQuestionAdd() {
  if (!currentTemplateVersionId) return;
  const sel = $("template-version-question-select");
  const posEl = $("template-version-question-position");
  const errEl = $("template-version-question-error");
  if (errEl) errEl.classList.add("hidden");
  const questionVersionId = sel?.value?.trim();
  const position = Number(posEl?.value);
  if (!questionVersionId) {
    if (errEl) {
      errEl.textContent = "Soru sürümü seçin.";
      errEl.classList.remove("hidden");
    }
    return;
  }
  try {
    const detailRes = await templateApi(`/templates/versions/${currentTemplateVersionId}`);
    const detail = await parseResponse(detailRes);
    const existing = detail.questions || [];
    const payload = {
      questions: [
        ...existing.map((q) => ({ questionVersionId: q.questionVersionId, position: q.position })),
        { questionVersionId, position: Number.isFinite(position) ? position : existing.length },
      ],
    };
    const res = await templateApi(`/template-versions/${currentTemplateVersionId}/questions`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await parseResponse(res);
    void openTemplateVersionDetail(currentTemplateVersionId);
    if (currentTemplateId) void loadTemplateVersions(currentTemplateId);
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || "Soru bağlanamadı.";
      errEl.classList.remove("hidden");
    }
  }
}
async function handleTemplateVersionContentRemove(contentVersionId) {
  if (!currentTemplateVersionId) return;
  try {
    const detailRes = await templateApi(`/templates/versions/${currentTemplateVersionId}`);
    const detail = await parseResponse(detailRes);
    const existing = detail.contents || [];
    const payload = {
      contents: existing
        .filter((c) => c.contentVersionId !== contentVersionId)
        .map((c) => ({ contentVersionId: c.contentVersionId, position: c.position })),
    };
    const res = await templateApi(`/template-versions/${currentTemplateVersionId}/contents`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await parseResponse(res);
    void openTemplateVersionDetail(currentTemplateVersionId);
  } catch (err) {
    const errEl = $("template-version-content-error");
    if (errEl) {
      errEl.textContent = err.message || "İçerik kaldırılamadı.";
      errEl.classList.remove("hidden");
    }
  }
}
async function handleTemplateVersionQuestionRemove(questionVersionId) {
  if (!currentTemplateVersionId) return;
  try {
    const detailRes = await templateApi(`/templates/versions/${currentTemplateVersionId}`);
    const detail = await parseResponse(detailRes);
    const existing = detail.questions || [];
    const payload = {
      questions: existing
        .filter((q) => q.questionVersionId !== questionVersionId)
        .map((q) => ({ questionVersionId: q.questionVersionId, position: q.position })),
    };
    const res = await templateApi(`/template-versions/${currentTemplateVersionId}/questions`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await parseResponse(res);
    void openTemplateVersionDetail(currentTemplateVersionId);
  } catch (err) {
    const errEl = $("template-version-question-error");
    if (errEl) {
      errEl.textContent = err.message || "Soru kaldırılamadı.";
      errEl.classList.remove("hidden");
    }
  }
}
function openTemplateForm() {
  resetTemplateForm();
  void populateTemplateFilters();
  $("template-form-modal").classList.remove("hidden");
  $("template-form-title-input").focus();
}
function closeTemplateForm() {
  const m = $("template-form-modal");
  if (m) m.classList.add("hidden");
}
function resetTemplateForm() {
  const form = $("template-form");
  if (form) form.reset();
  const err = $("template-form-error");
  if (err) {
    err.classList.add("hidden");
    err.textContent = "";
  }
  const title = $("template-form-title");
  if (title) title.textContent = "Yeni Şablon";
  const btn = $("template-form-submit");
  if (btn) {
    const lbl = btn.querySelector(".btn-label");
    if (lbl) lbl.textContent = "Kaydet";
  }
  const tId = $("template-form-id");
  if (tId) tId.value = "";
}
function setTemplateFormLoading(isLoading) {
  const btn = $("template-form-submit");
  if (!btn) return;
  btn.disabled = isLoading;
  const lbl = btn.querySelector(".btn-label");
  const sp = btn.querySelector(".btn-spinner");
  if (lbl) lbl.classList.toggle("hidden", isLoading);
  if (sp) sp.classList.toggle("hidden", !isLoading);
}
async function submitTemplateForm(event) {
  event.preventDefault();
  const errEl = $("template-form-error");
  if (errEl) errEl.classList.add("hidden");
  const id = ($("template-form-id")?.value ?? "").trim();
  const title = ($("template-form-title-input")?.value ?? "").trim();
  const type = ($("template-form-type")?.value ?? "").trim();
  const skillId = ($("template-form-skill")?.value ?? "").trim() || null;
  const configRaw = ($("template-form-config")?.value ?? "").trim();
  let config = null;
  if (configRaw) {
    try {
      config = JSON.parse(configRaw);
    } catch (_e) {
      void _e;
      if (errEl) {
        errEl.textContent = "Yapılandırma geçerli JSON olmalı.";
        errEl.classList.remove("hidden");
      }
      return;
    }
  }
  if (!title) {
    if (errEl) {
      errEl.textContent = "Başlık gerekli.";
      errEl.classList.remove("hidden");
    }
    return;
  }
  if (!type) {
    if (errEl) {
      errEl.textContent = "Tür seçin.";
      errEl.classList.remove("hidden");
    }
    return;
  }
  const payload = { title, type, skillId, config };
  setTemplateFormLoading(true);
  try {
    let res;
    if (id) {
      res = await templateApi(`/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      res = await templateApi("/templates", { method: "POST", body: JSON.stringify(payload) });
    }
    await parseResponse(res);
    closeTemplateForm();
    hideTemplateError();
    templatePage = 1;
    void loadTemplates();
    showTemplateError(id ? "Şablon güncellendi." : "Şablon oluşturuldu.");
    setTimeout(hideTemplateError, 3000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Şablon kaydedilemedi.";
    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.remove("hidden");
    }
  } finally {
    setTemplateFormLoading(false);
  }
}
function setupTemplateEvents() {
  const search = $("template-search");
  if (search)
    search.addEventListener("input", () => {
      templatePage = 1;
      void loadTemplates();
    });
  const typeF = $("template-type-filter");
  if (typeF)
    typeF.addEventListener("change", () => {
      templatePage = 1;
      void loadTemplates();
    });
  const statusF = $("template-status-filter");
  if (statusF)
    statusF.addEventListener("change", () => {
      templatePage = 1;
      void loadTemplates();
    });
  const skillF = $("template-skill-filter");
  if (skillF)
    skillF.addEventListener("change", () => {
      templatePage = 1;
      void loadTemplates();
    });
  const sizeF = $("template-page-size");
  if (sizeF)
    sizeF.addEventListener("change", () => {
      templatePage = 1;
      void loadTemplates();
    });
  const prev = $("template-prev-btn");
  if (prev)
    prev.addEventListener("click", () => {
      if (templatePage > 1) {
        templatePage--;
        void loadTemplates();
      }
    });
  const next = $("template-next-btn");
  if (next)
    next.addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(templateTotal / templatePageSize));
      if (templatePage < totalPages) {
        templatePage++;
        void loadTemplates();
      }
    });
  const listBody = $("template-list-body");
  if (listBody)
    listBody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-template-detail-id]");
      if (btn) void openTemplateDetail(btn.dataset.templateDetailId);
    });
  const detailClose = $("template-detail-close");
  if (detailClose) detailClose.addEventListener("click", closeTemplateDetail);
  const detailCloseAction = $("template-detail-close-action");
  if (detailCloseAction) detailCloseAction.addEventListener("click", closeTemplateDetail);
  const newVerBtn = $("template-new-version-btn");
  if (newVerBtn) newVerBtn.addEventListener("click", handleTemplateNewVersion);
  const verList = $("template-version-list");
  if (verList)
    verList.addEventListener("click", (e) => {
      const view = e.target.closest("[data-tversion-view]");
      if (view) void openTemplateVersionDetail(view.dataset.tversionView);
      const edit = e.target.closest("[data-tversion-edit]");
      if (edit) void openTemplateEditForVersion(edit.dataset.tversionEdit);
      const rev = e.target.closest("[data-tversion-review]");
      if (rev) void handleTemplateVersionReview(rev.dataset.tversionReview);
      const pub = e.target.closest("[data-tversion-publish]");
      if (pub) void handleTemplateVersionPublish(pub.dataset.tversionPublish);
    });
  const verDetailClose = $("template-version-detail-close");
  if (verDetailClose) verDetailClose.addEventListener("click", closeTemplateVersionDetail);
  const verDetailCloseAction = $("template-version-detail-close-action");
  if (verDetailCloseAction)
    verDetailCloseAction.addEventListener("click", closeTemplateVersionDetail);
  const cAdd = $("template-version-content-add");
  if (cAdd) cAdd.addEventListener("click", handleTemplateVersionContentAdd);
  const qAdd = $("template-version-question-add");
  if (qAdd) qAdd.addEventListener("click", handleTemplateVersionQuestionAdd);
  const vContents = $("template-version-contents");
  if (vContents)
    vContents.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tcontent-remove]");
      if (btn) void handleTemplateVersionContentRemove(btn.dataset.tcontentRemove);
    });
  const vQuestions = $("template-version-questions");
  if (vQuestions)
    vQuestions.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tquestion-remove]");
      if (btn) void handleTemplateVersionQuestionRemove(btn.dataset.tquestionRemove);
    });
  const createBtn = $("template-create-btn");
  if (createBtn) createBtn.addEventListener("click", openTemplateForm);
  const formClose = $("template-form-close");
  if (formClose) formClose.addEventListener("click", closeTemplateForm);
  const formCancel = $("template-form-cancel");
  if (formCancel) formCancel.addEventListener("click", closeTemplateForm);
  const form = $("template-form");
  if (form) form.addEventListener("submit", submitTemplateForm);
}
async function openTemplateEditForVersion(versionId) {
  try {
    const res = await templateApi(`/templates/versions/${versionId}`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const v = await parseResponse(res);
    // Template version has no editable fields except via template; for now just show info and allow no-op edit
    // We reuse template form for template itself, not version. So just show message.
    showTemplateError(
      "Sürüm düzenleme: şablon sürümünde düzenlenebilir alan yok, yeni sürüm oluşturun.",
    );
    setTimeout(hideTemplateError, 3000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sürüm yüklenemedi.";
    showTemplateError(msg);
  }
}

// ========== Exercise / Öğrenci Oturumu ==========
function exerciseApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  let route = `/admin${path}`;
  if (isPlatformUser === false) {
    route = path
      .replace(/^\/exercise-sessions\/([^/]+)\/questions$/, "/student/sessions/$1/questions")
      .replace(/^\/exercise-sessions\/([^/]+)\/complete$/, "/student/sessions/$1/complete")
      .replace(/^\/questions\/([^/]+)\/attempts$/, "/student/questions/$1/attempts");
  }
  return fetch(route, { signal: AbortSignal.timeout(15000), ...options, headers });
}
function showExerciseError(msg) {
  const el = $("exercise-error");
  if (el) {
    el.textContent = msg;
    el.classList.remove("hidden");
  }
}
function hideExerciseError() {
  const el = $("exercise-error");
  if (el) el.classList.add("hidden");
}
async function populateExerciseStudentSelect() {
  const sel = $("exercise-student-select");
  if (!sel) return;
  try {
    const res = await exerciseApi("/exercise-options");
    const body = await parseResponse(res);
    const opts = body.students
      .map(
        (u) =>
          `<option value="${u.id}">${escapeHtml(u.displayName)} (${escapeHtml(u.email ?? "")})</option>`,
      )
      .join("");
    sel.innerHTML = `<option value="">Öğrenci seçin…</option>${opts}`;
    if (body.students.length === 1) sel.value = body.students[0].id;
  } catch (_e) {
    void _e;
    sel.innerHTML = `<option value="">Öğrenciler yüklenemedi</option>`;
  }
}
async function populateExerciseTemplateVersionSelect() {
  const sel = $("exercise-template-version-select");
  if (!sel) return;
  sel.innerHTML = `<option value="">Yükleniyor…</option>`;
  try {
    const res = await exerciseApi("/exercise-options");
    const body = await parseResponse(res);
    const opts = body.templateVersions.map(
      (v) =>
        `<option value="${v.id}">${escapeHtml(v.title)} - v${v.version} (${v.id.slice(0, 8)})</option>`,
    );
    sel.innerHTML = opts.length
      ? `<option value="">Şablon sürümü seçin…</option>${opts.join("")}`
      : `<option value="">Yayınlanmış şablon yok</option>`;
  } catch (_e) {
    void _e;
    sel.innerHTML = `<option value="">Yüklenemedi</option>`;
  }
}
function exerciseStorageKey() {
  return "oku.exercise." + getStoredTokens().tenantId;
}
function rememberExerciseSession(id) {
  try {
    if (id) sessionStorage.setItem(exerciseStorageKey(), id);
    else sessionStorage.removeItem(exerciseStorageKey());
  } catch {
    /* Storage may be unavailable; server recovery still works. */
  }
}
function resetExerciseState() {
  exerciseSession = null;
  exerciseQuestions = [];
  exerciseAttempts.clear();
  exerciseAwaitingNext = false;
  exerciseRequest = null;
  exerciseGamification = null;
  exerciseGamificationRequest++;
  currentExerciseQuestionIndex = 0;
}
async function refreshExerciseGamification() {
  const requestId = ++exerciseGamificationRequest;
  let next = null;
  try {
    const t = getStoredTokens();
    next = await parseResponse(
      await fetch("/student/gamification", {
        signal: AbortSignal.timeout(15000),
        headers: authHeaders(t.accessToken, t.tenantId),
      }),
    );
  } catch {
    /* Optional points must not block answer feedback. */
  }
  if (requestId !== exerciseGamificationRequest) return null;
  exerciseGamification = next;
  if (next) observeInsightAwards(next);
  const g = exerciseGamification;
  $("exercise-xp").textContent = g ? "⭐ " + g.totalPoints + " XP" : "⭐ — XP";
  $("exercise-streak").textContent = g ? "🔥 " + g.currentDays : "🔥 —";
  if (g) {
    $("topbar-xp").textContent = String(g.totalPoints);
    $("topbar-streak").textContent = String(g.currentDays);
  }
  return g;
}
async function fetchStudentExercise(id) {
  const t = getStoredTokens();
  return parseResponse(
    await fetch("/student/sessions/" + encodeURIComponent(id), {
      signal: AbortSignal.timeout(15000),
      headers: authHeaders(t.accessToken, t.tenantId),
    }),
  );
}
function restoreExerciseAttempts(session) {
  const previous = exerciseAttempts;
  exerciseAttempts = new Map();
  for (const attempt of session.attempts || []) {
    const known = previous.get(attempt.questionVersionId);
    exerciseAttempts.set(attempt.questionVersionId, {
      ...(known?.id === attempt.id ? known : {}),
      ...attempt,
    });
  }
}
async function loadExercisePage() {
  if (exerciseLoading || exerciseBusy) return;
  exerciseLoading = true;
  hideExerciseError();
  const isStudent = isPlatformUser === false;
  $("exercise-admin-card").classList.toggle("hidden", isStudent);
  $("exercise-load-status").textContent = "Alıştırma yükleniyor…";
  $("exercise-retry-load").classList.add("hidden");
  try {
    if (isStudent) {
      const scope = getStoredTokens().tenantId;
      if (scope !== exerciseScope) {
        resetExerciseState();
        exerciseScope = scope;
      }
      const t = getStoredTokens();
      const today = await parseResponse(
        await fetch("/student/today", { headers: authHeaders(t.accessToken, t.tenantId) }),
      );
      let savedId = null;
      try {
        savedId = sessionStorage.getItem(exerciseStorageKey());
      } catch {
        /* optional */
      }
      const id =
        exerciseRequestedSessionId || today.activeSession?.id || exerciseSession?.id || savedId;
      exerciseRequestedSessionId = null;
      if (id) {
        let session;
        try {
          session = await fetchStudentExercise(id);
        } catch (err) {
          if (err.status === 403 || err.status === 404) {
            resetExerciseState();
            rememberExerciseSession(null);
          }
          throw err;
        }
        if (exerciseSession?.id !== session.id) resetExerciseState();
        exerciseSession = session;
        restoreExerciseAttempts(session);
        rememberExerciseSession(session.id);
        await loadExerciseQuestions();
      } else {
        resetExerciseState();
      }
      await refreshExerciseGamification();
    } else {
      await Promise.all([populateExerciseStudentSelect(), populateExerciseTemplateVersionSelect()]);
      if (exerciseSession) await loadExerciseQuestions();
    }
    renderExerciseSession();
    $("exercise-load-status").textContent = exerciseSession
      ? ""
      : "Devam eden alıştırman yok. Öğrenme yolundan başlayabilirsin.";
  } catch {
    $("exercise-load-status").textContent =
      "Alıştırma yüklenemedi. Bağlantını kontrol edip tekrar dene.";
    $("exercise-retry-load").classList.remove("hidden");
  } finally {
    exerciseLoading = false;
  }
}
function returnToExercisePath() {
  if (exerciseBusy) return;
  rememberExerciseSession(null);
  resetExerciseState();
  renderExerciseSession();
  navigate("dashboard");
  $("learning-path")?.scrollIntoView({ block: "start" });
}
function renderExerciseSession() {
  // student header visibility
  var sh = $("student-exercise-header");
  if (sh) {
    var isStudent = isPlatformUser === false;
    sh.classList.toggle("hidden", !isStudent || !exerciseSession);
  }
  const info = $("exercise-session-info");
  const detail = $("exercise-session-detail");
  if (!exerciseSession) {
    if (info) info.style.display = "none";
    renderStudentReading(null);
    $("exercise-questions-card").style.display = "none";
    $("exercise-result-card").style.display = "none";
    return;
  }
  renderStudentReading(exerciseSession);
  if (info) info.style.display = "block";
  if (detail) {
    const s = exerciseSession;
    detail.innerHTML = `
      <div class="info-item"><dt>Oturum</dt><dd>${escapeHtml(s.id.slice(0, 8))}</dd></div>
      <div class="info-item"><dt>Öğrenci</dt><dd>${escapeHtml(s.student?.displayName ?? s.studentId.slice(0, 8))}</dd></div>
      <div class="info-item"><dt>Şablon</dt><dd>${escapeHtml(s.templateVersion?.template?.title ?? s.templateVersionId.slice(0, 8))} v${s.templateVersion?.version ?? "?"}</dd></div>
      <div class="info-item"><dt>Durum</dt><dd>${escapeHtml(s.status)}</dd></div>
      <div class="info-item"><dt>Başlangıç</dt><dd>${escapeHtml(formatDateTime(s.startedAt))}</dd></div>
      ${s.scoreSummary ? `<div class="info-item"><dt>Puan Özeti</dt><dd><pre style="white-space:pre-wrap;">${escapeHtml(JSON.stringify(s.scoreSummary, null, 2))}</pre></dd></div>` : ""}
    `;
  }
  const qCard = $("exercise-questions-card");
  if (qCard)
    qCard.style.display =
      exerciseSession && exerciseQuestions.length && exerciseSession.status === "IN_PROGRESS"
        ? "block"
        : "none";
  const resultCard = $("exercise-result-card");
  if (resultCard)
    resultCard.style.display =
      exerciseSession?.status === "COMPLETED" && exerciseSession?.scoreSummary ? "block" : "none";
  if (exerciseSession?.status === "COMPLETED" && exerciseSession?.scoreSummary) {
    renderExerciseResult();
  }
}

function renderStudentReading(session) {
  const card = $("student-reading-card");
  const heading = $("student-reading-heading");
  const bodyEl = $("student-reading-body");
  if (!card || !heading || !bodyEl) return;
  const contents = session?.templateVersion?.contents ?? [];
  const first = contents[0]?.contentVersion;
  if (!first?.body) {
    card.style.display = "none";
    heading.textContent = "Metin";
    bodyEl.innerHTML = "";
    return;
  }
  heading.textContent = first.title || "Metin";
  bodyEl.innerHTML = String(first.body)
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join("");
  card.style.display = "block";
}
function renderExerciseResult() {
  const body = $("exercise-result-body");
  if (!body || !exerciseSession?.scoreSummary) return;
  const s = exerciseSession.scoreSummary;
  var isStudent = isPlatformUser === false;
  if (isStudent) {
    const isAssessment = Boolean(exerciseSession.assessmentId);
    const pending = Math.max(0, (s.attempted ?? 0) - (s.scoredCount ?? 0));
    const g = exerciseGamification;
    body.innerHTML = `
      <div class="completion-card">
        <div aria-hidden="true" style="font-size:48px">🎉</div>
        <h3 tabindex="-1" id="exercise-completion-title">${isAssessment ? "Değerlendirmeyi tamamladın!" : "Alıştırmayı tamamladın!"}</h3>
        <p>${pending ? pending + " cevap için değerlendirme bekleniyor. Puan yalnızca değerlendirilen cevapları içerir." : isAssessment ? "Sonuçların öğrenme yolunu kişiselleştirmek için kaydedildi." : "Çalışman kaydedildi."}</p>
        <dl class="exercise-result-stats">
          <div><dt>Toplam soru</dt><dd>${s.totalQuestions ?? "—"}</dd></div>
          <div><dt>Cevaplanan</dt><dd>${s.attempted ?? "—"}</dd></div>
          <div><dt>Puanlanan</dt><dd>${s.scoredCount ?? "—"}</dd></div>
          <div><dt>Bekleyen</dt><dd>${pending}</dd></div>
          <div><dt>Toplam puan</dt><dd>${s.totalRawScore ?? "—"}</dd></div>
          <div><dt>Ortalama</dt><dd>${s.averageScore == null ? "—" : Math.round(s.averageScore * 100) + "%"}</dd></div>
          <div><dt>Toplam XP</dt><dd>${g ? g.totalPoints : "—"}</dd></div>
          <div><dt>Günlük seri</dt><dd>${g ? g.currentDays : "—"}</dd></div>
        </dl>
        <p>Cevaplama ilerlemesi: ${s.attempted ?? 0} / ${s.totalQuestions ?? 0}</p>
        <button id="exercise-return-path" type="button" class="btn btn-primary">Öğrenme Yoluna Dön</button>
      </div>`;
    $("exercise-return-path").addEventListener("click", returnToExercisePath);
    return;
  }
  body.innerHTML = `
    <div class="info-item"><dt>Toplam Soru</dt><dd>${s.totalQuestions ?? "—"}</dd></div>
    <div class="info-item"><dt>Cevaplanan</dt><dd>${s.attempted ?? s.scoredCount ?? "—"}</dd></div>
    <div class="info-item"><dt>Toplam Puan</dt><dd>${s.totalRawScore != null ? Number(s.totalRawScore).toFixed(2) : "—"}</dd></div>
    <div class="info-item"><dt>Ortalama Puan</dt><dd>${s.averageScore != null ? Number(s.averageScore).toFixed(2) : "—"}</dd></div>
    <div class="info-item"><dt>Açık Uçlu Bekleyen</dt><dd>${(s.openEndedPending ?? s.pendingEvaluation) ? "Var" : "Yok"}</dd></div>
    <div class="info-item"><dt>Durum</dt><dd>${escapeHtml(exerciseSession.status)}</dd></div>
  `;
}
async function handleExerciseCreate() {
  hideExerciseError();
  const studentId = $("exercise-student-select")?.value?.trim();
  const templateVersionId = $("exercise-template-version-select")?.value?.trim();
  const clientSessionId =
    $("exercise-client-session-id")?.value?.trim() ||
    `E2E-SESSION-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const sessionType = $("exercise-session-type")?.value ?? "PRACTICE";
  if (!studentId) {
    showExerciseError("Öğrenci seçin.");
    return;
  }
  if (!templateVersionId) {
    showExerciseError("Şablon sürümü seçin.");
    return;
  }
  const btn = $("exercise-create-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Oluşturuluyor…";
  }
  try {
    const res = await exerciseApi("/exercise-sessions", {
      method: "POST",
      body: JSON.stringify({ studentId, templateVersionId, clientSessionId, sessionType }),
    });
    const data = await parseResponse(res);
    exerciseSession = data;
    exerciseQuestions = [];
    currentExerciseQuestionIndex = 0;
    exerciseAttempts.clear();
    renderExerciseSession();
    void loadExerciseQuestions();
    showExerciseError("Oturum oluşturuldu.");
    setTimeout(hideExerciseError, 3000);
    // Clear clientSessionId for next
    const cidEl = $("exercise-client-session-id");
    if (cidEl) cidEl.value = "";
  } catch (err) {
    showExerciseError(err.message || "Oturum oluşturulamadı.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Oturum Başlat";
    }
  }
}
async function loadExerciseQuestions() {
  if (!exerciseSession) return;
  const data = await parseResponse(
    await exerciseApi(`/exercise-sessions/${exerciseSession.id}/questions`),
  );
  exerciseQuestions = Array.isArray(data.questions) ? data.questions : [];
  exerciseQuestions.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const unanswered = exerciseQuestions.findIndex((q) => !exerciseAttempts.has(q.questionVersionId));
  currentExerciseQuestionIndex =
    unanswered < 0 ? Math.max(0, exerciseQuestions.length - 1) : unanswered;
  renderExerciseQuestion();
  renderExerciseSession();
}
function renderExerciseQuestion() {
  const container = $("exercise-current-question");
  const counter = $("exercise-question-counter");
  const feedbackEl = $("exercise-attempt-feedback");
  const statusEl = $("exercise-attempt-status");
  if (!container) return;
  if (!exerciseQuestions.length) {
    container.innerHTML = '<p class="muted">Bu oturum için soru bulunmuyor.</p>';
    if (counter) counter.textContent = "";
    return;
  }
  const q = exerciseQuestions[currentExerciseQuestionIndex];
  if (!q) return;
  if (counter)
    counter.textContent = `Soru ${currentExerciseQuestionIndex + 1} / ${exerciseQuestions.length}`;
  if (feedbackEl) feedbackEl.style.display = "none";
  if (statusEl) statusEl.textContent = "";
  // student progress bar
  var isStudentLocal = isPlatformUser === false;
  if (isStudentLocal) {
    var progText = $("exercise-progress-text");
    var progBar = $("exercise-progress-bar");
    if (progText)
      progText.textContent = `Soru ${currentExerciseQuestionIndex + 1} / ${exerciseQuestions.length}`;
    if (progBar) {
      progBar.style.width = `${((currentExerciseQuestionIndex + 1) / exerciseQuestions.length) * 100}%`;
      progBar.parentElement.setAttribute("aria-valuenow", String(currentExerciseQuestionIndex + 1));
      progBar.parentElement.setAttribute("aria-valuemax", String(exerciseQuestions.length));
      progBar.parentElement.setAttribute("aria-valuetext", progText.textContent);
    }
  }
  // Soru verisi session endpoint'inden gelir; doğru cevap asla istemciye verilmez.
  void (async () => {
    try {
      const type = q.type;
      const disclosureSuffix = String(q.questionVersionId).replace(/[^a-zA-Z0-9_-]/g, "-");
      let html = "";
      if (isStudentLocal) {
        html += `<div class="student-exercise-content"><p id="exercise-prompt" tabindex="-1" style="font-size:16px; line-height:1.7; margin:0">${escapeHtml(q.prompt ?? "—")}</p></div>`;
        if (q.hint) {
          html += `<details class="exercise-hint" data-exercise-disclosure><summary data-exercise-disclosure-summary aria-controls="exercise-hint-${disclosureSuffix}">İpucunu göster</summary><p id="exercise-hint-${disclosureSuffix}">${escapeHtml(q.hint)}</p></details>`;
        }
        if (type === "MULTIPLE_CHOICE") {
          const opts = Array.isArray(q.options) ? q.options : [];
          html +=
            `<div class="stack" style="gap:12px" id="exercise-mc-options" role="radiogroup" aria-labelledby="exercise-prompt">` +
            opts
              .map(
                (o) =>
                  `<label class="answer-card" tabindex="0" role="radio" aria-checked="false"><input type="radio" name="exercise-mc" value="${escapeHtml(o.id)}" data-exercise-opt hidden><span>${escapeHtml(o.text)}</span></label>`,
              )
              .join("") +
            `</div>`;
        } else if (type === "TRUE_FALSE") {
          html += `<div role="radiogroup" aria-labelledby="exercise-prompt" style="display:grid; gap:12px; grid-template-columns:1fr 1fr"><label tabindex="0" role="radio" aria-checked="false" class="answer-card" style="justify-content:center; min-height:80px"><input type="radio" name="exercise-tf" value="true" data-exercise-tf hidden><span>Doğru</span></label><label tabindex="0" role="radio" aria-checked="false" class="answer-card" style="justify-content:center; min-height:80px"><input type="radio" name="exercise-tf" value="false" data-exercise-tf hidden><span>Yanlış</span></label></div>`;
        } else if (type === "OPEN_ENDED") {
          html += `<label class="field"><span>Cevabınız</span><textarea id="exercise-oe-answer" rows="4" placeholder="Cevabınızı yazın…" style="min-height:120px; border-radius:16px; padding:16px"></textarea></label>`;
        } else if (type === "MATCHING") {
          const opts = Array.isArray(q.options) ? q.options : [];
          const lefts = opts.filter((o) => o.matchGroup === "left");
          const rights = opts.filter((o) => o.matchGroup === "right");
          html +=
            `<div class="stack" id="exercise-matching-inputs" style="gap:12px">` +
            lefts
              .map(
                (o) =>
                  `<label class="field"><span>${escapeHtml(o.text)} eşleşmesi</span><select class="answer-card" style="padding:16px" data-exercise-match-left="${escapeHtml(o.id)}"><option value="">Seçin…</option>` +
                  rights
                    .map(
                      (r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.text)}</option>`,
                    )
                    .join("") +
                  `</select></label>`,
              )
              .join("") +
            `</div>`;
        } else if (type === "FILL_BLANK") {
          const blanks = Array.isArray(q.blankIds)
            ? q.blankIds.map((blankId) => ({ blankId }))
            : [];
          html +=
            `<div class="stack" id="exercise-blank-inputs" style="gap:12px">` +
            blanks
              .map(
                (b) =>
                  `<label class="field"><span>Boşluk ${escapeHtml(b.blankId)}</span><input type="text" data-exercise-blank="${escapeHtml(b.blankId)}" placeholder="Cevap" style="padding:16px; border-radius:16px; min-height:56px"></label>`,
              )
              .join("") +
            `</div>`;
        }
      } else {
        html += `<div class="info-item"><dt>Prompt</dt><dd>${escapeHtml(q.prompt ?? "—")}</dd></div>`;
        html += `<div class="info-item"><dt>Tip</dt><dd>${escapeHtml(type)}</dd></div>`;
        if (type === "MULTIPLE_CHOICE") {
          const opts = Array.isArray(q.options) ? q.options : [];
          const isMultiple = false;
          html +=
            `<div class="stack" id="exercise-mc-options">` +
            opts
              .map(
                (o) =>
                  `<label class="field"><span><input type="${isMultiple ? "checkbox" : "radio"}" name="exercise-mc" value="${escapeHtml(o.id)}" data-exercise-opt> ${escapeHtml(o.text)}</span></label>`,
              )
              .join("") +
            `</div>`;
        } else if (type === "TRUE_FALSE") {
          html += `<div class="stack"><label class="field"><span><input type="radio" name="exercise-tf" value="true" data-exercise-tf> Doğru</span></label><label class="field"><span><input type="radio" name="exercise-tf" value="false" data-exercise-tf> Yanlış</span></label></div>`;
        } else if (type === "OPEN_ENDED") {
          html += `<label class="field"><span>Cevabınız</span><textarea id="exercise-oe-answer" rows="3" placeholder="Cevabınızı yazın…"></textarea></label>`;
        } else if (type === "MATCHING") {
          const opts = Array.isArray(q.options) ? q.options : [];
          const lefts = opts.filter((o) => o.matchGroup === "left");
          const rights = opts.filter((o) => o.matchGroup === "right");
          html += `<div class="form-grid" style="grid-template-columns:1fr 1fr; gap:12px;">`;
          html +=
            `<div><strong>Sol</strong>` +
            lefts
              .map((o) => `<div class="muted">${escapeHtml(o.text)} (${escapeHtml(o.id)})</div>`)
              .join("") +
            `</div>`;
          html +=
            `<div><strong>Sağ</strong>` +
            rights
              .map((o) => `<div class="muted">${escapeHtml(o.text)} (${escapeHtml(o.id)})</div>`)
              .join("") +
            `</div>`;
          html += `</div>`;
          html +=
            `<div class="stack" id="exercise-matching-inputs">` +
            lefts
              .map(
                (o) =>
                  `<label class="field"><span>${escapeHtml(o.text)} eşleşmesi</span><select data-exercise-match-left="${escapeHtml(o.id)}"><option value="">Seçin…</option>` +
                  rights
                    .map(
                      (r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.text)}</option>`,
                    )
                    .join("") +
                  `</select></label>`,
              )
              .join("") +
            `</div>`;
        } else if (type === "FILL_BLANK") {
          const blanks = Array.isArray(q.blankIds)
            ? q.blankIds.map((blankId) => ({ blankId }))
            : [];
          html +=
            `<div class="stack" id="exercise-blank-inputs">` +
            blanks
              .map(
                (b) =>
                  `<label class="field"><span>Boşluk ${escapeHtml(b.blankId)}</span><input type="text" data-exercise-blank="${escapeHtml(b.blankId)}" placeholder="Cevap"></label>`,
              )
              .join("") +
            `</div>`;
        }
      }
      // Store current version for submit
      container.dataset.questionVersionId = q.questionVersionId;
      container.dataset.questionType = type;
      container.innerHTML = html;
      syncExerciseDisclosures(container);
      if (isStudentLocal) {
        const cards = [...container.querySelectorAll("label.answer-card")];
        cards.forEach((card, index) => {
          const input = card.querySelector("input");
          card.addEventListener("click", (event) => {
            event.preventDefault();
            if (exerciseBusy || exerciseAwaitingNext) return;
            input.checked = true;
            for (const c of cards) {
              const checked = c === card;
              c.classList.toggle("selected", checked);
              c.setAttribute("aria-checked", String(checked));
              c.tabIndex = checked ? 0 : -1;
            }
          });
          card.addEventListener("keydown", (event) => {
            if (
              ["Enter", " ", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)
            ) {
              event.preventDefault();
              if (exerciseBusy || exerciseAwaitingNext) return;
              const delta = ["ArrowRight", "ArrowDown"].includes(event.key)
                ? 1
                : ["ArrowLeft", "ArrowUp"].includes(event.key)
                  ? -1
                  : 0;
              const target = cards[(index + delta + cards.length) % cards.length];
              target.click();
              target.focus();
            }
          });
        });
        container.querySelector("#exercise-prompt")?.focus({ preventScroll: true });
      }
      exerciseAwaitingNext = false;
      $("exercise-attempt-error").classList.add("hidden");
      const button = $("exercise-submit-attempt");
      button.disabled = false;
      button.textContent = "Cevabı kontrol et";
      const previous = exerciseAttempts.get(q.questionVersionId);
      if (previous) showExerciseFeedback(previous);
    } catch (err) {
      container.innerHTML = `<p class="error">${escapeHtml(err.message || "Soru yüklenemedi.")}</p>`;
    }
  })();
}
function lockExerciseInputs(locked) {
  $("exercise-current-question")
    .querySelectorAll("input, textarea, select")
    .forEach((el) => {
      el.disabled = locked;
    });
  $("exercise-current-question")
    .querySelectorAll("label.answer-card")
    .forEach((el) => el.setAttribute("aria-disabled", String(locked)));
}
function syncExerciseDisclosures(root) {
  root.querySelectorAll("details[data-exercise-disclosure]").forEach((details) => {
    const summary = details.querySelector("[data-exercise-disclosure-summary]");
    if (!summary) return;
    const sync = () => summary.setAttribute("aria-expanded", String(details.open));
    details.addEventListener("toggle", sync);
    sync();
  });
}
function showExerciseFeedback(data) {
  const el = $("exercise-attempt-feedback");
  const question = exerciseQuestions.find((q) => q.questionVersionId === data.questionVersionId);
  const pending = data.isCorrect === null;
  const kind = pending ? "pending" : data.isCorrect === true ? "correct" : "wrong";
  const title = pending
    ? "⌛ Değerlendirme bekleniyor"
    : data.isCorrect === true
      ? "✅ Doğru!"
      : "💡 Tekrar düşün!";
  const event = exerciseGamification?.recentPointEvents?.find(
    (e) => e.sourceType === "ATTEMPT" && e.sourceId === data.id,
  );
  el.className = "feedback-panel " + kind;
  const disclosureSuffix = String(data.questionVersionId).replace(/[^a-zA-Z0-9_-]/g, "-");
  el.innerHTML = `<strong>${title}</strong><div id="exercise-feedback-xp">${event ? `+${event.points} XP` : ""}</div>${data.rawScore != null ? `<div>Puan: ${Number(data.rawScore).toFixed(2)}</div>` : ""}${data.feedback ? `<div>${escapeHtml(typeof data.feedback === "string" ? data.feedback : JSON.stringify(data.feedback))}</div>` : ""}${question?.explanation ? `<details class="exercise-explanation" data-exercise-disclosure><summary data-exercise-disclosure-summary aria-controls="exercise-explanation-${disclosureSuffix}">Kısa açıklamayı göster</summary><p id="exercise-explanation-${disclosureSuffix}">${escapeHtml(question.explanation)}</p></details>` : ""}`;
  syncExerciseDisclosures(el);
  el.style.display = "block";
  exerciseAwaitingNext = true;
  lockExerciseInputs(true);
  $("exercise-submit-attempt").textContent =
    currentExerciseQuestionIndex < exerciseQuestions.length - 1 ? "Devam Et" : "Tamamla";
}
async function handleExerciseSubmitAttempt() {
  const container = $("exercise-current-question");
  const errEl = $("exercise-attempt-error");
  if (
    !container ||
    !exerciseSession ||
    exerciseBusy ||
    exerciseLoading ||
    exerciseSession.status !== "IN_PROGRESS"
  )
    return;
  if (exerciseAwaitingNext) {
    if (currentExerciseQuestionIndex === exerciseQuestions.length - 1) {
      await handleExerciseComplete();
      return;
    }
    currentExerciseQuestionIndex++;
    renderExerciseQuestion();
    return;
  }
  errEl.classList.add("hidden");
  const questionVersionId = container.dataset.questionVersionId;
  const type = container.dataset.questionType;
  if (!questionVersionId || !type) return;
  let answer;
  try {
    if (type === "MULTIPLE_CHOICE") {
      const checked = Array.from(container.querySelectorAll("[data-exercise-opt]:checked")).map(
        (el) => el.value,
      );
      if (checked.length === 0) throw new Error("En az bir seçenek seçin.");
      answer = checked;
    } else if (type === "TRUE_FALSE") {
      const sel = container.querySelector("[data-exercise-tf]:checked");
      if (!sel) throw new Error("Doğru/Yanlış seçin.");
      answer = sel.value === "true";
    } else if (type === "OPEN_ENDED") {
      const val = (container.querySelector("#exercise-oe-answer")?.value ?? "").trim();
      if (!val) throw new Error("Cevap boş olamaz.");
      answer = val;
    } else if (type === "MATCHING") {
      const inputs = container.querySelectorAll("[data-exercise-match-left]");
      const obj = {};
      for (const sel of inputs) {
        const leftId = sel.getAttribute("data-exercise-match-left");
        const rightId = sel.value;
        if (!rightId) throw new Error("Tüm eşleşmeleri seçin.");
        obj[leftId] = rightId;
      }
      answer = obj;
    } else if (type === "FILL_BLANK") {
      const inputs = container.querySelectorAll("[data-exercise-blank]");
      const obj = {};
      for (const inp of inputs) {
        const blankId = inp.getAttribute("data-exercise-blank");
        const val = inp.value.trim();
        if (!val) throw new Error(`Boşluk ${blankId} için cevap girin.`);
        obj[blankId] = val;
      }
      answer = obj;
    } else {
      throw new Error("Bilinmeyen soru tipi");
    }
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
    return;
  }

  const btn = $("exercise-submit-attempt");
  exerciseBusy = true;
  btn.disabled = true;
  btn.textContent = "Gönderiliyor…";
  lockExerciseInputs(true);
  const sessionId = exerciseSession.id;
  // Reuse the exact logical request after an uncertain network failure.
  const retry =
    exerciseRequest?.sessionId === sessionId &&
    exerciseRequest?.questionVersionId === questionVersionId;
  if (!retry)
    exerciseRequest = {
      sessionId,
      questionVersionId,
      answer,
      clientAttemptId: crypto.randomUUID(),
    };
  try {
    let data;
    if (retry && isPlatformUser === false) {
      const session = await fetchStudentExercise(sessionId);
      data = session.attempts.find((a) => a.questionVersionId === questionVersionId);
    }
    if (!data) {
      const { clientAttemptId, answer: submittedAnswer } = exerciseRequest;
      const response = await exerciseApi(`/questions/${questionVersionId}/attempts`, {
        method: "POST",
        body: JSON.stringify({ sessionId, answer: submittedAnswer, clientAttemptId }),
      });
      // A replay can return 409: reconcile from the server, never manufacture success.
      if (response.status === 409 && isPlatformUser === false) {
        const session = await fetchStudentExercise(sessionId);
        data = session.attempts.find((a) => a.questionVersionId === questionVersionId);
        if (!data) await parseResponse(response);
      } else data = await parseResponse(response);
    }
    if (!data?.id || ![true, false, null].includes(data.isCorrect))
      throw new Error("Geçersiz cevap yanıtı");
    exerciseAttempts.set(questionVersionId, data);
    exerciseRequest = null;
    showExerciseFeedback(data);
    if (data.isCorrect === false) {
      showCelebration({
        icon: "💡",
        eyebrow: "DEVAM ET",
        title: "Tekrar düşün!",
        detail: data.feedback || "Bu cevap öğrenmenin bir parçası.",
        kind: "wrong",
        key: "attempt-" + data.id,
      });
    }
    if (isPlatformUser === false) {
      void refreshExerciseGamification().then(() => {
        if (
          exerciseSession?.id === sessionId &&
          exerciseAwaitingNext &&
          exerciseQuestions[currentExerciseQuestionIndex]?.questionVersionId === questionVersionId
        ) {
          const event = exerciseGamification?.recentPointEvents?.find(
            (e) => e.sourceType === "ATTEMPT" && e.sourceId === data.id,
          );
          const xp = $("exercise-feedback-xp");
          if (xp) xp.textContent = event ? "+" + event.points + " XP" : "";
          if (data.isCorrect === true) {
            showCelebration({
              icon: "✓",
              eyebrow: "DOĞRU CEVAP",
              title: "Harika iş!",
              detail: "Bir adım daha ileri gittin.",
              reward: event ? "+" + event.points + " XP" : "",
              key: "attempt-" + data.id,
            });
          }
        }
      });
    }
  } catch (err) {
    if (isPremiumLimitError(err)) {
      errEl.classList.add("hidden");
      return;
    }
    if (err.status && err.status < 500 && err.status !== 409) exerciseRequest = null;
    errEl.textContent =
      "Cevap gönderilemedi. Cevabın korunuyor; tekrar denediğinde önceki gönderim kontrol edilecek.";
    errEl.classList.remove("hidden");
    btn.textContent = "Tekrar dene";
    lockExerciseInputs(exerciseRequest !== null);
  } finally {
    exerciseBusy = false;
    btn.disabled = false;
  }
}
async function handleExerciseComplete() {
  if (!exerciseSession || exerciseBusy || exerciseSession.status !== "IN_PROGRESS") return;
  exerciseBusy = true;
  const student = isPlatformUser === false;
  const btn = $(student ? "exercise-submit-attempt" : "exercise-complete-btn");
  const errEl = $(student ? "exercise-attempt-error" : "exercise-complete-error");
  errEl.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Tamamlanıyor…";
  try {
    // The prior completion response might have been lost. GET is source of truth.
    const fresh = student ? await fetchStudentExercise(exerciseSession.id) : null;
    exerciseSession =
      fresh?.status === "COMPLETED"
        ? fresh
        : await parseResponse(
            await exerciseApi(`/exercise-sessions/${exerciseSession.id}/complete`, {
              method: "POST",
              body: "{}",
            }),
          );
    if (student) {
      const isAssessment = Boolean(exerciseSession.assessmentId);
      const beforeBadges = new Set((exerciseGamification?.badges || []).map((badge) => badge.id));
      const gamification = await refreshExerciseGamification();
      const freshBadges = insightNewAwards.get(insightsIdentity) || new Set();
      const newBadge = (gamification?.badges || []).find(
        (badge) => !beforeBadges.has(badge.id) || freshBadges.has(badge.id),
      );
      const reward = [
        gamification ? gamification.totalPoints + " toplam XP" : "",
        gamification ? "🔥 " + gamification.currentDays + " günlük seri" : "",
        newBadge ? "🏆 " + newBadge.name : "",
      ]
        .filter(Boolean)
        .join(" · ");
      showCelebration({
        icon: newBadge ? "🏆" : "🎉",
        eyebrow: newBadge
          ? "YENİ ROZET"
          : isAssessment
            ? "DEĞERLENDİRME TAMAMLANDI"
            : "ÇALIŞMA TAMAMLANDI",
        title: newBadge
          ? "Rozeti kazandın!"
          : isAssessment
            ? "Değerlendirme tamamlandı!"
            : "Harika, çalışmayı tamamladın!",
        detail: newBadge
          ? newBadge.description || "Emeğin görünür oldu."
          : isAssessment
            ? "Gerçek sonuçların kaydedildi; öğrenme yolundaki bir sonraki adımın hazır."
            : "Öğrenme yolunda bir adım daha.",
        reward,
        kind: newBadge ? "badge" : "completion",
        major: true,
        key: "completion-" + exerciseSession.id,
      });
    }
    renderExerciseSession();
    $("exercise-completion-title")?.focus();
  } catch {
    errEl.textContent = "Alıştırma tamamlanamadı. Cevapların kaydedildi; tekrar dene.";
    errEl.classList.remove("hidden");
    exerciseAwaitingNext = true;
  } finally {
    exerciseBusy = false;
    btn.disabled = false;
    btn.textContent = student ? "Tekrar dene" : "Oturumu Tamamla";
  }
}
function setupExerciseEvents() {
  $("exercise-back-btn").addEventListener("click", returnToExercisePath);
  $("exercise-retry-load").addEventListener("click", () => void loadExercisePage());
  const createBtn = $("exercise-create-btn");
  if (createBtn) createBtn.addEventListener("click", handleExerciseCreate);
  const refreshBtn = $("exercise-refresh-templates-btn");
  if (refreshBtn)
    refreshBtn.addEventListener("click", () => {
      void populateExerciseTemplateVersionSelect();
      void populateExerciseStudentSelect();
    });
  const completeBtn = $("exercise-complete-btn");
  if (completeBtn) completeBtn.addEventListener("click", handleExerciseComplete);
  const loadQBtn = $("exercise-load-questions-btn");
  if (loadQBtn) loadQBtn.addEventListener("click", () => void loadExerciseQuestions());
  const submitBtn = $("exercise-submit-attempt");
  if (submitBtn) submitBtn.addEventListener("click", handleExerciseSubmitAttempt);
  const prevBtn = $("exercise-prev-question");
  if (prevBtn)
    prevBtn.addEventListener("click", () => {
      if (currentExerciseQuestionIndex > 0) {
        currentExerciseQuestionIndex--;
        renderExerciseQuestion();
      }
    });
  const nextBtn = $("exercise-next-question");
  if (nextBtn)
    nextBtn.addEventListener("click", () => {
      if (currentExerciseQuestionIndex < exerciseQuestions.length - 1) {
        currentExerciseQuestionIndex++;
        renderExerciseQuestion();
      }
    });
}

function setupPremiumExperienceEvents() {
  document.addEventListener("click", (event) => {
    const target =
      event.target instanceof Element ? event.target.closest("[data-premium-action]") : null;
    if (!target) return;
    const action = target.getAttribute("data-premium-action");
    if (action === "OPEN_BILLING_ACCOUNT") {
      event.preventDefault();
      const dialog = $("premium-paywall-dialog");
      if (dialog?.open) dialog.close();
      navigate("billing-account");
      return;
    }
    if (action !== "OPEN_PREMIUM_INFO") return;
    event.preventDefault();
    const dialog = $("premium-paywall-dialog");
    if (dialog?.open) dialog.close();
    recordPremiumTelemetry("PREMIUM_CTA_CLICKED");
    navigate("premium-info");
  });

  const closePaywall = () => {
    const dialog = $("premium-paywall-dialog");
    if (dialog?.open) dialog.close();
    else dialog?.classList.add("hidden");
  };
  $("premium-paywall-close")?.addEventListener("click", closePaywall);
  $("premium-paywall-close-secondary")?.addEventListener("click", closePaywall);
  $("premium-info-back")?.addEventListener("click", () => navigate("dashboard"));
  $("billing-account-back")?.addEventListener("click", () => navigate("premium-info"));
  $("premium-checkout-start")?.addEventListener("click", () => void startPremiumSandboxCheckout());
  $("billing-account-checkout-start")?.addEventListener(
    "click",
    () =>
      void startPremiumSandboxCheckout({
        account: true,
        start: $("billing-account-checkout-start"),
        status: $("billing-account-state"),
        feedback: $("billing-account-management"),
      }),
  );
  $("premium-subscription-cancel")?.addEventListener("click", () =>
    openBillingCancellationDialog(),
  );
  $("billing-account-cancel")?.addEventListener("click", openBillingCancellationDialog);
  $("billing-account-refresh")?.addEventListener("click", () => void loadBillingAccount());
  $("billing-cancel-close")?.addEventListener("click", closeBillingCancellationDialog);
  $("billing-cancel-secondary")?.addEventListener("click", closeBillingCancellationDialog);
  $("billing-cancel-confirm")?.addEventListener("click", () => void submitBillingCancellation());
  $("billing-cancel-dialog")?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeBillingCancellationDialog();
  });
  window.addEventListener("focus", () => {
    if (!$("page-billing-account")?.classList.contains("hidden")) void loadBillingAccount();
  });
}

function setupCelebrationEvents() {
  document.addEventListener(
    "pointerdown",
    () => {
      rewardAudioPrimed = true;
    },
    { once: true },
  );
  document.addEventListener(
    "keydown",
    () => {
      rewardAudioPrimed = true;
    },
    { once: true },
  );
  $("celebration-close")?.addEventListener("click", hideCelebration);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("celebration-layer")?.classList.contains("hidden"))
      hideCelebration();
  });
  const toggle = $("sound-effects-toggle");
  if (toggle) {
    toggle.checked = soundEffectsEnabled();
    toggle.addEventListener("change", () => {
      localStorage.setItem(STORAGE_KEYS.soundEffects, String(toggle.checked));
      rewardAudioPrimed = true;
      if (toggle.checked) playRewardSound("success");
    });
  }
}

async function populateContentFormTenantSelect() {
  const select = $("content-form-tenant");
  select.innerHTML = `<option value="">Kurum seçin…</option>`;
  try {
    const res = await fetch("/admin/tenants?page=1&pageSize=100", {
      headers: authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId),
    });
    const body = await parseResponse(res);
    const options = body.items
      .map(
        (t) =>
          `<option value="${t.id}">${escapeHtml(t.name)} (${tenantTypeLabel(t.type)})</option>`,
      )
      .join("");
    select.innerHTML = options
      ? `<option value="">Kurum seçin…</option>${options}`
      : `<option value="">Kurum bulunamadı</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Kurumlar yüklenemedi</option>`;
  }
}

function openContentForm(mode, content = null) {
  contentFormMode = mode;
  contentEditingId = content?.id ?? null;
  $("content-form-title").textContent = mode === "create" ? "Yeni İçerik" : "İçeriği düzenle";

  const isCreate = mode === "create";
  $("content-form-scope-field").classList.toggle("hidden", !isCreate);
  $("content-form-type-field").classList.toggle("hidden", !isCreate);
  $("content-form-status-field").classList.toggle("hidden", !isCreate);

  if (isCreate) {
    $("content-form-scope").value = "GLOBAL";
    $("content-form-tenant-field").classList.add("hidden");
    $("content-form-tenant").innerHTML = `<option value="">Kurum seçin…</option>`;
    $("content-form-type").innerHTML = `<option value="">Tür seçin…</option>`;
    for (const [value, label] of Object.entries(CONTENT_TYPE_LABELS)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      $("content-form-type").appendChild(opt);
    }
    $("content-form-title-input").value = "";
    $("content-form-difficulty").value = "";
    $("content-form-status").value = "DRAFT";
    void populateContentFormTenantSelect();
  } else if (content) {
    $("content-form-title-input").value = content.title ?? "";
    $("content-form-difficulty").value = content.difficulty ?? "";
  }

  $("content-form-error").classList.add("hidden");
  $("content-form-modal").classList.remove("hidden");
  $("content-form-title-input").focus();
}

function closeContentForm() {
  $("content-form-modal").classList.add("hidden");
}

function setContentFormLoading(isLoading) {
  const btn = $("content-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}

async function submitContentForm(event) {
  event.preventDefault();
  const errorEl = $("content-form-error");
  errorEl.classList.add("hidden");

  const title = $("content-form-title-input").value.trim();
  const difficulty = Number($("content-form-difficulty").value);

  if (!title) {
    errorEl.textContent = "İçerik başlığı gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!Number.isFinite(difficulty) || difficulty < 0 || difficulty > 1) {
    errorEl.textContent = "Zorluk 0 ile 1 arasında bir sayı olmalıdır.";
    errorEl.classList.remove("hidden");
    return;
  }

  const isCreate = contentFormMode === "create";
  const payload = { title, difficulty };

  if (isCreate) {
    const scope = $("content-form-scope").value;
    const type = $("content-form-type").value;
    if (!type) {
      errorEl.textContent = "Tür gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (scope === "TENANT" && !$("content-form-tenant").value) {
      errorEl.textContent = "Kurum kapsamı için kurum seçilmelidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    payload.type = type;
    payload.status = $("content-form-status").value;
    if (scope === "TENANT") {
      payload.tenantId = $("content-form-tenant").value;
    } else {
      payload.tenantId = null;
    }
  }

  setContentFormLoading(true);
  try {
    const res = isCreate
      ? await contentApi("/contents", { method: "POST", body: JSON.stringify(payload) })
      : await contentApi(`/contents/${encodeURIComponent(contentEditingId)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
    await parseResponse(res);
    closeContentForm();
    contentPage = 1;
    await loadContents();
  } catch (err) {
    errorEl.textContent = err.message || "Kayıt başarısız.";
    errorEl.classList.remove("hidden");
  } finally {
    setContentFormLoading(false);
  }
}

async function openContentDetail(id) {
  const modal = $("content-detail-modal");
  $("content-detail-body").innerHTML = '<p class="muted">Yükleniyor…</p>';
  modal.classList.remove("hidden");

  try {
    const res = await contentApi(`/contents/${encodeURIComponent(id)}`);
    const detail = await parseResponse(res);
    contentDetailCurrent = detail;
    contentDetailSkills = detail.skills ?? [];
    renderContentDetail(detail);
    void loadContentVersions(id);
  } catch (err) {
    contentDetailCurrent = null;
    $("content-detail-body").innerHTML =
      `<p class="error">${escapeHtml(err.message || "Detay yüklenemedi.")}</p>`;
  }
}

function renderContentDetail(d) {
  $("content-detail-title").textContent = d.title;

  const currentVersion = d.currentVersion
    ? `
      <div class="version-row">
        <div class="version-row-meta">
          <strong>v${d.currentVersion.version}</strong>
          ${versionStatusBadge(d.currentVersion.status)}
          <span>${escapeHtml(d.currentVersion.title)}</span>
          <span class="muted">${d.currentVersion.wordCount ?? 0} kelime</span>
        </div>
        <div class="version-row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-version-view="${d.currentVersion.id}">Görüntüle</button>
        </div>
      </div>`
    : '<p class="muted">Henüz yayınlanmış sürüm yok.</p>';

  const skillChips = d.skills.length
    ? d.skills
        .map(
          (s) =>
            `<span class="chip chip-info">${escapeHtml(s.name)} (${escapeHtml(s.code)})<button type="button" class="chip-remove" data-skill-remove="${s.id}" aria-label="Beceriyi çıkar">✕</button></span>`,
        )
        .join("")
    : '<span class="muted">Bu içeriğe bağlı beceri yok.</span>';

  $("content-detail-body").innerHTML = `
    <section class="detail-section">
      <h4>İçerik Bilgileri</h4>
      <dl class="info-grid">
        <div class="info-item"><dt>Başlık</dt><dd>${escapeHtml(d.title)}</dd></div>
        <div class="info-item"><dt>Kapsam</dt><dd>${scopeBadge(d.tenantId)}</dd></div>
        <div class="info-item"><dt>Tür</dt><dd>${escapeHtml(contentTypeLabel(d.type))}</dd></div>
        <div class="info-item"><dt>Zorluk</dt><dd>${difficultyLabel(d.difficulty)}</dd></div>
        <div class="info-item"><dt>Durum</dt><dd>${contentStatusBadge(d.status)}</dd></div>
        <div class="info-item"><dt>Sürüm sayısı</dt><dd>${d.versionCount}</dd></div>
        <div class="info-item"><dt>Soru sayısı</dt><dd>${d.questionCount}</dd></div>
        <div class="info-item"><dt>Beceri sayısı</dt><dd>${d.skillCount}</dd></div>
        <div class="info-item"><dt>Oluşturulma</dt><dd>${new Date(d.createdAt).toLocaleDateString("tr-TR")}</dd></div>
        <div class="info-item"><dt>Güncellenme</dt><dd>${new Date(d.updatedAt).toLocaleDateString("tr-TR")}</dd></div>
      </dl>
    </section>

    <section class="detail-section">
      <div class="enrollment-add-row">
        <h4 style="margin:0">Mevcut Sürüm</h4>
        <button id="content-new-version-btn" type="button" class="btn btn-primary btn-sm">Yeni Sürüm</button>
      </div>
      ${currentVersion}
    </section>

    <section class="detail-section">
      <h4>Beceriler</h4>
      <div class="enrollment-add-row">
        <label class="field">
          <span>Beceri ekle</span>
          <select id="content-skill-picker"><option value="">Yükleniyor…</option></select>
        </label>
        <button data-content-skill-add type="button" class="btn btn-ghost">Ekle</button>
      </div>
      <div class="chip-list">${skillChips}</div>
    </section>

    <section class="detail-section">
      <h4>Sürüm Geçmişi</h4>
      <div id="content-version-history"><p class="muted">Yükleniyor…</p></div>
    </section>

    <section class="detail-section">
      <h4>İçerik Durumu</h4>
      <div class="enrollment-add-row">
        <label class="field">
          <span>Durum</span>
          <select id="content-detail-status">
            <option value="DRAFT" ${d.status === "DRAFT" ? "selected" : ""}>Taslak</option>
            <option value="PUBLISHED" ${d.status === "PUBLISHED" ? "selected" : ""}>Yayında</option>
            <option value="ARCHIVED" ${d.status === "ARCHIVED" ? "selected" : ""}>Arşivlenmiş</option>
          </select>
        </label>
        <button data-content-status-apply type="button" class="btn btn-ghost">Uygula</button>
      </div>
      <p class="muted field-hint">
        "Yayında" durumu için içeriğin yayınlanmış bir sürümü olmalıdır. "Arşivlenmiş" içerik
        yalnızca "Taslak" durumuna geri alınabilir. İçeriği tamamen silmek için "İçeriği Sil"
        butonunu kullanın (soft-delete; sürüm geçmişi korunur).
      </p>
    </section>`;

  void populateContentSkillPicker();
}

async function populateContentSkillPicker() {
  const select = $("content-skill-picker");
  if (!select || !contentDetailCurrent) return;
  try {
    const res = await contentApi("/skills?page=1&pageSize=100");
    const body = await parseResponse(res);
    const currentIds = new Set(contentDetailSkills.map((s) => s.id));
    const options = body.items
      .filter((s) => !currentIds.has(s.id))
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.code)})</option>`)
      .join("");
    select.innerHTML = options
      ? `<option value="">Beceri seçin…</option>${options}`
      : `<option value="">Eklenecek beceri yok</option>`;
  } catch (_e) {
    void _e;
    select.innerHTML = `<option value="">Beceriler yüklenemedi</option>`;
  }
}

async function loadContentVersions(contentId) {
  const container = $("content-version-history");
  if (!container) return;
  container.innerHTML = '<p class="muted">Yükleniyor…</p>';
  try {
    const res = await contentApi(`/contents/${encodeURIComponent(contentId)}/versions`);
    const versions = await parseResponse(res);
    contentDetailVersions = versions;
    renderVersionHistory();
  } catch (err) {
    container.innerHTML = `<p class="error">${escapeHtml(err.message || "Sürümler yüklenemedi.")}</p>`;
  }
}

function renderVersionHistory() {
  const container = $("content-version-history");
  if (!container) return;
  if (contentDetailVersions.length === 0) {
    container.innerHTML = '<p class="muted">Bu içerik için henüz sürüm oluşturulmadı.</p>';
    return;
  }

  container.innerHTML = contentDetailVersions
    .map(
      (v) => `
    <div class="version-row">
      <div class="version-row-meta">
        <strong>v${v.version}</strong>
        ${versionStatusBadge(v.status)}
        <span>${escapeHtml(v.title)}</span>
        <span class="muted">${v.wordCount ?? 0} kelime</span>
        <span class="muted">${v.createdByName ? escapeHtml(v.createdByName) : "—"} · ${new Date(v.createdAt).toLocaleDateString("tr-TR")}</span>
      </div>
      <div class="version-row-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-version-view="${v.id}">Görüntüle</button>
        ${v.status !== "PUBLISHED" ? `<button type="button" class="btn btn-ghost btn-sm" data-version-edit="${v.id}">Düzenle</button>` : ""}
        ${v.status === "DRAFT" ? `<button type="button" class="btn btn-ghost btn-sm" data-version-review="${v.id}">İncelemeye Al</button>` : ""}
        ${v.status === "DRAFT" || v.status === "REVIEW" ? `<button type="button" class="btn btn-primary btn-sm" data-version-publish="${v.id}">Yayınla</button>` : ""}
      </div>
    </div>`,
    )
    .join("");
}

async function openVersionForm(mode, version = null) {
  $("version-form-title").textContent = mode === "new" ? "Yeni Sürüm" : "Sürümü düzenle";
  $("version-form-title-input").value = version?.title ?? "";
  $("version-form-body").value = version?.body ?? "";
  $("version-form-license").value = version?.license ?? "";
  $("version-form-changelog").value = version?.changelog ?? "";
  updateVersionWordCount();
  $("version-form-error").classList.add("hidden");
  $("version-form-modal").classList.remove("hidden");
  $("version-form-title-input").focus();
}

function closeVersionForm() {
  $("version-form-modal").classList.add("hidden");
}

function updateVersionWordCount() {
  const text = $("version-form-body")?.value ?? "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const el = $("version-form-wordcount");
  if (el) el.textContent = `${words} kelime`;
}

function setVersionFormLoading(isLoading) {
  const btn = $("version-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}

async function submitVersionForm(event) {
  event.preventDefault();
  const errorEl = $("version-form-error");
  errorEl.classList.add("hidden");

  const contentId = contentDetailCurrent?.id;
  if (!contentId) {
    errorEl.textContent = "İçerik bilgisi yüklenemedi.";
    errorEl.classList.remove("hidden");
    return;
  }

  const payload = {
    title: $("version-form-title-input").value.trim() || undefined,
    body: $("version-form-body").value,
    license: $("version-form-license").value.trim() || null,
    changelog: $("version-form-changelog").value.trim() || null,
  };

  if (!payload.body || !payload.body.trim()) {
    errorEl.textContent = "Metin gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }

  const mode = window.__versionFormMode ?? "new";
  setVersionFormLoading(true);
  try {
    const res =
      mode === "new"
        ? await contentApi(`/contents/${encodeURIComponent(contentId)}/versions`, {
            method: "POST",
            body: JSON.stringify(payload),
          })
        : await contentApi(`/content-versions/${encodeURIComponent(window.__versionFormId)}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
    await parseResponse(res);
    closeVersionForm();
    await openContentDetail(contentId);
    await loadContents();
  } catch (err) {
    errorEl.textContent = err.message || "Sürüm kaydedilemedi.";
    errorEl.classList.remove("hidden");
  } finally {
    setVersionFormLoading(false);
  }
}

async function viewVersion(versionId) {
  const modal = $("version-detail-modal");
  $("version-detail-body").innerHTML = '<p class="muted">Yükleniyor…</p>';
  modal.classList.remove("hidden");
  try {
    const res = await contentApi(`/content-versions/${encodeURIComponent(versionId)}`);
    const v = await parseResponse(res);
    $("version-detail-title").textContent = `v${v.version} — ${v.title}`;
    $("version-detail-body").innerHTML = `
      <dl class="info-grid">
        <div class="info-item"><dt>Sürüm</dt><dd>v${v.version}</dd></div>
        <div class="info-item"><dt>Durum</dt><dd>${versionStatusBadge(v.status)}</dd></div>
        <div class="info-item"><dt>Kelime sayısı</dt><dd>${v.wordCount ?? 0}</dd></div>
        <div class="info-item"><dt>Yayınlanma</dt><dd>${v.publishedAt ? new Date(v.publishedAt).toLocaleString("tr-TR") : "—"}</dd></div>
        <div class="info-item"><dt>Oluşturan</dt><dd>${v.createdByName ? escapeHtml(v.createdByName) : "—"}</dd></div>
        <div class="info-item"><dt>Oluşturulma</dt><dd>${new Date(v.createdAt).toLocaleDateString("tr-TR")}</dd></div>
      </dl>
      ${v.license ? `<p><strong>Lisans:</strong> ${escapeHtml(v.license)}</p>` : ""}
      ${v.changelog ? `<p><strong>Değişiklik notu:</strong> ${escapeHtml(v.changelog)}</p>` : ""}
      <h4>Metin</h4>
      <div class="version-body-view">${escapeHtml(v.body)}</div>`;
  } catch (err) {
    $("version-detail-body").innerHTML =
      `<p class="error">${escapeHtml(err.message || "Sürüm yüklenemedi.")}</p>`;
  }
}

async function reviewVersion(versionId) {
  const contentId = contentDetailCurrent?.id;
  if (!contentId) return;
  try {
    const res = await contentApi(`/content-versions/${encodeURIComponent(versionId)}/review`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await parseResponse(res);
    await openContentDetail(contentId);
  } catch (err) {
    showContentError(err.message || "Sürüm incelemeye alınamadı.");
  }
}

async function publishVersion(versionId) {
  const contentId = contentDetailCurrent?.id;
  if (!contentId) return;
  if (!window.confirm("Bu sürümü yayınlamak istediğinize emin misiniz?")) return;
  try {
    const res = await contentApi(`/content-versions/${encodeURIComponent(versionId)}/publish`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await parseResponse(res);
    await openContentDetail(contentId);
    await loadContents();
  } catch (err) {
    showContentError(err.message || "Sürüm yayınlanamadı.");
  }
}

async function updateContentSkills(skillIds) {
  const contentId = contentDetailCurrent?.id;
  if (!contentId) return;
  try {
    const res = await contentApi(`/contents/${encodeURIComponent(contentId)}/skills`, {
      method: "PUT",
      body: JSON.stringify({ skillIds }),
    });
    const detail = await parseResponse(res);
    contentDetailCurrent = detail;
    contentDetailSkills = detail.skills ?? [];
    renderContentDetail(detail);
    void loadContentVersions(contentId);
  } catch (err) {
    showContentError(err.message || "Beceri bağlantıları güncellenemedi.");
  }
}

async function addContentSkill() {
  const picker = $("content-skill-picker");
  if (!picker || !contentDetailCurrent) return;
  const skillId = picker.value;
  if (!skillId) {
    showContentError("Lütfen bir beceri seçin.");
    return;
  }
  const next = contentDetailSkills.map((s) => s.id);
  next.push(skillId);
  await updateContentSkills(next);
}

async function removeContentSkill(skillId) {
  if (!contentDetailCurrent) return;
  const next = contentDetailSkills.filter((s) => s.id !== skillId).map((s) => s.id);
  await updateContentSkills(next);
}

async function applyContentStatus(contentId) {
  const status = $("content-detail-status")?.value;
  if (!status || !contentDetailCurrent) return;
  if (status === contentDetailCurrent.status) return;
  try {
    const res = await contentApi(`/contents/${encodeURIComponent(contentId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await parseResponse(res);
    await openContentDetail(contentId);
    await loadContents();
  } catch (err) {
    showContentError(err.message || "İçerik durumu güncellenemedi.");
  }
}

async function deleteContent(contentId) {
  const content = contentData.find((c) => c.id === contentId);
  const label = content ? content.title : contentId;
  if (
    !window.confirm(
      `"${label}" içeriğini silmek istediğinize emin misiniz? Bu işlem sürüm geçmişini korur; içerik listeden kaybolur.`,
    )
  )
    return;
  try {
    const res = await contentApi(`/contents/${encodeURIComponent(contentId)}`, {
      method: "DELETE",
    });
    await parseResponse(res);
    $("content-detail-modal").classList.add("hidden");
    contentPage = 1;
    await loadContents();
  } catch (err) {
    showContentError(err.message || "İçerik silinemedi.");
  }
}

// ---------- Beceri kataloğu ----------

async function loadSkills() {
  hideSkillError();
  const tbody = $("skill-list-body");
  tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Yükleniyor…</td></tr>';

  const search = $("skill-search").value.trim();
  const category = $("skill-category-filter").value;
  const params = new URLSearchParams({
    page: skillPage,
    pageSize: SKILL_PAGE_SIZE,
  });
  if (search) params.set("search", search);
  if (category) params.set("category", category);

  try {
    const res = await contentApi(`/skills?${params.toString()}`);
    const body = await parseResponse(res);
    skillData = body.items;
    skillTotal = body.total;
    renderSkillList();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">—</td></tr>';
    showSkillError(err.message || "Beceriler yüklenemedi.");
  }
}

function showSkillError(message) {
  const el = $("skill-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideSkillError() {
  $("skill-error").classList.add("hidden");
}

function populateSkillCategoryFilter() {
  const select = $("skill-category-filter");
  const options = Object.entries(SKILL_CATEGORY_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  select.innerHTML = `<option value="">Tüm kategoriler</option>${options}`;
}

function renderSkillList() {
  const tbody = $("skill-list-body");

  if (skillData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Beceri bulunamadı.</td></tr>';
  } else {
    tbody.innerHTML = skillData
      .map(
        (s) => `
      <tr>
        <td><code>${escapeHtml(s.code)}</code></td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(skillCategoryLabel(s.category))}</td>
        <td class="numeric">${s.displayOrder ?? 0}</td>
        <td class="numeric">${s.contentCount ?? 0}</td>
        <td class="text-right">
          <button type="button" class="btn btn-ghost btn-sm" data-skill-edit-id="${s.id}">Düzenle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-skill-delete-id="${s.id}">Sil</button>
        </td>
      </tr>`,
      )
      .join("");
  }

  const totalPages = Math.max(1, Math.ceil(skillTotal / SKILL_PAGE_SIZE));
  $("skill-page-info").textContent = `${skillTotal} beceri · sayfa ${skillPage}/${totalPages}`;
  $("skill-prev-btn").disabled = skillPage <= 1;
  $("skill-next-btn").disabled = skillPage >= totalPages;
}

function openSkillForm(mode, skill = null) {
  skillFormMode = mode;
  skillEditingId = skill?.id ?? null;
  $("skill-form-title").textContent = mode === "create" ? "Yeni Beceri" : "Beceriyi düzenle";
  $("skill-form-code").value = skill?.code ?? "";
  $("skill-form-name").value = skill?.name ?? "";
  $("skill-form-category").value = skill?.category ?? "";
  $("skill-form-description").value = skill?.description ?? "";
  $("skill-form-display-order").value = skill?.displayOrder ?? 0;
  if ($("skill-form-category").options.length <= 1) {
    for (const [value, label] of Object.entries(SKILL_CATEGORY_LABELS)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      $("skill-form-category").appendChild(opt);
    }
  }
  $("skill-form-error").classList.add("hidden");
  $("skill-form-modal").classList.remove("hidden");
  $("skill-form-code").focus();
}

function closeSkillForm() {
  $("skill-form-modal").classList.add("hidden");
}

function setSkillFormLoading(isLoading) {
  const btn = $("skill-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}

async function submitSkillForm(event) {
  event.preventDefault();
  const errorEl = $("skill-form-error");
  errorEl.classList.add("hidden");

  const payload = {
    code: $("skill-form-code").value.trim(),
    name: $("skill-form-name").value.trim(),
    category: $("skill-form-category").value,
    description: $("skill-form-description").value.trim() || null,
    displayOrder: Number($("skill-form-display-order").value) || 0,
  };

  if (!payload.code) {
    errorEl.textContent = "Kod gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!payload.name) {
    errorEl.textContent = "Ad gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!payload.category) {
    errorEl.textContent = "Kategori gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }

  setSkillFormLoading(true);
  try {
    const res =
      skillFormMode === "create"
        ? await contentApi("/skills", { method: "POST", body: JSON.stringify(payload) })
        : await contentApi(`/skills/${encodeURIComponent(skillEditingId)}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
    await parseResponse(res);
    closeSkillForm();
    skillPage = 1;
    await loadSkills();
    void populateContentFilters();
  } catch (err) {
    errorEl.textContent = err.message || "Beceri kaydedilemedi.";
    errorEl.classList.remove("hidden");
  } finally {
    setSkillFormLoading(false);
  }
}

async function deleteSkill(skillId) {
  const skill = skillData.find((s) => s.id === skillId);
  const label = skill ? `${skill.name} (${skill.code})` : skillId;
  if (!window.confirm(`"${label}" becerisini silmek istediğinize emin misiniz?`)) return;
  try {
    const res = await contentApi(`/skills/${encodeURIComponent(skillId)}`, { method: "DELETE" });
    await parseResponse(res);
    skillPage = 1;
    await loadSkills();
    void populateContentFilters();
  } catch (err) {
    showSkillError(err.message || "Beceri silinemedi.");
  }
}

// ---------- Seviye kataloğu ----------

async function loadLevels() {
  hideLevelError();
  const tbody = $("level-list-body");
  tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Yükleniyor…</td></tr>';

  const search = $("level-search").value.trim();
  const params = new URLSearchParams({
    page: levelPage,
    pageSize: LEVEL_PAGE_SIZE,
  });
  if (search) params.set("search", search);

  try {
    const res = await contentApi(`/levels?${params.toString()}`);
    const body = await parseResponse(res);
    levelData = body.items;
    levelTotal = body.total;
    renderLevelList();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">—</td></tr>';
    showLevelError(err.message || "Seviyeler yüklenemedi.");
  }
}

function showLevelError(message) {
  const el = $("level-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideLevelError() {
  $("level-error").classList.add("hidden");
}

function renderLevelList() {
  const tbody = $("level-list-body");

  if (levelData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Seviye bulunamadı.</td></tr>';
  } else {
    tbody.innerHTML = levelData
      .map(
        (l) => `
      <tr>
        <td><code>${escapeHtml(l.code)}</code></td>
        <td>${escapeHtml(l.name)}</td>
        <td>${l.minScore} – ${l.maxScore}</td>
        <td>${l.gradeBand ? escapeHtml(l.gradeBand) : "—"}</td>
        <td>${l.difficultyMin} – ${l.difficultyMax}</td>
        <td class="numeric">${l.displayOrder ?? 0}</td>
        <td class="text-right">
          <button type="button" class="btn btn-ghost btn-sm" data-level-edit-id="${l.id}">Düzenle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-level-delete-id="${l.id}">Sil</button>
        </td>
      </tr>`,
      )
      .join("");
  }

  const totalPages = Math.max(1, Math.ceil(levelTotal / LEVEL_PAGE_SIZE));
  $("level-page-info").textContent = `${levelTotal} seviye · sayfa ${levelPage}/${totalPages}`;
  $("level-prev-btn").disabled = levelPage <= 1;
  $("level-next-btn").disabled = levelPage >= totalPages;
}

function openLevelForm(mode, level = null) {
  levelFormMode = mode;
  levelEditingId = level?.id ?? null;
  $("level-form-title").textContent = mode === "create" ? "Yeni Seviye" : "Seviyeyi düzenle";
  $("level-form-code").value = level?.code ?? "";
  $("level-form-name").value = level?.name ?? "";
  $("level-form-min-score").value = level?.minScore ?? "";
  $("level-form-max-score").value = level?.maxScore ?? "";
  $("level-form-grade-band").value = level?.gradeBand ?? "";
  $("level-form-difficulty-min").value = level?.difficultyMin ?? "";
  $("level-form-difficulty-max").value = level?.difficultyMax ?? "";
  $("level-form-display-order").value = level?.displayOrder ?? 0;
  $("level-form-error").classList.add("hidden");
  $("level-form-modal").classList.remove("hidden");
  $("level-form-code").focus();
}

function closeLevelForm() {
  $("level-form-modal").classList.add("hidden");
}

function setLevelFormLoading(isLoading) {
  const btn = $("level-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}

async function submitLevelForm(event) {
  event.preventDefault();
  const errorEl = $("level-form-error");
  errorEl.classList.add("hidden");

  const payload = {
    code: $("level-form-code").value.trim(),
    name: $("level-form-name").value.trim(),
    minScore: Number($("level-form-min-score").value),
    maxScore: Number($("level-form-max-score").value),
    gradeBand: $("level-form-grade-band").value.trim() || null,
    difficultyMin: Number($("level-form-difficulty-min").value),
    difficultyMax: Number($("level-form-difficulty-max").value),
    displayOrder: Number($("level-form-display-order").value) || 0,
  };

  if (!payload.code) {
    errorEl.textContent = "Kod gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!payload.name) {
    errorEl.textContent = "Ad gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!Number.isFinite(payload.minScore) || !Number.isFinite(payload.maxScore)) {
    errorEl.textContent = "Puan aralığı gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!Number.isFinite(payload.difficultyMin) || !Number.isFinite(payload.difficultyMax)) {
    errorEl.textContent = "Zorluk aralığı gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }

  setLevelFormLoading(true);
  try {
    const res =
      levelFormMode === "create"
        ? await contentApi("/levels", { method: "POST", body: JSON.stringify(payload) })
        : await contentApi(`/levels/${encodeURIComponent(levelEditingId)}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
    await parseResponse(res);
    closeLevelForm();
    levelPage = 1;
    await loadLevels();
  } catch (err) {
    errorEl.textContent = err.message || "Seviye kaydedilemedi.";
    errorEl.classList.remove("hidden");
  } finally {
    setLevelFormLoading(false);
  }
}

async function deleteLevel(levelId) {
  const level = levelData.find((l) => l.id === levelId);
  const label = level ? `${level.name} (${level.code})` : levelId;
  if (!window.confirm(`"${label}" seviyesini silmek istediğinize emin misiniz?`)) return;
  try {
    const res = await contentApi(`/levels/${encodeURIComponent(levelId)}`, { method: "DELETE" });
    await parseResponse(res);
    levelPage = 1;
    await loadLevels();
  } catch (err) {
    showLevelError(err.message || "Seviye silinemedi.");
  }
}

// ---------- İçerik / Beceri / Seviye olayları ----------

function setupContentEvents() {
  $("content-list-body").addEventListener("click", (event) => {
    const detailBtn = event.target.closest("[data-content-detail-id]");
    const editBtn = event.target.closest("[data-content-edit-id]");
    const deleteBtn = event.target.closest("[data-content-delete-id]");

    if (detailBtn) {
      void openContentDetail(detailBtn.dataset.contentDetailId);
    } else if (editBtn) {
      const content = contentData.find((c) => c.id === editBtn.dataset.contentEditId);
      if (content) openContentForm("edit", content);
    } else if (deleteBtn) {
      void deleteContent(deleteBtn.dataset.contentDeleteId);
    }
  });

  $("content-search").addEventListener("input", () => {
    contentPage = 1;
    void loadContents();
  });
  $("content-scope-filter").addEventListener("change", () => {
    contentPage = 1;
    const scope = $("content-scope-filter").value;
    $("content-tenant-filter").disabled = scope === "GLOBAL";
    if (scope === "GLOBAL") $("content-tenant-filter").value = "";
    void loadContents();
  });
  $("content-tenant-filter").addEventListener("change", () => {
    contentPage = 1;
    void loadContents();
  });
  $("content-type-filter").addEventListener("change", () => {
    contentPage = 1;
    void loadContents();
  });
  $("content-status-filter").addEventListener("change", () => {
    contentPage = 1;
    void loadContents();
  });
  $("content-skill-filter").addEventListener("change", () => {
    contentPage = 1;
    void loadContents();
  });
  $("content-prev-btn").addEventListener("click", () => {
    if (contentPage > 1) {
      contentPage -= 1;
      void loadContents();
    }
  });
  $("content-next-btn").addEventListener("click", () => {
    contentPage += 1;
    void loadContents();
  });

  $("content-create-btn").addEventListener("click", () => openContentForm("create"));
  $("content-form").addEventListener("submit", submitContentForm);
  $("content-form-close").addEventListener("click", closeContentForm);
  $("content-form-cancel").addEventListener("click", closeContentForm);

  $("content-form-scope").addEventListener("change", (event) => {
    $("content-form-tenant-field").classList.toggle("hidden", event.target.value !== "TENANT");
  });

  $("content-detail-close").addEventListener("click", () => {
    $("content-detail-modal").classList.add("hidden");
    void loadContents();
  });
  $("content-detail-edit").addEventListener("click", () => {
    if (!contentDetailCurrent) return;
    $("content-detail-modal").classList.add("hidden");
    openContentForm("edit", contentDetailCurrent);
  });
  $("content-detail-delete").addEventListener("click", () => {
    if (!contentDetailCurrent) return;
    $("content-detail-modal").classList.add("hidden");
    void deleteContent(contentDetailCurrent.id);
  });

  $("content-detail-body").addEventListener("click", (event) => {
    const versionView = event.target.closest("[data-version-view]");
    const versionEdit = event.target.closest("[data-version-edit]");
    const versionReview = event.target.closest("[data-version-review]");
    const versionPublish = event.target.closest("[data-version-publish]");
    const skillRemove = event.target.closest("[data-skill-remove]");
    const skillAdd = event.target.closest("[data-content-skill-add]");
    const statusApply = event.target.closest("[data-content-status-apply]");
    const newVersion = event.target.closest("#content-new-version-btn");

    if (newVersion) {
      window.__versionFormMode = "new";
      window.__versionFormId = null;
      openVersionForm("new");
    } else if (versionView) {
      void viewVersion(versionView.dataset.versionView);
    } else if (versionEdit) {
      void (async () => {
        try {
          const res = await contentApi(
            `/content-versions/${encodeURIComponent(versionEdit.dataset.versionEdit)}`,
          );
          const v = await parseResponse(res);
          window.__versionFormMode = "edit";
          window.__versionFormId = v.id;
          openVersionForm("edit", v);
        } catch (err) {
          showContentError(err.message || "Sürüm yüklenemedi.");
        }
      })();
    } else if (versionReview) {
      void reviewVersion(versionReview.dataset.versionReview);
    } else if (versionPublish) {
      void publishVersion(versionPublish.dataset.versionPublish);
    } else if (skillRemove) {
      void removeContentSkill(skillRemove.dataset.skillRemove);
    } else if (skillAdd) {
      void addContentSkill();
    } else if (statusApply) {
      void applyContentStatus(contentDetailCurrent?.id);
    }
  });

  $("version-form").addEventListener("submit", submitVersionForm);
  $("version-form-close").addEventListener("click", closeVersionForm);
  $("version-form-cancel").addEventListener("click", closeVersionForm);
  $("version-form-body").addEventListener("input", updateVersionWordCount);

  $("version-detail-close").addEventListener("click", () => {
    $("version-detail-modal").classList.add("hidden");
  });
  $("version-detail-close-action").addEventListener("click", () => {
    $("version-detail-modal").classList.add("hidden");
  });
}

function setupSkillEvents() {
  $("skill-list-body").addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-skill-edit-id]");
    const deleteBtn = event.target.closest("[data-skill-delete-id]");

    if (editBtn) {
      const skill = skillData.find((s) => s.id === editBtn.dataset.skillEditId);
      if (skill) openSkillForm("edit", skill);
    } else if (deleteBtn) {
      void deleteSkill(deleteBtn.dataset.skillDeleteId);
    }
  });

  $("skill-search").addEventListener("input", () => {
    skillPage = 1;
    void loadSkills();
  });
  $("skill-category-filter").addEventListener("change", () => {
    skillPage = 1;
    void loadSkills();
  });
  $("skill-prev-btn").addEventListener("click", () => {
    if (skillPage > 1) {
      skillPage -= 1;
      void loadSkills();
    }
  });
  $("skill-next-btn").addEventListener("click", () => {
    skillPage += 1;
    void loadSkills();
  });

  $("skill-create-btn").addEventListener("click", () => openSkillForm("create"));
  $("skill-form").addEventListener("submit", submitSkillForm);
  $("skill-form-close").addEventListener("click", closeSkillForm);
  $("skill-form-cancel").addEventListener("click", closeSkillForm);

  populateSkillCategoryFilter();
}

function setupLevelEvents() {
  $("level-list-body").addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-level-edit-id]");
    const deleteBtn = event.target.closest("[data-level-delete-id]");

    if (editBtn) {
      const level = levelData.find((l) => l.id === editBtn.dataset.levelEditId);
      if (level) openLevelForm("edit", level);
    } else if (deleteBtn) {
      void deleteLevel(deleteBtn.dataset.levelDeleteId);
    }
  });

  $("level-search").addEventListener("input", () => {
    levelPage = 1;
    void loadLevels();
  });
  $("level-prev-btn").addEventListener("click", () => {
    if (levelPage > 1) {
      levelPage -= 1;
      void loadLevels();
    }
  });
  $("level-next-btn").addEventListener("click", () => {
    levelPage += 1;
    void loadLevels();
  });

  $("level-create-btn").addEventListener("click", () => openLevelForm("create"));
  $("level-form").addEventListener("submit", submitLevelForm);
  $("level-form-close").addEventListener("click", closeLevelForm);
  $("level-form-cancel").addEventListener("click", closeLevelForm);
}

function setupBranchEvents() {
  $("branch-list-body").addEventListener("click", (event) => {
    const detailBtn = event.target.closest("[data-branch-detail-id]");
    const editBtn = event.target.closest("[data-branch-edit-id]");
    const deleteBtn = event.target.closest("[data-branch-delete-id]");

    if (detailBtn) {
      void openBranchDetail(detailBtn.dataset.branchDetailId);
    } else if (editBtn) {
      const branch = branchData.find((b) => b.id === editBtn.dataset.branchEditId);
      if (branch) openBranchForm("edit", branch);
    } else if (deleteBtn) {
      void deleteBranch(deleteBtn.dataset.branchDeleteId);
    }
  });

  $("branch-search").addEventListener("input", () => {
    branchPage = 1;
    void loadBranches();
  });
  $("branch-tenant-filter").addEventListener("change", () => {
    branchPage = 1;
    void loadBranches();
  });
  $("branch-status-filter").addEventListener("change", () => {
    branchPage = 1;
    void loadBranches();
  });
  $("branch-prev-btn").addEventListener("click", () => {
    if (branchPage > 1) {
      branchPage -= 1;
      void loadBranches();
    }
  });
  $("branch-next-btn").addEventListener("click", () => {
    branchPage += 1;
    void loadBranches();
  });

  $("branch-create-btn").addEventListener("click", () => openBranchForm("create"));
  $("branch-form").addEventListener("submit", submitBranchForm);
  $("branch-form-close").addEventListener("click", closeBranchForm);
  $("branch-form-cancel").addEventListener("click", closeBranchForm);

  // Kurum seçilince uygun şube müdürleri yüklenir.
  $("branch-form-tenant").addEventListener("change", (event) => {
    void populateBranchFormManagers(event.target.value);
  });

  $("branch-detail-close").addEventListener("click", () => {
    $("branch-detail-modal").classList.add("hidden");
  });
  $("branch-detail-edit").addEventListener("click", () => {
    if (!branchDetailCurrent) return;
    $("branch-detail-modal").classList.add("hidden");
    openBranchForm("edit", branchDetailCurrent);
  });
  $("branch-detail-delete").addEventListener("click", () => {
    if (!branchDetailCurrent) return;
    $("branch-detail-modal").classList.add("hidden");
    void deleteBranch(branchDetailCurrent.id);
  });

  // Detay içi olaylar: müdür atama/kaldırma, durum uygulama.
  $("branch-detail-body").addEventListener("click", (event) => {
    const assignBtn = event.target.closest("[data-branch-manager-assign]");
    const removeBtn = event.target.closest("[data-branch-manager-remove]");
    const statusBtn = event.target.closest("[data-branch-status-apply]");

    if (assignBtn) {
      void assignBranchManager(branchDetailCurrent?.id);
    } else if (removeBtn) {
      void removeBranchManager(branchDetailCurrent?.id);
    } else if (statusBtn) {
      void applyBranchStatus(branchDetailCurrent?.id);
    }
  });
}

// Modal backdrop tıklamasıyla kapatma.
for (const id of [
  "tenant-form-modal",
  "tenant-detail-modal",
  "user-form-modal",
  "user-detail-modal",
  "student-form-modal",
  "student-detail-modal",
  "teacher-form-modal",
  "teacher-detail-modal",
  "branch-form-modal",
  "branch-detail-modal",
  "class-form-modal",
  "class-detail-modal",
  "content-form-modal",
  "content-detail-modal",
  "version-form-modal",
  "version-detail-modal",
  "question-detail-modal",
  "question-form-modal",
  "question-version-detail-modal",
  "template-detail-modal",
  "template-version-detail-modal",
  "template-form-modal",
  "skill-form-modal",
  "level-form-modal",
  "question-media-detail-modal",
  "question-version-media-detail-modal",
]) {
  $(id).addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      $(id).classList.add("hidden");
    }
  });
}
// ========== Question Version Media Detail ==========
const QVMEDIA_ROLE_LABELS = {
  MAIN: "Ana Görsel",
  OPTION: "Seçenek Medyası",
  EXPLANATION: "Açıklama",
  HINT: "İpucu",
};
function qvMediaRoleLabel(role) {
  return QVMEDIA_ROLE_LABELS[role] ?? role;
}
async function openQuestionVersionMediaDetail(mediaId) {
  const modal = $("question-version-media-detail-modal");
  const body = $("question-version-media-detail-body");
  const title = $("question-version-media-detail-title");
  if (!body) return;
  body.innerHTML = '<p class="muted">Yükleniyor…</p>';
  title.textContent = "Sürüm medyası detayı";
  modal.classList.remove("hidden");
  try {
    const res = await questionApi(`/media/${mediaId}`);
    const m = await parseResponse(res);
    const binding = (questionVersionMediaData || []).find((b) => b.mediaId === mediaId);
    const role = binding?.role ?? m.role ?? "MAIN";
    const position = binding?.position ?? m.position ?? 0;
    title.textContent = `${m.type} · ${qvMediaRoleLabel(role)}`;
    body.innerHTML = `
      <div class="detail-grid">
        <div class="info-item"><dt>Tip</dt><dd>${escapeHtml(m.type)}</dd></div>
        <div class="info-item"><dt>Rol</dt><dd>${qvMediaRoleLabel(role)}</dd></div>
        <div class="info-item"><dt>Pozisyon</dt><dd>${position}</dd></div>
        <div class="info-item"><dt>Oluşturulma</dt><dd>${escapeHtml(formatDateTime(m.createdAt))}</dd></div>
        <div class="info-item"><dt>URL</dt><dd>${escapeHtml(m.url)}</dd></div>
        <div class="info-item"><dt>MIME</dt><dd>${escapeHtml(m.mimeType)}</dd></div>
        <div class="info-item"><dt>Boyut</dt><dd>${m.width ?? "—"} × ${m.height ?? "—"}</dd></div>
        <div class="info-item"><dt>Süre</dt><dd>${m.durationMs ? m.durationMs + " ms" : "—"}</dd></div>
        <div class="info-item"><dt>Alt Metin</dt><dd>${escapeHtml(m.altText ?? "—")}</dd></div>
        <div class="info-item"><dt>Altyazı</dt><dd>${escapeHtml(m.caption ?? "—")}</dd></div>
        <div class="info-item"><dt>Boyut</dt><dd>${m.sizeBytes ?? "—"} byte</dd></div>
        <div class="info-item"><dt>Hash</dt><dd>${escapeHtml(m.hash)}</dd></div>
        <div class="info-item"><dt>Oluşturan</dt><dd>${escapeHtml(m.createdByName ?? "—")}</dd></div>
      </div>`;
  } catch (err) {
    body.innerHTML = `<p class="error">${escapeHtml(err.message || "Sürüm medyası detayı yüklenemedi.")}</p>`;
  }
}
function closeQuestionMediaDetail() {
  const m = $("question-media-detail-modal");
  if (m) m.classList.add("hidden");
}
function closeQuestionVersionMediaDetail() {
  const m = $("question-version-media-detail-modal");
  if (m) m.classList.add("hidden");
}
function setupQuestionVersionMediaEvents() {
  const qvmList = $("question-version-media-list");
  if (qvmList) {
    qvmList.addEventListener("click", (e) => {
      const viewBtn = e.target.closest("[data-qvmedia-view]");
      if (viewBtn) void openQuestionVersionMediaDetail(viewBtn.dataset.qvmediaView);
      const detachBtn = e.target.closest("[data-qvmedia-detach]");
      if (detachBtn) void handleVersionMediaDetach(detachBtn.dataset.qvmediaDetach);
    });
  }
  const qvmAddBtn = $("question-version-media-add-btn");
  if (qvmAddBtn) qvmAddBtn.addEventListener("click", handleVersionMediaAttach);
}
// ---------------------------------------------------------------------------
// AŞAMA 6 — Assignment (Ödev) Yönetimi
// ---------------------------------------------------------------------------
const ASSIGNMENT_STATUS_LABELS = {
  DRAFT: "Taslak",
  SCHEDULED: "Zamanlanmış",
  ACTIVE: "Aktif",
  CLOSED: "Kapalı",
};
const ASSIGNMENT_PAGE_SIZE = 20;
let assignmentPage = 1;
let assignmentData = [];
let assignmentFormMode = "create";
let assignmentEditingId = null;
let assignmentDetailCurrent = null;
let isPlatformUser = null;

function assignmentApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  if (method === "DELETE") delete headers["content-type"];
  return fetch(`/admin/assignments${path}`, { ...options, method, headers });
}

function studentAssignmentApi(path, options = {}) {
  const { accessToken, tenantId } = getStoredTokens();
  const method = options.method ?? "GET";
  const headers = { ...authHeaders(accessToken, tenantId), ...(options.headers ?? {}) };
  return fetch(`/student/assignments${path}`, { ...options, method, headers });
}

function assignmentStatusBadge(status) {
  const cls = {
    DRAFT: "badge badge-neutral",
    SCHEDULED: "badge badge-warning",
    ACTIVE: "badge badge-success",
    CLOSED: "badge badge-danger",
  }[status];
  return `<span class="${cls ?? "badge"}">${ASSIGNMENT_STATUS_LABELS[status] ?? status}</span>`;
}

function showAssignmentError(msg) {
  const e = $("assignment-error");
  e.textContent = msg;
  e.classList.remove("hidden");
}
function hideAssignmentError() {
  $("assignment-error").classList.add("hidden");
}

function formatAssignmentDate(d) {
  return d
    ? new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";
}
function formatStudentDueDate(d) {
  return d
    ? "Teslim: " + new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })
    : "";
}
function assignmentStudentState(a) {
  if (a.sessionStatus === "COMPLETED")
    return { label: "Tamamlandı", cls: "badge-success", cta: "Sonuçları Gör" };
  if (a.sessionStatus === "IN_PROGRESS")
    return { label: "Devam Ediyor", cls: "badge-warning", cta: "Devam Et" };
  if (a.status === "CLOSED")
    return { label: "Kapanmış", cls: "badge-danger", cta: "Sonuçları Gör" };
  if (a.dueDate && new Date(a.dueDate).getTime() < Date.now())
    return { label: "Süresi Geçmiş", cls: "badge-danger", cta: "Detayı Gör" };
  return {
    label: a.status === "SCHEDULED" ? "Yaklaşan" : "Aktif",
    cls: a.status === "SCHEDULED" ? "badge-info" : "badge-success",
    cta: "Başla",
  };
}
function studentProgressMarkup(item) {
  if (item.questionCount == null) return '<span class="muted">İlerleme bilgisi hazır değil</span>';
  var total = Number(item.questionCount) || 0;
  var attempted = Math.min(total, Number(item.attemptedCount) || 0);
  var percent = total ? Math.round((attempted / total) * 100) : 0;
  return (
    '<div class="student-progress-label"><span>' +
    attempted +
    " / " +
    total +
    " soru</span><span>" +
    percent +
    '%</span></div><div class="progress-track" role="progressbar" aria-label="Ödev ilerlemesi" aria-valuemin="0" aria-valuemax="' +
    total +
    '" aria-valuenow="' +
    attempted +
    '"><div class="progress-fill" style="width:' +
    percent +
    '%"></div></div>'
  );
}
function formatAssignmentDateTime(d) {
  return d
    ? new Date(d).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

async function loadAssignments() {
  hideAssignmentError();
  const tbody = $("assignment-list-body");
  tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Yükleniyor…</td></tr>';
  $("student-assignment-view")?.classList.toggle("hidden", isPlatformUser !== false);
  document
    .querySelectorAll("#page-assignments > .card")
    .forEach((panel) => panel.classList.toggle("hidden", isPlatformUser === false));
  const search = $("assignment-search").value.trim();
  const status = $("assignment-status-filter").value;
  const params = new URLSearchParams({ page: assignmentPage, pageSize: ASSIGNMENT_PAGE_SIZE });
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  try {
    const apiFn = isPlatformUser === false ? studentAssignmentApi : assignmentApi;
    const res = await apiFn(`?${params.toString()}`);
    const body = await parseResponse(res);
    assignmentData = body.items;
    renderAssignmentList(body.total);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">—</td></tr>';
    showAssignmentError(err.message || "Ödevler yüklenemedi.");
  }
}

function renderAssignmentList(total) {
  const tbody = $("assignment-list-body");
  if (isPlatformUser === false) {
    const cards = $("student-assignment-cards");
    cards.innerHTML = assignmentData.length
      ? assignmentData
          .map((a) => {
            const state = assignmentStudentState(a);
            const canStart =
              ["SCHEDULED", "ACTIVE"].includes(a.status) &&
              !["COMPLETED", "CLOSED"].includes(a.sessionStatus);
            const cta =
              state.cta === "Devam Et"
                ? `<button type="button" class="btn btn-primary" data-assignment-continue-id="${a.id}">${state.cta}</button>`
                : canStart
                  ? `<button type="button" class="btn btn-primary" data-assignment-start-id="${a.id}">${state.cta}</button>`
                  : `<button type="button" class="btn btn-ghost" data-assignment-detail-id="${a.id}">Detayı Gör</button>`;
            return `<article class="learning-card assignment-student-card"><div class="learning-card-icon" aria-hidden="true">📝</div><div class="learning-card-content"><div class="learning-card-topline"><span class="badge ${state.cls}">${state.label}</span>${formatStudentDueDate(a.dueDate) ? `<span class="muted">${formatStudentDueDate(a.dueDate)}</span>` : ""}</div><h3>${escapeHtml(a.title)}</h3><p class="muted">${escapeHtml(a.teacherName)} · ${escapeHtml(a.organizationName || "Kurum çalışması")} · ${escapeHtml(a.className)}</p>${studentProgressMarkup(a)}<div class="learning-card-actions">${cta}<button type="button" class="btn btn-ghost" data-assignment-detail-id="${a.id}">Detay</button></div></div></article>`;
          })
          .join("")
      : '<div class="empty-learning-state"><div aria-hidden="true">🌱</div><h3>Henüz atanmış bir çalışman yok.</h3><p class="muted">Bugünkü öğrenme yoluna devam etmek için dashboard’a dönebilirsin.</p><button type="button" class="btn btn-primary" onclick="navigate(\'dashboard\')">Öğrenme yoluna git</button></div>';
    tbody.innerHTML = "";
    $("assignment-page-info").textContent = "";
    $("assignment-prev-btn").disabled = true;
    $("assignment-next-btn").disabled = true;
    return;
  }
  if (assignmentData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Ödev bulunamadı.</td></tr>';
  } else if (isPlatformUser !== false) {
    tbody.innerHTML = assignmentData
      .map(
        (a) => `
      <tr>
        <td><button type="button" class="link-btn" data-assignment-detail-id="${a.id}">${escapeHtml(a.title)}</button></td>
        <td>${escapeHtml(a.className)}</td>
        <td>${escapeHtml(a.templateTitle)}</td>
        <td>${escapeHtml(a.teacherName)}</td>
        <td>${assignmentStatusBadge(a.status)}</td>
        <td>${formatAssignmentDate(a.dueDate)}</td>
        <td class="numeric">${a.sessionCount}</td>
        <td class="text-right">
          <button type="button" class="btn btn-ghost btn-sm" data-assignment-edit-id="${a.id}">Düzenle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-assignment-delete-id="${a.id}">Sil</button>
        </td>
      </tr>`,
      )
      .join("");
  } else {
    tbody.innerHTML = assignmentData
      .map((a) => {
        const actionBtn = a.hasInProgressSession
          ? `<button type="button" class="btn btn-ghost btn-sm" data-assignment-continue-id="${a.id}">Devam Et</button>`
          : `<button type="button" class="btn btn-primary btn-sm" data-assignment-start-id="${a.id}">Başla</button>`;
        return `
      <tr>
        <td><button type="button" class="link-btn" data-assignment-detail-id="${a.id}">${escapeHtml(a.title)}</button></td>
        <td>${escapeHtml(a.className)}</td>
        <td>${escapeHtml(a.teacherName)}</td>
        <td>${assignmentStatusBadge(a.status)}</td>
        <td>${formatAssignmentDate(a.dueDate)}</td>
        <td class="numeric">${a.sessionCount}</td>
        <td class="text-right">${actionBtn}</td>
      </tr>`;
      })
      .join("");
  }
  const totalPages = Math.max(1, Math.ceil(total / ASSIGNMENT_PAGE_SIZE));
  $("assignment-page-info").textContent = `${total} ödev · sayfa ${assignmentPage}/${totalPages}`;
  $("assignment-prev-btn").disabled = assignmentPage <= 1;
  $("assignment-next-btn").disabled = assignmentPage >= totalPages;
}

function setAssignmentFormLoading(isLoading) {
  const btn = $("assignment-form-submit");
  btn.disabled = isLoading;
  btn.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  btn.querySelector(".btn-spinner")?.classList.toggle("hidden", !isLoading);
}

function closeAssignmentForm() {
  $("assignment-form-modal").classList.add("hidden");
}

async function populateAssignmentFormDropdowns() {
  const classSel = $("assignment-form-class");
  const templateSel = $("assignment-form-template");
  const teacherSel = $("assignment-form-teacher");
  classSel.innerHTML = '<option value="">Yükleniyor…</option>';
  templateSel.innerHTML = '<option value="">Yükleniyor…</option>';
  teacherSel.innerHTML = '<option value="">Yükleniyor…</option>';
  const hdrs = authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId);
  const [classRes, templateRes, teacherRes] = await Promise.all([
    fetch("/admin/classes?page=1&pageSize=100&status=ACTIVE", { headers: hdrs }).then((r) =>
      parseResponse(r),
    ),
    fetch("/admin/templates?page=1&pageSize=100&status=PUBLISHED", { headers: hdrs }).then((r) =>
      parseResponse(r),
    ),
    fetch("/admin/teachers?page=1&pageSize=100", { headers: hdrs }).then((r) => parseResponse(r)),
  ]);
  classSel.innerHTML = classRes.items.length
    ? `<option value="">Sınıf seçin…</option>${classRes.items.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}`
    : '<option value="">Aktif sınıf bulunamadı</option>';
  templateSel.innerHTML = templateRes.items.length
    ? `<option value="">Şablon seçin…</option>${templateRes.items.map((t) => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join("")}`
    : '<option value="">Yayınlanmış şablon bulunamadı</option>';
  teacherSel.innerHTML = teacherRes.items.length
    ? `<option value="">Öğretmen seçin…</option>${teacherRes.items.map((t) => `<option value="${t.id}">${escapeHtml(t.displayName || t.name)}</option>`).join("")}`
    : '<option value="">Öğretmen bulunamadı</option>';
}

async function openAssignmentForm(mode, a = null) {
  assignmentFormMode = mode;
  assignmentEditingId = a?.id ?? null;
  $("assignment-form-title").textContent = mode === "create" ? "Yeni Ödev" : "Ödevi düzenle";
  $("assignment-form-title-input").value = a?.title ?? "";
  $("assignment-form-due-date").value = a?.dueDate
    ? new Date(a.dueDate).toISOString().slice(0, 16)
    : "";
  $("assignment-form-error").classList.add("hidden");
  await populateAssignmentFormDropdowns();
  if (a) {
    $("assignment-form-class").value = a.classId ?? "";
    $("assignment-form-template").value = a.templateId ?? "";
    $("assignment-form-teacher").value = a.teacherId ?? "";
  }
  $("assignment-form-modal").classList.remove("hidden");
  $("assignment-form-title-input").focus();
}

async function submitAssignmentForm(event) {
  event.preventDefault();
  const errorEl = $("assignment-form-error");
  errorEl.classList.add("hidden");
  const isCreate = assignmentFormMode === "create";
  const payload = { title: $("assignment-form-title-input").value.trim() };
  const dueDateVal = $("assignment-form-due-date").value;
  if (dueDateVal) payload.dueDate = new Date(dueDateVal).toISOString();
  if (isCreate) {
    payload.classId = $("assignment-form-class").value;
    payload.templateId = $("assignment-form-template").value;
    payload.teacherId = $("assignment-form-teacher").value;
    if (!payload.classId) {
      errorEl.textContent = "Sınıf gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (!payload.templateId) {
      errorEl.textContent = "Şablon gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (!payload.teacherId) {
      errorEl.textContent = "Öğretmen gereklidir.";
      errorEl.classList.remove("hidden");
      return;
    }
  }
  if (!payload.title) {
    errorEl.textContent = "Başlık gereklidir.";
    errorEl.classList.remove("hidden");
    return;
  }
  setAssignmentFormLoading(true);
  try {
    const res = isCreate
      ? await assignmentApi("", { method: "POST", body: JSON.stringify(payload) })
      : await assignmentApi(`/${encodeURIComponent(assignmentEditingId)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
    await parseResponse(res);
    closeAssignmentForm();
    assignmentPage = 1;
    await loadAssignments();
  } catch (err) {
    errorEl.textContent = err.message || "Kayıt başarısız.";
    errorEl.classList.remove("hidden");
  } finally {
    setAssignmentFormLoading(false);
  }
}

async function openAssignmentDetail(id) {
  $("assignment-detail-body").innerHTML = '<p class="muted">Yükleniyor…</p>';
  $("assignment-detail-modal").classList.remove("hidden");
  try {
    const apiFn = isPlatformUser === false ? studentAssignmentApi : assignmentApi;
    const res = await apiFn(`/${encodeURIComponent(id)}`);
    const d = await parseResponse(res);
    assignmentDetailCurrent = d;
    renderAssignmentDetail(d);
  } catch (err) {
    assignmentDetailCurrent = null;
    $("assignment-detail-body").innerHTML =
      `<p class="error">${escapeHtml(err.message || "Detay yüklenemedi.")}</p>`;
  }
}

function renderAssignmentDetail(d) {
  $("assignment-detail-title").textContent = d.title;
  const startBtn = $("assignment-detail-start");
  const editBtn = $("assignment-detail-edit");
  const deleteBtn = $("assignment-detail-delete");
  if (isPlatformUser !== false) {
    const canEdit = d.status === "DRAFT" || d.status === "SCHEDULED";
    const canDelete = d.status === "DRAFT";
    startBtn.style.display = "none";
    editBtn.classList.toggle("hidden", !canEdit);
    deleteBtn.classList.toggle("hidden", !canDelete);
  } else {
    const canStart = (d.status === "SCHEDULED" || d.status === "ACTIVE") && !d.hasInProgressSession;
    const canContinue = d.hasInProgressSession;
    startBtn.style.display = canStart ? "inline-block" : "none";
    startBtn.textContent = canContinue ? "Devam Et" : "Başla";
    startBtn.dataset.assignmentStartId = d.id;
    if (canContinue) startBtn.dataset.assignmentContinueId = d.id;
    editBtn.classList.add("hidden");
    deleteBtn.classList.add("hidden");
  }
  $("assignment-detail-body").innerHTML = `
    <section class="detail-section">
      <h4>Ödev Bilgileri</h4>
      <dl class="info-grid">
        <div class="info-item"><dt>Başlık</dt><dd>${escapeHtml(d.title)}</dd></div>
        <div class="info-item"><dt>Durum</dt><dd>${assignmentStatusBadge(d.status)}</dd></div>
        <div class="info-item"><dt>Sınıf</dt><dd>${escapeHtml(d.className)}</dd></div>
        ${isPlatformUser !== false ? `<div class="info-item"><dt>Şablon</dt><dd>${escapeHtml(d.templateTitle)} (${escapeHtml(d.templateType)})</dd></div>` : ""}
        <div class="info-item"><dt>Öğretmen</dt><dd>${escapeHtml(d.teacherName)}</dd></div>
        <div class="info-item"><dt>Son Tarih</dt><dd>${formatAssignmentDateTime(d.dueDate)}</dd></div>
        ${isPlatformUser !== false ? `<div class="info-item"><dt>Oturum Sayısı</dt><dd>${d.sessionCount}</dd></div>` : `<div class="info-item"><dt>İlerleme</dt><dd>${studentProgressMarkup(d)}</dd></div>`}
        ${d.inProgressSessionId ? `<div class="info-item"><dt>Oturum Durumu</dt><dd><span class="badge badge-warning">Devam Ediyor</span></dd></div>` : ""}
      </dl>
    </section>`;
}

async function deleteAssignment(id) {
  if (!window.confirm("Bu ödevi silmek istediğinize emin misiniz?")) return;
  try {
    const res = await assignmentApi(`/${encodeURIComponent(id)}`, { method: "DELETE" });
    await parseResponse(res);
    assignmentPage = 1;
    await loadAssignments();
  } catch (err) {
    showAssignmentError(err.message || "Ödev silinemedi.");
  }
}

async function startAssignmentSession(assignmentId) {
  hideAssignmentError();
  try {
    const res = await studentAssignmentApi(`/${encodeURIComponent(assignmentId)}/start`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const data = await parseResponse(res);
    exerciseRequestedSessionId = data.sessionId;
    exerciseSession = { id: data.sessionId };
    exerciseQuestions = [];
    currentExerciseQuestionIndex = 0;
    exerciseAttempts.clear();
    navigate("exercise");
    void loadExerciseQuestions();
  } catch (err) {
    showAssignmentError(err.message || "Oturum başlatılamadı.");
  }
}

function setupAssignmentEvents() {
  $("assignment-list-body").addEventListener("click", (event) => {
    const detailBtn = event.target.closest("[data-assignment-detail-id]");
    const editBtn = event.target.closest("[data-assignment-edit-id]");
    const deleteBtn = event.target.closest("[data-assignment-delete-id]");
    const startBtn = event.target.closest("[data-assignment-start-id]");
    const continueBtn = event.target.closest("[data-assignment-continue-id]");
    if (detailBtn) {
      void openAssignmentDetail(detailBtn.dataset.assignmentDetailId);
    } else if (startBtn) {
      void startAssignmentSession(startBtn.dataset.assignmentStartId);
    } else if (continueBtn) {
      void startAssignmentSession(continueBtn.dataset.assignmentContinueId);
    } else if (editBtn) {
      const a = assignmentData.find((x) => x.id === editBtn.dataset.assignmentEditId);
      if (a) void openAssignmentForm("edit", a);
    } else if (deleteBtn) {
      void deleteAssignment(deleteBtn.dataset.assignmentDeleteId);
    }
  });
  $("student-assignment-cards")?.addEventListener("click", (event) => {
    const target = event.target.closest(
      "[data-assignment-detail-id], [data-assignment-start-id], [data-assignment-continue-id]",
    );
    if (!target) return;
    if (target.dataset.assignmentDetailId)
      return void openAssignmentDetail(target.dataset.assignmentDetailId);
    void startAssignmentSession(
      target.dataset.assignmentStartId || target.dataset.assignmentContinueId,
    );
  });
  $("assignment-search").addEventListener("input", () => {
    assignmentPage = 1;
    void loadAssignments();
  });
  $("assignment-status-filter").addEventListener("change", () => {
    assignmentPage = 1;
    void loadAssignments();
  });
  $("assignment-prev-btn").addEventListener("click", () => {
    if (assignmentPage > 1) {
      assignmentPage -= 1;
      void loadAssignments();
    }
  });
  $("assignment-next-btn").addEventListener("click", () => {
    assignmentPage += 1;
    void loadAssignments();
  });
  $("assignment-create-btn").addEventListener("click", () => void openAssignmentForm("create"));
  $("assignment-form").addEventListener("submit", submitAssignmentForm);
  $("assignment-form-close").addEventListener("click", closeAssignmentForm);
  $("assignment-form-cancel").addEventListener("click", closeAssignmentForm);
  $("assignment-detail-close").addEventListener("click", () =>
    $("assignment-detail-modal").classList.add("hidden"),
  );
  $("assignment-detail-start").addEventListener("click", () => {
    if (!assignmentDetailCurrent) return;
    $("assignment-detail-modal").classList.add("hidden");
    void startAssignmentSession(assignmentDetailCurrent.id);
  });
  $("assignment-detail-edit").addEventListener("click", () => {
    if (!assignmentDetailCurrent) return;
    $("assignment-detail-modal").classList.add("hidden");
    void openAssignmentForm("edit", assignmentDetailCurrent);
  });
  $("assignment-detail-delete").addEventListener("click", () => {
    if (!assignmentDetailCurrent) return;
    $("assignment-detail-modal").classList.add("hidden");
    void deleteAssignment(assignmentDetailCurrent.id);
  });
}
async function init() {
  restoreSession();
  setupModalAccessibility();
  setupTenantEvents();
  setupUserEvents();
  setupStudentEvents();
  setupTeacherEvents();
  setupBranchEvents();
  setupClassEvents();
  setupContentEvents();
  setupQuestionEvents();
  setupTemplateEvents();
  setupExerciseEvents();
  setupPremiumExperienceEvents();
  setupSkillEvents();
  setupLevelEvents();
  setupQuestionVersionMediaEvents();
  setupAssignmentEvents();
  setupProgressEvents();
  setupGamificationEvents();
  setupCelebrationEvents();
  setupAssessmentEvents();
}
init();

// ---------- İlerleme ----------

function insightScope() {
  const t = getStoredTokens();
  return insightsIdentity + ":" + t.tenantId + ":" + t.accessToken;
}
function resetInsights() {
  progressRequest++;
  gamificationRequest++;
  historyRequest++;
  if (typeof exerciseGamificationRequest === "number") exerciseGamificationRequest++;
  insightAwards = [];
  insightsIdentity = "";
  for (const id of [
    "progress-summary",
    "progress-path",
    "progress-skills",
    "progress-study",
    "progress-history",
    "gamification-badges",
    "gamification-events",
    "home-insights-values",
    "badge-celebration",
    "gamification-last-activity",
    "badge-detail-title",
    "badge-detail-description",
    "badge-detail-date",
    "badge-detail-source",
  ]) {
    if ($(id)) $(id).replaceChildren();
  }
  for (const id of [
    "gamification-total-points",
    "gamification-current-days",
    "gamification-longest-days",
    "gamification-badge-count",
    "topbar-xp",
    "topbar-streak",
  ])
    if ($(id)) $(id).textContent = "—";
  $("badge-detail")?.close();
  $("home-insights")?.classList.add("hidden");
}
function insightDate(value, withTime = false, utc = false) {
  if (!value) return "Tarih belirtilmemiş";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih belirtilmemiş";
  return withTime
    ? date.toLocaleString("tr-TR")
    : date.toLocaleDateString("tr-TR", utc ? { timeZone: "UTC" } : undefined);
}
function formatAccuracy(value) {
  return Number.isFinite(value) ? Math.round(value * 100) + "%" : "—";
}
function formatAvgTime(value) {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value / 1000) + " sn";
}
function insightMetric(icon, label, value, tone = "", id = "") {
  return `<article class="insight-stat ${tone}"><span aria-hidden="true">${icon}</span><span>${escapeHtml(label)}</span><strong${id ? ` id="${id}"` : ""}>${escapeHtml(String(value))}</strong></article>`;
}
function insightBar(accuracy, label) {
  if (!Number.isFinite(accuracy)) return '<p class="muted">Henüz değerlendirilmiş cevap yok.</p>';
  const value = Math.round(accuracy * 100);
  return `<div class="insight-bar" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><span style="width:${Math.min(100, Math.max(0, value))}%"></span></div>`;
}
async function insightApi(path) {
  const t = getStoredTokens();
  return parseResponse(
    await fetch("/student/" + path, {
      headers: authHeaders(t.accessToken, t.tenantId),
      signal: AbortSignal.timeout(15000),
    }),
  );
}
function renderHomeInsights(path) {
  if (isPlatformUser || !path.today) return;
  const p = path.overallProgress;
  $("home-insights-values").innerHTML =
    `<span>⭐ <strong>${path.today.totalPoints}</strong> XP</span><span>🔥 <strong>${path.today.currentStreak}</strong> gün</span>${p ? `<span>📈 <strong>${p.completed}/${p.total}</strong> adım</span>` : ""}`;
  $("home-insights").classList.remove("hidden");
}
function renderProgressList(items) {
  $("progress-skills").innerHTML = items?.length
    ? items
        .map(
          (
            p,
          ) => `<article class="insight-panel skill-progress-card" data-skill-id="${escapeHtml(p.skillId)}">
    <div class="skill-title"><span aria-hidden="true">🎯</span><h4>${escapeHtml(p.skillName)}</h4><strong class="skill-accuracy">${formatAccuracy(p.accuracy)}</strong></div>
          ${p.periodStart ? `<p class="muted skill-period">${insightDate(p.periodStart, false, true)} – ${insightDate(p.periodEnd, false, true)}</p>` : ""}
    ${insightBar(p.accuracy, p.skillName + " doğruluk")}
    <dl class="insight-facts"><div><dt>Oturum</dt><dd class="skill-sessions">${p.sessionCount}</dd></div><div><dt>Cevap</dt><dd class="skill-attempts">${p.attemptCount}</dd></div><div><dt>Doğru</dt><dd class="skill-correct">${p.correctCount}</dd></div></dl>
    ${p.avgTimeMs !== null && p.avgTimeMs !== undefined ? `<p class="skill-time">⏱ Ortalama cevap süresi: <strong>${formatAvgTime(p.avgTimeMs)}</strong></p>` : ""}</article>`,
        )
        .join("")
    : '<div class="insight-empty"><span aria-hidden="true">🌱</span><h4>İlk adımın seni bekliyor</h4><p>Bir çalışma tamamladığında beceri ilerlemen burada görünecek.</p><button type="button" class="btn btn-primary" data-insight-path>Öğrenme yoluna git</button></div>';
}
function renderInsightHistory(data) {
  insightHistoryPage = data.page;
  const status = {
    COMPLETED: "✓ Tamamlandı",
    IN_PROGRESS: "◷ Devam ediyor",
    ABANDONED: "Yarım kaldı",
    CANCELLED: "İptal edildi",
  };
  $("progress-history").innerHTML = data.items.length
    ? data.items
        .map(
          (s) =>
            `<article class="insight-activity"><span aria-hidden="true">${s.assessmentId ? "📋" : "📚"}</span><div><h4>${escapeHtml(s.templateVersion.template.title)}</h4><p>${s.assessmentId ? "Değerlendirme" : s.assignmentId ? "Ödev" : "Alıştırma"} · ${escapeHtml(status[s.status] || s.status)}</p><time>${insightDate(s.completedAt || s.startedAt, true)}</time>${s.scoreSummary && Number.isFinite(s.scoreSummary.averageScore) ? `<p>Puan: ${formatAccuracy(s.scoreSummary.averageScore)}</p>` : ""}</div></article>`,
        )
        .join("")
    : '<p class="muted">Henüz çalışma kaydın yok. Hazır olduğunda öğrenme yolundan başlayabilirsin.</p>';
  $("history-page").textContent = data.total
    ? `${data.page} / ${Math.ceil(data.total / data.pageSize)}`
    : "0 çalışma";
  $("history-prev").disabled = data.page <= 1;
  $("history-next").disabled = data.page * data.pageSize >= data.total;
}
async function loadInsightHistory(page) {
  const run = ++historyRequest,
    scope = insightScope();
  $("history-prev").disabled = $("history-next").disabled = true;
  try {
    const data = await insightApi("history?page=" + page + "&pageSize=5");
    if (run === historyRequest && scope === insightScope()) renderInsightHistory(data);
  } catch {
    if (run !== historyRequest || scope !== insightScope()) return;
    $("progress-error").textContent = "Çalışma geçmişi yüklenemedi. Yenile ile tekrar dene.";
    $("progress-error").classList.remove("hidden");
  }
}
async function loadProgress() {
  const run = ++progressRequest,
    scope = insightScope();
  historyRequest++;
  $("progress-error").classList.add("hidden");
  $("progress-status").textContent = "İlerlemen yükleniyor…";
  $("progress-refresh").disabled = true;
  $("page-progress").setAttribute("aria-busy", "true");
  for (const id of [
    "progress-summary",
    "progress-path",
    "progress-skills",
    "progress-study",
    "progress-history",
  ])
    $(id).replaceChildren();
  $("history-prev").disabled = $("history-next").disabled = true;
  const paths = ["progress", "gamification", "history?page=1&pageSize=5", "learning-path"];
  const results = await Promise.allSettled(paths.map(insightApi));
  if (run !== progressRequest || scope !== insightScope()) return;
  const [progress, gamma, history, path] = results.map((r) =>
    r.status === "fulfilled" ? r.value : null,
  );
  const summary = progress?.summary;
  $("progress-summary").innerHTML =
    insightMetric("⭐", "Toplam XP", gamma?.totalPoints ?? "—", "insight-gold", "progress-xp") +
    insightMetric(
      "🔥",
      "Seri (gün)",
      gamma?.currentDays ?? "—",
      "insight-orange",
      "progress-streak",
    ) +
    insightMetric(
      "📚",
      "Tamamlanan oturum",
      summary?.sessionCount ?? "—",
      "",
      "progress-sessions",
    ) +
    insightMetric(
      "🎯",
      "Doğruluk",
      formatAccuracy(summary?.accuracy),
      "insight-purple",
      "progress-accuracy",
    );
  if (progress) {
    renderProgressList(progress.items);
    $("progress-study").innerHTML =
      `<dl class="insight-facts"><div><dt>Cevap</dt><dd id="progress-attempts">${summary.attemptCount}</dd></div><div><dt>Doğru</dt><dd id="progress-correct">${summary.correctCount}</dd></div><div><dt>Puanlanan</dt><dd>${summary.scoredCount}</dd></div></dl><p class="muted">Tamamlanan oturumların tüm cevapları. Doğruluk yalnızca puanlanan cevaplar üzerinden hesaplanır.</p>`;
  }
  if (history) renderInsightHistory(history);
  if (path) {
    const p = path.overallProgress;
    $("progress-path").innerHTML =
      `<div><p class="insight-eyebrow">ÖĞRENME YOLUN</p><h3>${path.currentLevel ? escapeHtml(path.currentLevel.name) : "Seviyen henüz belirlenmedi"}</h3><p>${p.completed} / ${p.total} adım tamamlandı · ${p.percent}%</p>${insightBar(p.total ? p.completed / p.total : null, "Öğrenme yolu")}</div><button type="button" class="btn btn-primary" data-insight-path>Öğrenme yoluna git</button>`;
    renderHomeInsights(path);
  }
  if (gamma) observeInsightAwards(gamma);
  const failed = results.some((r) => r.status === "rejected");
  $("progress-status").textContent = failed ? "" : "İlerlemen güncel.";
  if (failed) {
    $("progress-error").textContent = "Bazı bilgiler yüklenemedi. Yenile ile tekrar dene.";
    $("progress-error").classList.remove("hidden");
  }
  $("progress-refresh").disabled = false;
  $("page-progress").setAttribute("aria-busy", "false");
}
function setupProgressEvents() {
  $("progress-refresh").addEventListener("click", loadProgress);
  $("home-progress-link").addEventListener("click", () => navigate("progress"));
  $("history-prev").addEventListener("click", () => loadInsightHistory(insightHistoryPage - 1));
  $("history-next").addEventListener("click", () => loadInsightHistory(insightHistoryPage + 1));
  $("page-progress").addEventListener("click", (event) => {
    if (event.target.closest("[data-insight-path]")) {
      navigate("dashboard");
      $("learning-path-card").scrollIntoView({ block: "start" });
    }
  });
}
const GAMIFICATION_EVENT_LABELS = {
  DAILY_LOGIN: "Günlük giriş",
  CORRECT_ANSWER: "Doğru cevap",
  EXERCISE_COMPLETED: "Egzersiz tamamlandı",
};
const INSIGHT_SOURCE_LABELS = {
  AUTH_LOGIN: "Giriş",
  ATTEMPT: "Cevap",
  EXERCISE_SESSION: "Alıştırma",
  STREAK: "Seri",
};
function observeInsightAwards(data) {
  if (!insightsIdentity || isPlatformUser) return new Set();
  $("topbar-xp").textContent = String(data.totalPoints ?? "—");
  $("topbar-streak").textContent = String(data.currentDays ?? "—");
  const key = "oku.badges.seen." + insightsIdentity;
  let previous = null;
  try {
    previous = JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    /* optional storage */
  }
  const fresh = insightNewAwards.get(insightsIdentity) || new Set();
  if (Array.isArray(previous))
    for (const badge of data.badges || []) if (!previous.includes(badge.id)) fresh.add(badge.id);
  insightNewAwards.set(insightsIdentity, fresh);
  try {
    sessionStorage.setItem(key, JSON.stringify((data.badges || []).map((b) => b.id)));
  } catch {
    /* optional storage */
  }
  return fresh;
}
function renderGamification(data) {
  const fresh = observeInsightAwards(data);
  insightAwards = data.badges || [];
  $("gamification-total-points").textContent = String(data.totalPoints);
  $("gamification-current-days").textContent = String(data.currentDays);
  $("gamification-longest-days").textContent = String(data.longestDays);
  $("gamification-badge-count").textContent = String(insightAwards.length);
  $("gamification-last-activity").textContent = data.lastActivityDate
    ? "Son aktivite: " + insightDate(data.lastActivityDate)
    : "Henüz aktivite kaydı yok.";
  $("badge-celebration").textContent = insightAwards.some((b) => fresh.has(b.id))
    ? "✨ Yeni bir rozet kazandın!"
    : "";
  $("gamification-badges").innerHTML = insightAwards.length
    ? insightAwards
        .map(
          (b, index) =>
            `<button type="button" class="gamification-badge ${fresh.has(b.id) ? "badge-new" : ""}" data-badge-index="${index}" aria-label="${escapeHtml(b.name)} rozet ayrıntısı"><span class="gamification-badge-icon" aria-hidden="true">${escapeHtml(b.icon || "🏅")}</span><strong>${escapeHtml(b.name)}</strong><small>✓ ${insightDate(b.awardedAt)}</small>${fresh.has(b.id) ? '<span class="badge-new-label">Yeni</span>' : ""}</button>`,
        )
        .join("")
    : '<div class="insight-empty"><span aria-hidden="true">🌱</span><h4>Rozetlerin burada parlayacak</h4><p>Henüz kazanılmış rozet yok. Çalışmaya devam et!</p></div>';
  $("gamification-events").innerHTML = data.recentPointEvents?.length
    ? data.recentPointEvents
        .map(
          (e) =>
            `<article class="insight-activity"><span aria-hidden="true">⭐</span><div><h4>${escapeHtml(GAMIFICATION_EVENT_LABELS[e.eventType] || e.eventType)}</h4>${e.sourceType ? `<p>${escapeHtml(INSIGHT_SOURCE_LABELS[e.sourceType] || e.sourceType)}</p>` : ""}<time>${insightDate(e.createdAt, true)}</time></div><strong class="gamification-points">${e.points > 0 ? "+" : ""}${e.points} XP</strong></article>`,
        )
        .join("")
    : '<p class="muted">Henüz puan hareketi yok.</p>';
}
async function loadGamification() {
  const run = ++gamificationRequest,
    scope = insightScope();
  $("gamification-error").classList.add("hidden");
  $("gamification-status").textContent = "Kazanımların yükleniyor…";
  $("gamification-refresh").disabled = true;
  $("page-badges").setAttribute("aria-busy", "true");
  $("badge-detail").close();
  for (const id of [
    "gamification-total-points",
    "gamification-current-days",
    "gamification-longest-days",
    "gamification-badge-count",
  ])
    $(id).textContent = "—";
  for (const id of [
    "gamification-badges",
    "gamification-events",
    "gamification-last-activity",
    "badge-celebration",
  ])
    $(id).replaceChildren();
  try {
    const data = await insightApi("gamification");
    if (run !== gamificationRequest || scope !== insightScope()) return;
    renderGamification(data);
    $("gamification-status").textContent = "Kazanımların güncel.";
  } catch {
    if (run !== gamificationRequest || scope !== insightScope()) return;
    $("gamification-status").textContent = "";
    $("gamification-error").textContent = "Kazanımların yüklenemedi. Yenile ile tekrar dene.";
    $("gamification-error").classList.remove("hidden");
  } finally {
    if (run === gamificationRequest && scope === insightScope()) {
      $("gamification-refresh").disabled = false;
      $("page-badges").setAttribute("aria-busy", "false");
    }
  }
}
function setupGamificationEvents() {
  $("gamification-refresh").addEventListener("click", loadGamification);
  $("badge-detail-close").addEventListener("click", () => $("badge-detail").close());
  $("gamification-badges").addEventListener("click", (event) => {
    const button = event.target.closest("[data-badge-index]");
    if (!button) return;
    const badge = insightAwards[Number(button.dataset.badgeIndex)];
    if (!badge) return;
    $("badge-detail-title").textContent = badge.name;
    $("badge-detail-icon").textContent = badge.icon || "🏅";
    $("badge-detail-description").textContent =
      badge.description || "Bu rozet için açıklama eklenmemiş.";
    $("badge-detail-date").textContent = "Kazanılma tarihi: " + insightDate(badge.awardedAt, true);
    $("badge-detail-source").textContent = badge.sourceType
      ? "Kaynak: " +
        (INSIGHT_SOURCE_LABELS[badge.sourceType] || badge.sourceType) +
        (badge.sourceId ? " · " + badge.sourceId : "")
      : "Kaynak belirtilmemiş.";
    $("badge-detail").showModal();
  });
}

// ---------- Ölçme & Değerlendirme ----------

var ASSESSMENT_PAGE_SIZE = 20;
var assessmentPage = 1;
var assessmentData = [];
var assessmentFormMode = "create";
var assessmentEditingId = null;

var ASSESSMENT_STATUS_LABELS = {
  DRAFT: "Taslak",
  PUBLISHED: "Yayınlanmış",
  ARCHIVED: "Arşivlenmiş",
};

var ASSESSMENT_TYPE_LABELS = {
  PLACEMENT: "Seviye Tespit",
  DIAGNOSTIC: "Tanılama",
  BENCHMARK: "Benchmark",
};

function assessmentApi(path, options) {
  options = options || {};
  var tokens = getStoredTokens();
  var method = options.method || "GET";
  var headers = Object.assign(
    {},
    authHeaders(tokens.accessToken, tokens.tenantId),
    options.headers || {},
  );
  if (method === "DELETE") delete headers["content-type"];
  return fetch(
    "/admin/assessments" + path,
    Object.assign({}, options, { method: method, headers: headers }),
  );
}
function studentAssessmentApi(path, options) {
  options = options || {};
  var tokens = getStoredTokens();
  var method = options.method || "GET";
  return fetch(
    "/student/assessments" + path,
    Object.assign({}, options, {
      method: method,
      headers: Object.assign(
        {},
        authHeaders(tokens.accessToken, tokens.tenantId),
        options.headers || {},
      ),
    }),
  );
}

function assessmentStatusBadge(status) {
  var cls = {
    DRAFT: "badge badge-neutral",
    PUBLISHED: "badge badge-success",
    ARCHIVED: "badge badge-warning",
  }[status];
  return (
    '<span class="' +
    (cls || "badge") +
    '">' +
    (ASSESSMENT_STATUS_LABELS[status] || status) +
    "</span>"
  );
}

function assessmentTypeBadge(type) {
  return '<span class="badge badge-info">' + (ASSESSMENT_TYPE_LABELS[type] || type) + "</span>";
}

function showAssessmentError(msg) {
  var el = $("assessment-error");
  if (el) {
    el.textContent = msg;
    el.classList.remove("hidden");
  }
}
function hideAssessmentError() {
  var el = $("assessment-error");
  if (el) el.classList.add("hidden");
}

async function loadAssessments() {
  hideAssessmentError();
  var tbody = $("assessment-list-body");
  $("student-assessment-view")?.classList.toggle("hidden", isPlatformUser !== false);
  document
    .querySelectorAll("#page-assessments > .card")
    .forEach((panel) => panel.classList.toggle("hidden", isPlatformUser === false));
  if (tbody)
    tbody.innerHTML =
      '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Yükleniyor…</td></tr>';
  var search = $("assessment-search") ? $("assessment-search").value.trim() : "";
  var type = $("assessment-type-filter") ? $("assessment-type-filter").value : "";
  var status = $("assessment-status-filter") ? $("assessment-status-filter").value : "";
  var params = new URLSearchParams({ page: assessmentPage, pageSize: ASSESSMENT_PAGE_SIZE });
  if (search) params.set("search", search);
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  try {
    var res =
      isPlatformUser === false
        ? await studentAssessmentApi("")
        : await assessmentApi("?" + params.toString());
    var body = await parseResponse(res);
    assessmentData = body.items;
    renderAssessmentList(body.total);
  } catch (err) {
    if (tbody)
      tbody.innerHTML =
        '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">—</td></tr>';
    showAssessmentError(err.message || "Değerlendirmeler yüklenemedi.");
  }
}

function renderAssessmentList(total) {
  var tbody = $("assessment-list-body");
  if (isPlatformUser === false) {
    var cards = $("student-assessment-cards");
    cards.innerHTML = assessmentData.length
      ? assessmentData
          .map(function (a) {
            var inProgress = a.sessionStatus === "IN_PROGRESS" || a.hasInProgressSession;
            var typeCopy =
              {
                PLACEMENT: "Seviye Belirleme",
                DIAGNOSTIC: "Tanılama",
                BENCHMARK: "Gelişim Ölçümü",
              }[a.type] || "Değerlendirme";
            var action = inProgress ? "Devam Et" : a.hasResult ? "Sonuçları Gör" : "Başla";
            return `<article class="learning-card assessment-student-card"><div class="learning-card-icon assessment-icon" aria-hidden="true">${a.type === "PLACEMENT" ? "🧭" : "📊"}</div><div class="learning-card-content"><div class="learning-card-topline"><span class="badge badge-info">${typeCopy}</span>${a.levelName ? `<span class="muted">${escapeHtml(a.levelName)}</span>` : ""}</div><h3>${escapeHtml(a.title)}</h3><p class="muted">${a.type === "PLACEMENT" ? "Seviyeni ölç, sana uygun öğrenme yolunu keşfet." : "Gelişimini sakin bir tempoda gör."}</p>${a.questionCount ? `<p class="assessment-meta">${a.questionCount} soru${a.attemptedCount ? ` · ${a.attemptedCount} cevaplandı` : ""}</p>` : ""}${a.hasResult ? `<p class="assessment-result-line">Sonuç: ${a.score == null ? "puan henüz yok" : Math.round(a.score * 100) + "%"}${a.resultLevelName ? " · " + escapeHtml(a.resultLevelName) : ""}</p>` : ""}<div class="learning-card-actions"><button type="button" class="btn ${a.hasResult ? "btn-ghost" : "btn-primary"}" data-assessment-student-action="${a.id}">${action}</button><button type="button" class="btn btn-ghost" data-assessment-student-detail="${a.id}">Detay</button></div></div></article>`;
          })
          .join("")
      : '<div class="empty-learning-state"><div aria-hidden="true">🧭</div><h3>Henüz uygun bir değerlendirme yok.</h3><p class="muted">Öğrenme yolun hazır olduğunda burada görünecek.</p></div>';
    tbody.innerHTML = "";
    $("assessment-page-info").textContent = "";
    $("assessment-prev-btn").disabled = true;
    $("assessment-next-btn").disabled = true;
    return;
  }
  if (assessmentData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Değerlendirme bulunamadı.</td></tr>';
  } else {
    tbody.innerHTML = assessmentData
      .map(function (a) {
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(a.title) +
          "</td>" +
          "<td>" +
          assessmentTypeBadge(a.type) +
          "</td>" +
          "<td>" +
          escapeHtml(a.levelName || "—") +
          "</td>" +
          "<td>" +
          assessmentStatusBadge(a.status) +
          "</td>" +
          '<td class="numeric">' +
          a.sessionCount +
          "</td>" +
          '<td class="numeric">' +
          a.resultCount +
          "</td>" +
          '<td class="text-right">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-assessment-edit-id="' +
          a.id +
          '">Düzenle</button> ' +
          '<button type="button" class="btn btn-ghost btn-sm btn-danger" data-assessment-delete-id="' +
          a.id +
          '">Sil</button>' +
          "</td></tr>"
        );
      })
      .join("");
  }
  var totalPages = Math.max(1, Math.ceil(total / ASSESSMENT_PAGE_SIZE));
  var info = $("assessment-page-info");
  if (info)
    info.textContent = total + " değerlendirme · sayfa " + assessmentPage + "/" + totalPages;
  var prevBtn = $("assessment-prev-btn");
  var nextBtn = $("assessment-next-btn");
  if (prevBtn) prevBtn.disabled = assessmentPage <= 1;
  if (nextBtn) nextBtn.disabled = assessmentPage >= totalPages;
}

function setAssessmentFormLoading(isLoading) {
  var btn = $("assessment-form-submit");
  if (!btn) return;
  btn.disabled = isLoading;
  var label = btn.querySelector(".btn-label");
  var spinner = btn.querySelector(".btn-spinner");
  if (label) label.classList.toggle("hidden", isLoading);
  if (spinner) spinner.classList.toggle("hidden", !isLoading);
}

function closeAssessmentForm() {
  var modal = $("assessment-form-modal");
  if (modal) modal.classList.add("hidden");
}

async function populateAssessmentFormDropdowns() {
  var templateSel = $("assessment-form-template");
  if (!templateSel) return;
  templateSel.innerHTML = '<option value="">Yükleniyor…</option>';
  var hdrs = authHeaders(getStoredTokens().accessToken, getStoredTokens().tenantId);
  try {
    var templateRes = await fetch("/admin/templates?page=1&pageSize=100&status=PUBLISHED", {
      headers: hdrs,
    }).then(function (r) {
      return parseResponse(r);
    });
    templateSel.innerHTML = templateRes.items.length
      ? '<option value="">Şablon seçin…</option>' +
        templateRes.items
          .map(function (t) {
            return '<option value="' + t.id + '">' + escapeHtml(t.title) + "</option>";
          })
          .join("")
      : '<option value="">Yayınlanmış şablon bulunamadı</option>';
  } catch (_e) {
    void _e;
    templateSel.innerHTML = '<option value="">Şablonlar yüklenemedi</option>';
  }
}

async function openAssessmentForm(mode, a) {
  assessmentFormMode = mode;
  assessmentEditingId = (a && a.id) || null;
  var titleEl = $("assessment-form-title");
  if (titleEl)
    titleEl.textContent = mode === "create" ? "Yeni Değerlendirme" : "Değerlendirmeyi düzenle";
  var errorEl = $("assessment-form-error");
  if (errorEl) errorEl.classList.add("hidden");
  var titleInput = $("assessment-form-title-input");
  var typeSelect = $("assessment-form-type");
  var templateSelect = $("assessment-form-template");
  if (mode === "edit" && a) {
    if (titleInput) titleInput.value = a.title || "";
    if (typeSelect) typeSelect.value = a.type || "PLACEMENT";
    var config = a.config || {};
    if (templateSelect) templateSelect.value = config.templateId || "";
  } else {
    if (titleInput) titleInput.value = "";
    if (typeSelect) typeSelect.value = "PLACEMENT";
    if (templateSelect) templateSelect.value = "";
  }
  await populateAssessmentFormDropdowns();
  if (mode === "edit" && a) {
    var config2 = a.config || {};
    if (templateSelect) templateSelect.value = config2.templateId || "";
  }
  var modal = $("assessment-form-modal");
  if (modal) modal.classList.remove("hidden");
}

async function handleAssessmentFormSubmit(e) {
  e.preventDefault();
  hideAssessmentFormError();
  setAssessmentFormLoading(true);
  var titleInput = $("assessment-form-title-input");
  var typeSelect = $("assessment-form-type");
  var templateSelect = $("assessment-form-template");
  var payload = {
    title: titleInput ? titleInput.value.trim() : "",
    type: typeSelect ? typeSelect.value : "PLACEMENT",
    config: { templateId: templateSelect ? templateSelect.value : "" },
  };
  try {
    if (assessmentFormMode === "edit" && assessmentEditingId) {
      await assessmentApi("/" + assessmentEditingId, {
        method: "PUT",
        body: JSON.stringify({ title: payload.title, type: payload.type }),
      });
    } else {
      await assessmentApi("", { method: "POST", body: JSON.stringify(payload) });
    }
    closeAssessmentForm();
    await loadAssessments();
  } catch (err) {
    showAssessmentFormError(err.message || "İşlem başarısız.");
  } finally {
    setAssessmentFormLoading(false);
  }
}

function showAssessmentFormError(msg) {
  var el = $("assessment-form-error");
  if (el) {
    el.textContent = msg;
    el.classList.remove("hidden");
  }
}
function hideAssessmentFormError() {
  var el = $("assessment-form-error");
  if (el) el.classList.add("hidden");
}

async function handleAssessmentDelete(id) {
  if (!confirm("Bu değerlendirmeyi silmek istediğinize emin misiniz?")) return;
  try {
    await assessmentApi("/" + id, { method: "DELETE" });
    await loadAssessments();
  } catch (err) {
    showAssessmentError(err.message || "Silme başarısız.");
  }
}

function setupAssessmentEvents() {
  var createBtn = $("assessment-create-btn");
  if (createBtn)
    createBtn.addEventListener("click", function () {
      openAssessmentForm("create");
    });

  var form = $("assessment-form");
  if (form) form.addEventListener("submit", handleAssessmentFormSubmit);

  var closeBtn = $("assessment-form-close");
  if (closeBtn) closeBtn.addEventListener("click", closeAssessmentForm);

  var cancelBtn = $("assessment-form-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", closeAssessmentForm);

  var searchInput = $("assessment-search");
  if (searchInput)
    searchInput.addEventListener("input", function () {
      assessmentPage = 1;
      void loadAssessments();
    });

  var typeFilter = $("assessment-type-filter");
  if (typeFilter)
    typeFilter.addEventListener("change", function () {
      assessmentPage = 1;
      void loadAssessments();
    });

  var statusFilter = $("assessment-status-filter");
  if (statusFilter)
    statusFilter.addEventListener("change", function () {
      assessmentPage = 1;
      void loadAssessments();
    });

  var prevBtn = $("assessment-prev-btn");
  if (prevBtn)
    prevBtn.addEventListener("click", function () {
      if (assessmentPage > 1) {
        assessmentPage--;
        void loadAssessments();
      }
    });

  var nextBtn = $("assessment-next-btn");
  if (nextBtn)
    nextBtn.addEventListener("click", function () {
      assessmentPage++;
      void loadAssessments();
    });

  var listBody = $("assessment-list-body");
  if (listBody)
    listBody.addEventListener("click", function (e) {
      var target = e.target;
      var editId = target.getAttribute && target.getAttribute("data-assessment-edit-id");
      var deleteId = target.getAttribute && target.getAttribute("data-assessment-delete-id");
      if (editId) {
        var item = assessmentData.find(function (a) {
          return a.id === editId;
        });
        if (item) openAssessmentForm("edit", item);
      } else if (deleteId) {
        void handleAssessmentDelete(deleteId);
      }
    });
  var studentCards = $("student-assessment-cards");
  if (studentCards)
    studentCards.addEventListener("click", function (e) {
      var target = e.target.closest(
        "[data-assessment-student-action], [data-assessment-student-detail]",
      );
      if (!target) return;
      var id = target.dataset.assessmentStudentAction || target.dataset.assessmentStudentDetail;
      var item = assessmentData.find(function (a) {
        return a.id === id;
      });
      if (!item) return;
      if (target.dataset.assessmentStudentDetail) return void openStudentAssessmentDetail(id);
      if (item.hasResult) return void openStudentAssessmentDetail(id);
      void startStudentAssessment(id);
    });
  $("assessment-detail-close")?.addEventListener("click", function () {
    $("assessment-detail-modal").classList.add("hidden");
  });
  $("assessment-detail-start")?.addEventListener("click", function () {
    var id = $("assessment-detail-start").dataset.assessmentId;
    if (id) {
      $("assessment-detail-modal").classList.add("hidden");
      void startStudentAssessment(id);
    }
  });
}

async function openStudentAssessmentDetail(id) {
  var modal = $("assessment-detail-modal");
  var body = $("assessment-detail-body");
  modal.classList.remove("hidden");
  body.innerHTML = '<p class="muted">Yükleniyor…</p>';
  try {
    var item = await parseResponse(await studentAssessmentApi("/" + encodeURIComponent(id)));
    var typeCopy =
      { PLACEMENT: "Seviye Belirleme", DIAGNOSTIC: "Tanılama", BENCHMARK: "Gelişim Ölçümü" }[
        item.type
      ] || "Değerlendirme";
    $("assessment-detail-title").textContent = item.title;
    body.innerHTML = `<div class="assessment-detail-hero"><span class="learning-card-icon assessment-icon" aria-hidden="true">${item.type === "PLACEMENT" ? "🧭" : "📊"}</span><div><p class="insight-eyebrow">${typeCopy}</p><h4>${escapeHtml(item.title)}</h4><p class="muted">${item.type === "PLACEMENT" ? "Seviyemi Ölç: sonuçların öğrenme yolunu kişiselleştirmeye yardımcı olur." : "Kendini ölç ve gelişimini takip et."}</p></div></div><dl class="info-grid"><div class="info-item"><dt>Soru sayısı</dt><dd>${item.questionCount || "—"}</dd></div><div class="info-item"><dt>Seviye</dt><dd>${escapeHtml(item.levelName || "Belirlenmedi")}</dd></div><div class="info-item"><dt>Durum</dt><dd>${item.hasInProgressSession ? "Devam ediyor" : item.hasResult ? "Tamamlandı" : "Hazır"}</dd></div>${item.hasResult ? `<div class="info-item"><dt>Sonuç</dt><dd>${item.score == null ? "Puan henüz hesaplanmadı" : Math.round(item.score * 100) + "%"}${item.resultLevelName ? " · " + escapeHtml(item.resultLevelName) : ""}</dd></div>` : ""}</dl>`;
    var btn = $("assessment-detail-start");
    btn.dataset.assessmentId = item.id;
    btn.textContent = item.hasInProgressSession
      ? "Devam Et"
      : item.hasResult
        ? "Sonucu Gör"
        : "Başla";
    btn.classList.toggle("hidden", item.hasResult && !item.hasInProgressSession);
  } catch (err) {
    body.innerHTML = `<p class="error">${escapeHtml(err.message || "Değerlendirme yüklenemedi.")}</p>`;
  }
}
async function startStudentAssessment(id) {
  try {
    var data = await parseResponse(
      await studentAssessmentApi("/" + encodeURIComponent(id) + "/start", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    exerciseRequestedSessionId = data.sessionId;
    navigate("exercise");
  } catch (err) {
    showAssessmentError(err.message || "Değerlendirme başlatılamadı.");
  }
}
