import { chromium } from "playwright-core";

/**
 * Gerçek tarayıcı (Chrome/Edge) ile login akışını ve UI shell'i doğrular:
 * buton tıklanabilir → POST /auth/login → access+refresh → dashboard.
 * Sonrasında navigasyon, session koruma ve logout akışını kontrol eder.
 */
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const BASE_URL = "http://127.0.0.1:3000";

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
  });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });

  // 1) Buton disabled başlamamalı (kök neden düzeltmesi).
  const disabledInitially = await page
    .$eval("#login-submit", (btn) => btn.disabled)
    .catch(() => "NOT_FOUND");
  console.log(`1) login-submit disabled baslangic: ${disabledInitially}`);

  // 2) Formu doldur ve butona tıkla.
  await page.fill("#login-email", "demo@okuplus.dev");
  await page.fill("#login-password", "demo-pass-123");
  await page.click("#login-submit");

  await page.waitForTimeout(2500);
  const loginError = await page.$eval("#login-error", (el) => el.textContent).catch(() => null);
  console.log(`2) login-error: ${loginError}`);

  // The shared demo account may intentionally remain onboarding-incomplete.
  // Shell navigation is available without mutating demo profile or consent data.
  const onboardingVisible = await page
    .$eval("#page-onboarding", (el) => !el.classList.contains("hidden"))
    .catch(() => false);
  if (onboardingVisible) {
    await page.click('.nav-item[data-page="dashboard"]');
  }

  // 3) Dashboard görüntülenir.
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  console.log("3) Dashboard goruntulendi: OK");

  // 4) Topbar bilgileri dolduruldu.
  const name = await page.$eval("#user-name", (el) => el.textContent).catch(() => null);
  const role = await page.$eval("#user-role", (el) => el.textContent).catch(() => null);
  const tenant = await page.$eval("#topbar-tenant", (el) => el.textContent).catch(() => null);
  console.log(`4) kullanici: ${name} | rol: ${role}`);
  console.log(`5) tenant: ${tenant}`);

  // 5) Sidebar öğe sayısı.
  const navCount = await page.$$eval(".nav-item", (els) => els.length);
  console.log(`6) nav-item sayisi: ${navCount}`);

  // 6) Navigasyon: her menü sayfasına geçiş.
  const isStudentShell = await page.$eval("#view-app", (el) =>
    el.classList.contains("student-shell"),
  );
  const navPages = isStudentShell
    ? ["assignments", "exercise", "assessments", "progress", "badges", "settings"]
    : ["students", "classes", "contents", "assignments", "assessments", "settings"];
  for (const pg of navPages) {
    await page.click(`.nav-item[data-page="${pg}"]`);
    await page.waitForSelector(`#page-${pg}:not(.hidden)`, { timeout: 5000 });
    const comingSoon = await page
      .$eval(`#page-${pg} .coming-soon h3`, (el) => el.textContent)
      .catch(() => null);
    console.log(`7) sayfa ${pg}: OK (${comingSoon})`);
  }
  await page.click('.nav-item[data-page="dashboard"]');
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 5000 });
  console.log("8) dashboarda geri donus: OK");

  // 7) Session localStorage'da mı?
  const stored = await page.evaluate(() => ({
    access: Boolean(localStorage.getItem("oku.accessToken")),
    refresh: Boolean(localStorage.getItem("oku.refreshToken")),
  }));
  console.log(`9) localStorage tokenlar: access=${stored.access} refresh=${stored.refresh}`);

  // 8) Sayfa yenile → session korunmalı (app'te kal).
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  console.log("10) sayfa yenilendi, dashboard korundu: OK");

  // 9) Logout → login ekranına dönüş.
  await page.click("#logout-btn");
  await page.waitForSelector("#view-login:not(.hidden)", { timeout: 10000 });
  const tokensAfterLogout = await page.evaluate(() => localStorage.getItem("oku.accessToken"));
  console.log(`11) logout sonrasi login ekrani: OK (token temiz: ${!tokensAfterLogout})`);

  console.log(
    `12) console hatalari: ${consoleErrors.length === 0 ? "yok" : consoleErrors.join(" | ")}`,
  );

  await browser.close();
}

main().catch((err) => {
  console.error("TEST HATASI:", err);
  process.exit(1);
});
