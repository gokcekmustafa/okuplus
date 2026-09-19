import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

describe("student growth first-minute UX", () => {
  it("does not expose a training CTA before today's state is loaded", () => {
    expect(index).toContain('id="today-card"');
    expect(index).toContain('aria-busy="true"');
    expect(index).toContain('id="start-daily-training"');
    expect(index).toContain("disabled");
    expect(index).toContain("Bugünkü antrenmanını kontrol ediyoruz…");
    expect(app).toContain('button.dataset.todayLoaded !== "true"');
    expect(app).toContain('startButton.dataset.todayLoaded = "false"');
    expect(app).toContain('startButton.dataset.todayLoaded = "true"');
  });

  it("gives the dashboard progress card an explicit GET-only retry control", () => {
    expect(index).toContain('id="dashboard-progress-retry"');
    expect(index).toContain("Gelişimi tekrar yükle");
    expect(app).toContain('retry?.classList.remove("hidden")');
    expect(app).toContain('retry?.classList.add("hidden")');
    expect(app).toContain('card.setAttribute("aria-busy", "true")');
    expect(app).toContain(
      '$("dashboard-progress-retry")?.addEventListener("click", () => void loadDashboardProgress())',
    );
    expect(styles).toContain(".dashboard-progress-retry");
  });

  it("provides a direct accessible retry when onboarding levels fail", () => {
    expect(index).toContain('id="onboarding-level-retry"');
    expect(index).toContain("Seviyeleri tekrar yükle");
    expect(app).toContain('var retry = $("onboarding-level-retry")');
    expect(app).toContain("await loadOnboardingLevels()");
    expect(app).toContain('levelRetry.setAttribute("aria-busy", "true")');
    expect(styles).toContain(".onboarding-level-retry");
  });
});
