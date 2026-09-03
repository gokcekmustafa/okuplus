import { chromium } from "playwright-core";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.fill("#login-email", "demo@okuplus.dev");
  await page.fill("#login-password", "demo-pass-123");
  await page.click("#login-submit");
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });

  const toggleVisible = await page.$eval(
    "#sidebar-toggle",
    (el) => getComputedStyle(el).display !== "none",
  );
  const sidebarTranslated = await page.$eval(
    "#sidebar",
    (el) => getComputedStyle(el).transform !== "none",
  );

  await page.click("#sidebar-toggle");
  await page.waitForSelector(".sidebar.open", { timeout: 5000 });
  const opened = await page.$eval("#sidebar", (el) => el.classList.contains("open"));

  // Sidebar'ın sağında kalan alana tıklayarak backdrop ile kapat.
  await page.mouse.click(360, 400);
  await page.waitForTimeout(300);
  const closed = await page.$eval("#sidebar", (el) => !el.classList.contains("open"));

  console.log(
    `mobil toggle gorunur: ${toggleVisible} | sidebar default kapali: ${sidebarTranslated}`,
  );
  console.log(`sidebar acilabiliyor: ${opened} | backdrop ile kapanma: ${closed}`);
  await browser.close();
}

main().catch((err) => {
  console.error("TEST HATASI:", err);
  process.exit(1);
});
