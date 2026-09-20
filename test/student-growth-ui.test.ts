import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

describe("student growth first-minute UX", () => {
  it("does not expose a training CTA before today's state is loaded", () => {
    expect(index).toContain('id="today-card"');
    expect(index).toContain('id="start-daily-training"');
    expect(index).toContain("Yükleniyor…");
    expect(app).toContain('todayCard?.setAttribute("aria-busy", "true")');
    expect(app).toContain('todayCard?.setAttribute("aria-busy", "false")');
    expect(app).toContain("renderTrainingHome(data)");
  });

  it("gives today's training card an explicit retry control", () => {
    expect(index).toContain('id="today-training-retry"');
    expect(index).toContain("Bugünkü antrenmanı yeniden yükle");
    expect(app).toContain('retryEl?.classList.remove("hidden")');
    expect(app).toContain('retryEl?.classList.add("hidden")');
    expect(app).toContain("formatDailyTrainingError(error)");
    expect(app).toContain(
      '$("today-training-retry")?.addEventListener("click", () => void loadToday())',
    );
    expect(styles).toContain("#today-training-retry");
  });

  it("provides a direct accessible retry when onboarding levels fail", () => {
    expect(index).toContain('id="onboarding-level-retry"');
    expect(index).toContain("Seviyeleri tekrar yükle");
    expect(app).toContain('var retry = $("onboarding-level-retry")');
    expect(app).toContain("await loadOnboardingLevels()");
    expect(app).toContain('retry?.classList.add("hidden")');
    expect(app).toContain('retry?.classList.remove("hidden")');
    expect(app).toContain('$("onboarding-level-retry")?.addEventListener("click", function ()');
    expect(styles).toContain(".onboarding-retry");
  });
});
