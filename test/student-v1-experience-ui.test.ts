import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

describe("student V1 first-experience recovery states", () => {
  it("sets a clear expectation before signup or login", () => {
    expect(index).toContain("Kısa günlük çalışmalarla okuma becerilerini geliştir");
    expect(styles).toContain(".brand .login-promise");
  });

  it("keeps onboarding visible when its source data fails and exposes retry", () => {
    expect(index).toContain('id="onboarding-retry"');
    expect(app).toMatch(
      /catch \(_e\) \{\s*void _e;\s*navigate\("onboarding"\);[\s\S]*onboarding-retry[\s\S]*Başlangıç bilgilerin yüklenemedi/,
    );
    expect(app).toContain("await maybeShowOnboarding()");
  });

  it("turns a dashboard today failure into an actionable, retryable state", () => {
    expect(index).toContain('id="refresh-today-training"');
    expect(app).toContain("Bugün verisi yüklenemedi. Yenile düğmesini deneyebilirsin.");
    expect(app).toContain("Bugünkü antrenman yüklenemedi. Tekrar denemek için Yenile'ye bas.");
    expect(app).toContain(
      '$("refresh-today-training")?.addEventListener("click", () => void loadToday())',
    );
  });
});
