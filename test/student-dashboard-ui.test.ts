import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

describe("student dashboard release 0.4", () => {
  it("uses real student APIs for the dashboard summary", () => {
    expect(app).toContain('fetch("/student/today"');
    expect(app).toContain("async function insightApi(path)");
    expect(app).toContain("const insightRequests = new Map()");
    expect(app).toContain("if (existing) return existing");
    expect(app).toContain(".then(parseResponse)");
    expect(app).toContain('const timeoutMs = path === "learning-path" ? 30000 : 15000');
    expect(app).toContain("signal: insightRequestSignal(path)");
    expect(app).toContain('err.requestId = res.headers.get("x-request-id")');
    expect(app).toContain('console.error("learning-path-load-failed"');
    expect(app).toContain("phase: learningPathPhase");
    expect(app).toContain('console.error("learning-path-render-failed"');
    expect(app).toContain('fetch("/student/learning-path/client-diagnostic"');
    expect(app).toContain("reportLearningPathClientError(error, learningPathPhase)");
    expect(app).toContain("pathGroups = pathGroups.filter");
    expect(app).toContain(
      'const paths = ["progress", "gamification", "history?page=1&pageSize=5", "learning-path"];',
    );
    expect(app).toContain('insightApi("learning-path")');
    expect(app).toContain('"/student/learning-path/steps/"');
    expect(app).toContain("loadFocusedLearningPathStep");
    expect(app).toContain("Dersi tamamladım ve sonraki adıma geç");
    expect(app).toContain("nextStep");
    expect(app).toContain("learningPathEntryMode");
    expect(app).toContain('var disabled = visualStatus !== "active" ? " disabled" : "";');
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
    expect(index).not.toContain('id="learning-path-summary"');
    expect(app).toContain("renderTrainingHome(data)");
    expect(app).toContain("renderHomeInsights(data)");
    expect(app).toContain("learningPathCommonDetail(pathGroups)");
    expect(app).toContain("aggregateProgress.completed");
    expect(app).toContain("data.nextAction");
    expect(app).not.toContain("ADIM ADIM İLERLE");
    expect(app).not.toContain("Öğrenme haritan");
    expect(app).not.toContain("Bir durağı tamamla, sonraki durak açılsın.");
    expect(styles).toContain(".training-home-card");
    expect(styles).toContain("@media (max-width: 700px)");
    expect(index).toContain('aria-live="polite"');
    expect(index).toContain('id="lesson-list-panel"');
    expect(index).toContain('id="lessons-heading"');
    expect(index).not.toContain('data-bottom-page="lessons"');
    expect(index).toContain('data-bottom-page="progress"');
    expect(index).toContain('data-bottom-page="settings"');
    expect(app).not.toContain("<span>ŞİMDİ</span>");
    expect(app).not.toContain("<b>BURADASIN</b>");
    expect(styles).toContain("#learning-path.learning-path::before");
  });

  it("keeps invalid login feedback visible after the request finishes", () => {
    expect(index).toContain('id="login-error"');
    expect(app).toContain("function formatLoginError(error)");
    expect(app).toContain("E-posta veya şifre yanlış. Bilgilerini kontrol edip tekrar dene.");
    expect(app).toContain('if (isLoading) $("login-error").classList.add("hidden");');
    expect(app).toContain('$("login-error").textContent = formatLoginError(err);');
  });

  it("does not flash the dashboard while student onboarding is being resolved", () => {
    expect(app).toContain('if (isPlatform) {\n    navigate("dashboard");');
    expect(app).toContain("} else {\n    void maybeShowOnboarding();");
  });
});
