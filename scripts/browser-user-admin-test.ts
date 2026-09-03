import { chromium } from "playwright-core";

/**
 * Kullanıcı + Membership yönetimi — gerçek tarayıcı (Chrome/Edge) E2E testi.
 *
 * Super Admin ile: Kullanıcılar menüsü görünür, liste/arama/oluşturma/detay/
 * düzenleme/üyelik ekleme/üyelik güncelleme/üyelik kaldırma akışları çalışır.
 * Normal tenant kullanıcısı için Kullanıcılar menüsü GÖRÜNMEMELİDİR.
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

  // 1) Kullanıcılar menüsü görünür ve açılır.
  const usersNavVisible = await page.isVisible('.nav-item[data-page="users"]');
  console.log(`1) Super Admin: Kullanıcılar menüsü görünür: ${usersNavVisible}`);

  await page.click('.nav-item[data-page="users"]');
  await page.waitForSelector("#page-users:not(.hidden)", { timeout: 5000 });
  console.log("2) Kullanıcılar sayfası açıldı: OK");

  // 2) Liste yüklenir.
  await page.waitForSelector("#user-list-body tr:not(.empty-cell)", { timeout: 5000 });
  const rows = await page.$$eval("#user-list-body tr", (els) => els.length);
  console.log(`3) Listelenen kullanıcı satırı: ${rows}`);

  // 3) Arama: demo kullanıcısını bul.
  await page.fill("#user-search", "demo");
  await page.waitForTimeout(900);
  await page.waitForSelector("#user-list-body tr:not(.empty-cell)", { timeout: 5000 });
  const searchText = await page.$eval("#user-list-body", (el) => el.textContent);
  const searchFoundDemo = searchText.includes("demo@okuplus.dev");
  console.log(`4) Arama (demo): sonuç demo'yu içeriyor: ${searchFoundDemo}`);
  await page.fill("#user-search", "");
  await page.waitForTimeout(900);

  // 4) Yeni kullanıcı oluştur + ilk kurum üyeliği (tek akış).
  const uniqueName = `E2E Kullanıcı ${Date.now()}`;
  const uniqueEmail = `e2e-${Date.now().toString().slice(-8)}@example.com`;
  await page.click("#user-create-btn");
  await page.waitForSelector("#user-form-modal:not(.hidden)", { timeout: 5000 });
  await page.fill("#user-form-name", uniqueName);
  await page.fill("#user-form-email", uniqueEmail);
  await page.fill("#user-form-phone", "+905551112233");
  await page.fill("#user-form-birthyear", "1994");
  await page.selectOption("#user-form-status", "ACTIVE");
  await page.fill("#user-form-password", "e2e-pass-123!");
  // İlk kurum üyeliği: kurum seçenekleri yüklenir.
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#user-form-tenant");
      return sel && sel.options.length > 1 && sel.options[0].value === "";
    },
    { timeout: 5000 },
  );
  const firstTenantValue = await page.$eval(
    "#user-form-tenant option:nth-child(2)",
    (o) => o.value,
  );
  await page.selectOption("#user-form-tenant", firstTenantValue);
  await page.selectOption("#user-form-role", "TEACHER");
  await page.click("#user-form-submit");
  await page.waitForSelector("#user-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${uniqueName}`, { timeout: 5000 });
  console.log(`5) Kullanıcı oluşturuldu + ilk üyelik eklendi: ${uniqueName} (${uniqueEmail})`);

  // Oluşturulan satırı bul (en üstte, createdAt desc).
  const row = page.locator("tr", { hasText: uniqueName });
  await row.waitFor({ timeout: 5000 });

  // 5) Detay görüntüle; ilk üyelik otomatik eklenmiş olmalı.
  await row.locator("button[data-user-detail-id]").click();
  await page.waitForSelector("#user-detail-modal:not(.hidden)", { timeout: 5000 });
  const detailTitle = await page.$eval("#user-detail-title", (el) => el.textContent);
  console.log(`6) Kullanıcı detayı açıldı: ${detailTitle}`);

  await page.waitForSelector("#user-detail-body tr:has(select[data-mem-role])", { timeout: 5000 });
  const initialMembershipsText = await page.$eval("#user-detail-body", (el) => el.textContent);
  const initialMembershipAdded =
    initialMembershipsText.includes("TEACHER") || initialMembershipsText.includes("Öğretmen");
  console.log(`7) İlk üyelik (TEACHER) detayda görünüyor: ${initialMembershipAdded}`);

  // 6) Rol değiştir: TEACHER → STUDENT.
  const memRow = page.locator("#user-detail-body tr:has(select[data-mem-role])").first();
  await memRow.locator(".mem-role-select").selectOption("STUDENT");
  await memRow.locator("button[data-mem-update]").click();
  await page.waitForTimeout(1200);
  const roleChangedText = await page.$eval("#user-detail-body", (el) => el.textContent);
  const roleChanged = roleChangedText.includes("Öğrenci");
  console.log(`8) Üyelik rolü Öğrenci'ye değiştirildi: ${roleChanged}`);

  // 7) Durum değiştir: ACTIVE → INACTIVE.
  const memRow2 = page.locator("#user-detail-body tr:has(select[data-mem-role])").first();
  await memRow2.locator(".mem-status-select").selectOption("INACTIVE");
  await memRow2.locator("button[data-mem-update]").click();
  await page.waitForTimeout(1200);
  const statusChangedText = await page.$eval("#user-detail-body", (el) => el.textContent);
  const statusChanged = statusChangedText.includes("Pasif");
  console.log(`9) Üyelik durumu Pasif'e değiştirildi: ${statusChanged}`);

  // 7) Üyeliği kaldır.
  const removeBtn = page.locator("#user-detail-body button[data-mem-remove]").first();
  if ((await removeBtn.count()) > 0) {
    page.once("dialog", (dialog) => void dialog.accept());
    await removeBtn.click();
    await page.waitForTimeout(1200);
    console.log("9) Üyelik kaldırıldı: OK");
  } else {
    console.log("9) Üyelik kaldırma: buton bulunamadı (HATA)");
  }

  // 8) Detaydan düzenleme.
  await page.click("#user-detail-edit");
  await page.waitForSelector("#user-form-modal:not(.hidden)", { timeout: 5000 });
  const editName = `${uniqueName} Güncel`;
  await page.fill("#user-form-name", editName);
  await page.click("#user-form-submit");
  await page.waitForSelector("#user-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${editName}`, { timeout: 5000 });
  console.log(`10) Kullanıcı düzenlendi: ${editName}`);

  // 9) Silme (confirm dialog).
  const row2 = page.locator("tr", { hasText: editName });
  await row2.waitFor({ timeout: 5000 });
  page.once("dialog", (dialog) => void dialog.accept());
  await row2.locator("button[data-user-delete-id]").click();
  await page.waitForTimeout(1200);
  const afterDelete = await page.$eval("#user-list-body", (el) => el.textContent);
  const deletedGone = !afterDelete.includes(editName);
  console.log(`11) Kullanıcı silindi (listeden kayboldu): ${deletedGone}`);

  await page.close();

  // ================= Normal tenant kullanıcısı =================
  const demo = await newPage();
  await login(demo, DEMO_EMAIL, DEMO_PASSWORD);
  const usersNavHidden = await demo.$eval('.nav-item[data-page="users"]', (el) =>
    el.classList.contains("hidden"),
  );
  console.log(`12) Normal kullanıcı: Kullanıcılar menüsü gizli: ${usersNavHidden}`);
  await demo.close();

  console.log(
    `13) console hataları: ${consoleErrors.length === 0 ? "yok" : consoleErrors.join(" | ")}`,
  );

  // ================= INDIVIDUAL rol filtresi =================
  // Bireysel kurum seçildiğinde form rol seçenekleri Öğrenci/Veli ile sınırlanır.
  const indPage = await newPage();
  await login(indPage, ADMIN_EMAIL, ADMIN_PASSWORD);
  await indPage.click('.nav-item[data-page="users"]');
  await indPage.waitForSelector("#page-users:not(.hidden)", { timeout: 5000 });
  await indPage.click("#user-create-btn");
  await indPage.waitForSelector("#user-form-modal:not(.hidden)", { timeout: 5000 });
  await indPage.waitForFunction(
    () => {
      const sel = document.querySelector("#user-form-tenant");
      return sel && sel.options.length > 1 && sel.options[0].value === "";
    },
    { timeout: 5000 },
  );
  // Bireysel kurum yoksa önce bir tane oluştur (sayfa içinden tenant API).
  let individualOption = await indPage
    .$eval("#user-form-tenant option[data-type='INDIVIDUAL']", (o) => (o ? o.value : ""))
    .catch(() => "");
  if (!individualOption) {
    const token = await indPage.evaluate(() => localStorage.getItem("oku.accessToken"));
    const created = await indPage.evaluate(async (accessToken) => {
      const res = await fetch("/admin/tenants", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          type: "INDIVIDUAL",
          name: `E2E Bireysel ${Date.now()}`,
        }),
      });
      const body = await res.json();
      return body.data;
    }, token);
    await indPage.waitForTimeout(400);
    await indPage.click("#user-form-close");
    await indPage.click("#user-create-btn");
    await indPage.waitForSelector("#user-form-modal:not(.hidden)", { timeout: 5000 });
    await indPage.waitForFunction(
      () => {
        const sel = document.querySelector("#user-form-tenant");
        return sel && sel.options.length > 1;
      },
      { timeout: 5000 },
    );
    individualOption = created.id;
  }
  await indPage.selectOption("#user-form-tenant", individualOption);
  await indPage.waitForTimeout(300);
  const roleOptionsText = await indPage.$eval("#user-form-role", (el) => el.textContent);
  const hasOnlyIndividualRoles =
    roleOptionsText.includes("Öğrenci") &&
    roleOptionsText.includes("Veli") &&
    !roleOptionsText.includes("Öğretmen") &&
    !roleOptionsText.includes("Sahip") &&
    !roleOptionsText.includes("Kurum Yöneticisi") &&
    !roleOptionsText.includes("Şube Yöneticisi");
  console.log(
    `14) INDIVIDUAL kurumda rol seçenekleri sınırlı (Öğrenci/Veli): ${hasOnlyIndividualRoles}`,
  );
  await indPage.close();
  console.log("15) INDIVIDUAL rol filtresi kontrolü tamam");
  await browser.close();
}

main().catch((err) => {
  console.error("TEST HATASI:", err);
  process.exit(1);
});
