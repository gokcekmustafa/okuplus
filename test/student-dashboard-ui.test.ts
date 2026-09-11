import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

describe("student dashboard release 0.4", () => {
  it("uses real student APIs for the dashboard summary", () => {
    expect(app).toContain('fetch("/student/today"');
    expect(app).toContain('insightApi("progress")');
    expect(app).toContain('fetch("/student/learning-path"');
    expect(app).toContain('fetch("/account/entitlements"');
    expect(app).toContain("function renderDashboardProgress(data)");
    expect(app).toContain("summary.sessionCount");
  });

  it("keeps empty or unmeasurable progress honest", () => {
    expect(app).toContain(
      '"İlk tamamlanan antrenmanından sonra gerçek gelişim verilerin burada görünecek."',
    );
    expect(app).toContain('lastAccuracy === null ? "—" : formatAccuracy(lastAccuracy)');
    expect(app).toContain("formatDashboardDuration(averageTime)");
    expect(app).toContain(
      '"Doğruluk yalnızca puanlanan cevaplardan hesaplanır; ölçülemeyen değerler boş bırakılır."',
    );
  });

  it("shows quota, next step, recent activity and accessible responsive states", () => {
    expect(index).toContain('id="daily-training-quota"');
    expect(index).toContain('id="dashboard-progress-card"');
    expect(index).toContain('id="dashboard-recent-list"');
    expect(app).toContain("Önerilen sonraki adım");
    expect(app).toContain("Günlük soru hakkın doldu; tamamlanmayan adımlar yarına kalabilir.");
    expect(app).toContain("learningPathLabel(n)");
    expect(styles).toContain(".dashboard-progress-grid");
    expect(styles).toContain("@media (max-width: 700px)");
    expect(index).toContain('aria-live="polite"');
  });

  it("does not flash the dashboard while student onboarding is being resolved", () => {
    expect(app).toContain('navigate("onboarding");\n    void maybeShowOnboarding();');
  });
});
