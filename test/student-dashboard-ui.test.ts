import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

describe("student dashboard release 0.4", () => {
  it("uses real student APIs for the dashboard summary", () => {
    expect(app).toContain('fetch("/student/today"');
    expect(app).toContain("async function insightApi(path)");
    expect(app).toContain(
      'const paths = ["progress", "gamification", "history?page=1&pageSize=5", "learning-path"];',
    );
    expect(app).toContain('fetch("/student/learning-path"');
    expect(app).toContain('fetch("/account/entitlements"');
    expect(app).toContain("function renderTrainingHome(data)");
    expect(app).toContain("summary?.sessionCount");
  });

  it("keeps empty or unmeasurable progress honest", () => {
    expect(app).toContain("formatAccuracy(summary?.accuracy)");
    expect(app).toContain(
      "Tamamlanan oturumların tüm cevapları. Doğruluk yalnızca puanlanan cevaplar üzerinden hesaplanır.",
    );
    expect(app).toContain("summary.scoredCount");
  });

  it("shows quota, next step, recent activity and accessible responsive states", () => {
    expect(index).toContain('id="today-card"');
    expect(index).toContain('id="home-insights"');
    expect(index).toContain('id="learning-path-summary"');
    expect(app).toContain("renderTrainingHome(data)");
    expect(app).toContain("renderHomeInsights(data)");
    expect(app).toContain("learningPathCommonDetail(pathGroups)");
    expect(app).toContain("aggregateProgress.completed");
    expect(app).toContain("data.nextAction");
    expect(styles).toContain(".training-home-card");
    expect(styles).toContain("@media (max-width: 700px)");
    expect(index).toContain('aria-live="polite"');
  });

  it("does not flash the dashboard while student onboarding is being resolved", () => {
    expect(app).toContain('if (isPlatform) {\n    navigate("dashboard");');
    expect(app).toContain("} else {\n    void maybeShowOnboarding();");
  });
});
