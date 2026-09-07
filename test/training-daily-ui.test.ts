import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8");
const index = readFileSync("public/index.html", "utf8");

describe("daily training student flow", () => {
  it("starts and resumes the server-owned daily session", () => {
    expect(index).toContain('id="start-daily-training"');
    expect(app).toContain('fetch("/student/training/daily/start"');
    expect(app).toContain('fetch("/student/training/daily/" + encodeURIComponent(id)');
    expect(app).toContain("rememberDailyTrainingState");
    expect(app).toContain("nextDailyTrainingItem");
  });

  it("renders six-item progress and a final daily summary", () => {
    expect(app).toContain("Egzersiz ${position} / ${total}");
    expect(app).toContain("Bugünkü antrenmanı tamamladın!");
    expect(app).toContain("Gelişim Puanı (GP)");
    expect(app).toContain("completedItems");
  });

  it("keeps the first-day handoff positive and placement-neutral", () => {
    expect(app).toContain("Harika! Seni tanıdık.");
    expect(app).toContain("Şimdi kısa ve kolay bir antrenmanla başlayalım.");
    expect(app).toContain("İlk antrenmanına başla");
    expect(app).toContain("İlk antrenmanını tamamladın! 🎉");
    expect(app).toContain("placementHandoff");
    expect(app).toContain("isFirstTrainingDay");
    expect(app).not.toContain("Seviyen belirlenemedi");
  });

  it("keeps daily answers inline and suppresses intermediate celebrations", () => {
    expect(app).toContain("function isDailyTrainingExercise()");
    expect(app).toContain("Ara cevaplar yalnızca inline mikro feedback gösterir");
    expect(app).toContain('const pointsLabel = "GP"');
    expect(app).toContain("formatDailyTrainingError");
    expect(app).toContain("Oturumun sona ermiş olabilir");
  });
});
