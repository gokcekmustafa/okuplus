import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

describe("training home and development UI", () => {
  it("renders the daily training home states", () => {
    expect(index).toContain("Bugün de gelişmeye hazır mısın?");
    expect(index).toContain("Bugünkü Antrenmanın");
    expect(index).toContain('id="daily-training-progress"');
    expect(index).toContain('role="progressbar"');
    expect(index).toContain('id="daily-training-gp"');
    expect(index).toContain("Hızlı Okuma");
    expect(index).toContain("Okuduğunu Anlama");
    expect(index).toContain("Bugünkü Gelişim");
    expect(app).toContain("function renderTrainingHome(data)");
    expect(app).toContain("Antrenmana Başla");
    expect(app).toContain("Antrenmana Devam Et");
    expect(app).toContain("Bugünkü antrenmanı tamamladın!");
    expect(app).toContain("pointsToday");
    expect(app).toContain("dailyTraining");
    expect(app).toContain("dailyGoal");
    expect(app).toContain("Günlük soru hakkın doldu; tamamlanmayan adımlar yarına kalabilir.");
  });

  it("renders development awards, goals, streak, and six skill areas", () => {
    expect(index).toContain("Gelişimin");
    expect(index).toContain('id="development-total-gp"');
    expect(index).toContain('id="development-badges"');
    expect(index).toContain('id="development-trophies"');
    expect(index).toContain('id="development-streak"');
    expect(index).toContain('id="development-next-targets"');
    expect(app).toContain("DEVELOPMENT_SKILL_CARDS");
    expect(app).toContain("Dikkat");
    expect(app).toContain("Hızlı Tanıma");
    expect(app).toContain("Phrase Chunking");
    expect(app).toContain("Ana Fikir");
    expect(app).toContain("Detay");
    expect(app).toContain("Çıkarım");
    expect(app).toContain("Stabil / Ustalık");
    expect(app).toContain('typeof progress?.masteryScore === "number"');
    expect(app).toContain("const value = mastery ?? accuracy");
    expect(app).toContain("renderDevelopmentGamification");
    expect(app).toContain("GP daha kazanırsan sonraki kilometre taşına ulaşırsın.");
  });

  it("keeps the UI keyboard- and screen-reader-friendly", () => {
    expect(index).toContain(
      'aria-describedby="daily-training-status daily-training-progress-text"',
    );
    expect(index).toContain('aria-live="polite"');
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("training-home-card");
    expect(styles).toContain("@media (max-width: 600px)");
  });
});
