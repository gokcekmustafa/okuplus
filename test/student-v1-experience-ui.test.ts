import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");

describe("student V1 first-experience recovery states", () => {
  it("sets a clear expectation before signup or login", () => {
    expect(index).toContain("Her gün birkaç kısa adımla daha hızlı ve dikkatli oku.");
    expect(index).toContain('id="login-form"');
  });

  it("keeps onboarding visible when its source data fails and exposes retry", () => {
    expect(index).toContain('id="onboarding-retry-load"');
    expect(app).toContain("showOnboardingError(");
    expect(app).toContain("Başlangıç bilgilerin yüklenemedi. Bağlantını kontrol edip tekrar dene.");
    expect(app).toContain("void maybeShowOnboarding();");
  });

  it("turns a dashboard today failure into an actionable, retryable state", () => {
    expect(index).toContain('id="today-training-retry"');
    expect(app).toContain("formatDailyTrainingError(error)");
    expect(app).toContain("Bugünkü antrenman yüklenemedi. Bağlantını kontrol edip tekrar dene.");
    expect(app).toContain(
      '$("today-training-retry")?.addEventListener("click", () => void loadToday());',
    );
  });
});
