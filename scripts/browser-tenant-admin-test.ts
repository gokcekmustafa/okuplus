import { chromium } from "playwright-core";

/**
 * Kurum (Tenant) yönetimi — gerçek tarayıcı (Chrome/Edge) E2E testi.
 *
 * Super Admin ile: Kurumlar menüsü görünür, liste/oluşturma/düzenleme/durum
 * değiştirme/detay/silme akışları çalışır. Normal tenant kullanıcısı için
 * Kurumlar menüsü GÖRÜNMEMELİDİR.
 */
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE_URL = "http://127.0.0.1:3000";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@okuplus.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@okuplus.dev";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-pass-123";

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const consoleErrors = [];

  async function newPage() {
    const page = await browser.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));
    return page;
  }

  async function login(page, email, password) {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.fill("#login-email", email);
    await page.fill("#login-password", password);
    await page.click("#login-submit");
    await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  }

  // ================= Super Admin =================
  const page = await newPage();
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  // 1) Kurumlar menüsü görünür ve açılır.
  const tenantNavVisible = await page.isVisible('.nav-item[data-page="tenants"]');
  console.log(`1) Super Admin: Kurumlar menüsü görünür: ${tenantNavVisible}`);

  await page.click('.nav-item[data-page="tenants"]');
  await page.waitForSelector("#page-tenants:not(.hidden)", { timeout: 5000 });
  console.log("2) Kurumlar sayfası açıldı: OK");

  // 2) Liste yüklenir.
  await page.waitForSelector("#tenant-list-body tr:not(.empty-cell)", { timeout: 5000 });
  const rows = await page.$$eval("#tenant-list-body tr", (els) => els.length);
  console.log(`3) Listelenen kurum satırı: ${rows}`);

  // 3) Yeni kurum oluştur.
  const uniqueName = `E2E Kurum ${Date.now()}`;
  const uniqueSlug = `e2e-kurum-${Date.now().toString().slice(-8)}`;
  await page.click("#tenant-create-btn");
  await page.waitForSelector("#tenant-form-modal:not(.hidden)", { timeout: 5000 });
  await page.fill("#tenant-form-name", uniqueName);
  await page.fill("#tenant-form-slug", uniqueSlug);
  await page.click("#tenant-form-submit");
  await page.waitForSelector("#tenant-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${uniqueName}`, { timeout: 5000 });
  console.log(`4) Kurum oluşturuldu: ${uniqueName} (${uniqueSlug})`);

  // Oluşturulan satırı bul (en üstte, createdAt desc).
  const row = page.locator("tr", { hasText: uniqueName });
  await row.waitFor({ timeout: 5000 });

  // 4) Detay görüntüle.
  await row.locator("button[data-detail-id]").click();
  await page.waitForSelector("#tenant-detail-modal:not(.hidden)", { timeout: 5000 });
  const detailTitle = await page.$eval("#tenant-detail-title", (el) => el.textContent);
  console.log(`5) Detay açıldı: ${detailTitle}`);

  // 5) Durum değiştir (SUSPENDED).
  await page.selectOption("#tenant-detail-status", "SUSPENDED");
  await page.click("#tenant-detail-status-btn");
  await page.waitForTimeout(800);
  const suspendedBadge = await page
    .$eval("#tenant-detail-body", (el) => el.textContent)
    .catch(() => "");
  console.log(
    `6) Durum değişikliği sonrası detay: ${suspendedBadge.includes("Askıda") ? "Askıda OK" : "HATA"}`,
  );

  // 6) Detaydan düzenleme.
  await page.click("#tenant-detail-edit");
  await page.waitForSelector("#tenant-form-modal:not(.hidden)", { timeout: 5000 });
  const editName = `${uniqueName} Güncel`;
  await page.fill("#tenant-form-name", editName);
  await page.click("#tenant-form-submit");
  await page.waitForSelector("#tenant-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${editName}`, { timeout: 5000 });
  console.log(`7) Kurum düzenlendi: ${editName}`);

  // 7) Silme (confirm dialog).
  const row2 = page.locator("tr", { hasText: editName });
  await row2.waitFor({ timeout: 5000 });
  page.once("dialog", (dialog) => void dialog.accept());
  await row2.locator("button[data-delete-id]").click();
  await page.waitForTimeout(1200);
  const afterDelete = await page.$eval("#tenant-list-body", (el) => el.textContent);
  const deletedGone = !afterDelete.includes(editName);
  console.log(`8) Kurum silindi (listeden kayboldu): ${deletedGone}`);

  await page.close();

  // ================= Normal tenant kullanıcısı =================
  const demo = await newPage();
  await login(demo, DEMO_EMAIL, DEMO_PASSWORD);
  const tenantNavHidden = await demo.$eval('.nav-item[data-page="tenants"]', (el) =>
    el.classList.contains("hidden"),
  );
  console.log(`9) Normal kullanıcı: Kurumlar menüsü gizli: ${tenantNavHidden}`);
  await demo.close();

  console.log(
    `10) console hataları: ${consoleErrors.length === 0 ? "yok" : consoleErrors.join(" | ")}`,
  );
  await browser.close();
}

main().catch((err) => {
  console.error("TEST HATASI:", err);
  process.exit(1);
});
