import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

describe("training home and development UI", () => {
  it("renders the daily training home states", () => {
    expect(index).toContain("Bugün ne öğreneceksin?");
    expect(index).toContain('id="daily-training-progress"');
    expect(index).toContain('role="progressbar"');
    expect(index).toContain('id="daily-training-gp"');
    expect(index).toContain("Hızlı Okuma");
    expect(index).toContain("Okuduğunu Anlama");
    expect(index).toContain("Bugünkü Gelişim");
    expect(app).toContain("function renderTrainingHome(data)");
    expect(app).toContain("Antrenmana Başla");
    expect(app).toContain("Antrenmana Devam Et");
    expect(app).toContain("Bugünkü hedefini tamamladın! 🎉");
    expect(app).toContain("Antrenman tamamlandı");
    expect(app).toContain("pointsToday");
    expect(app).toContain("dailyTraining");
    expect(app).toContain("dailyGoal");
  });

  it("renders development awards, goals, streak, and six skill areas", () => {
    expect(index).toContain("Gelişim Yolculuğun");
    expect(index).toContain('id="development-journey-summary"');
    expect(index).toContain('id="development-total-gp"');
    expect(index).toContain('id="development-badges"');
    expect(index).toContain('id="development-trophies"');
    expect(index).toContain('id="development-streak"');
    expect(index).toContain('id="development-next-targets"');
    expect(app).toContain("DEVELOPMENT_SKILL_CARDS");
    expect(app).toContain("Dikkat");
    expect(app).toContain("Hızlı Tanıma");
    expect(app).toContain("Cümle Gruplama");
    expect(app).toContain("Ana Fikir");
    expect(app).toContain("Detay");
    expect(app).toContain("Çıkarım");
    expect(app).toContain("Stabil / Ustalık");
    expect(app).toContain('typeof progress?.masteryScore === "number"');
    expect(app).toContain("const value = mastery ?? accuracy");
    expect(app).toContain("renderDevelopmentGamification");
    expect(app).toContain("developmentJourneySummary");
    expect(app).toContain("Tamamlanan antrenman");
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

  it("keeps the student shell focused on the core destinations", () => {
    expect(index).toContain('data-page="dashboard" data-student-primary');
    expect(index).toContain('data-page="exercise" data-student-primary');
    expect(index).toContain('data-page="lessons" data-student');
    expect(index).toContain('data-page="progress" data-student-primary');
    expect(index).not.toContain('data-page="settings" data-student-primary');
    expect(index).toContain("Bugün ne öğreneceksin?");
    expect(index).toContain("Öğren");
    expect(index).toContain("Geri bildirim");
    expect(app).toContain("formatStudentError");
    expect(app).toContain("data-student-secondary");
  });

  it("keeps secondary destinations directly visible in the desktop sidebar", () => {
    expect(index).not.toContain('class="student-nav-more"');
    expect(index).not.toContain("Diğer alanlar");
    expect(index).toContain('data-page="assignments" data-student-secondary');
    expect(index).toContain('data-page="assessments" data-student-secondary');
    expect(index).toContain('data-page="badges" data-student-secondary');
    expect(index).not.toContain('data-page="billing-account" data-student-secondary');
    expect(index).not.toContain('data-page="settings" data-student-primary');
    expect(index).toContain("Öğrenme Yolum");
    expect(index).toContain("Gelişimim");
    expect(index).toContain('id="user-menu-toggle"');
    expect(index).toContain('data-user-menu-page="settings"');
    expect(index).toContain('data-user-menu-page="billing-account"');
    expect(index).toContain('data-bottom-page="exercise"');
    expect(index).toContain('data-bottom-page="assignments"');
    expect(index).toContain('data-bottom-page="assessments"');
    expect(index).toContain('data-bottom-page="badges"');
    expect(index).not.toContain('id="student-more-toggle"');
    expect(app).toContain('item.classList.toggle("hidden", isPlatform)');
    expect(app).toContain("function setUserMenuOpen(open)");
    expect(app).toContain("menu.hidden = !open");
    expect(app).toContain('event.key === "Escape"');
    expect(app).toContain("data-user-menu-page");
  });

  it("prioritizes the real daily action before the learning path on the student home", () => {
    expect(styles).toContain(".student-shell #page-dashboard > #today-card");
    expect(styles).toContain(".student-shell #page-dashboard > #learning-path-card");
    expect(styles).toContain(".student-shell #today-card.supporting-task-card");
  });

  it("shows one guided data-driven learning map without changing the path contract", () => {
    expect(index).not.toContain('id="learning-map-current"');
    expect(index).not.toContain('id="learning-model-details"');
    expect(app).toContain("function renderLearningPathMap(pathGroups, currentLevel)");
    expect(app).toContain("GUIDED_LEARNING_SKILL_ORDER");
    expect(app).toContain("function learningPathMapKind(node)");
    expect(app).not.toContain("studentLearningPathSelectedArea");
    expect(styles).toContain(".student-shell #learning-path-card .learning-map-v6-route");
    expect(styles).toContain(".student-shell #learning-path-card .learning-map-v6-path");
    expect(styles).toContain(".student-shell #learning-path-card .learning-map-v6-left");
    expect(styles).toContain(".student-shell #learning-path-card .learning-map-v6-right");
    expect(styles).toContain(".student-shell #learning-path-card .learning-map-v6-step");
    expect(styles).toContain(".student-shell .learning-map-empty-state");
    expect(app).toContain("function renderLearningPathEmptyState(currentLevel)");
    expect(app).toContain("function learningPathRouteGeometry(count)");
    expect(app).toContain("learning-roadmap-student.png");
    expect(app).toContain("learning-map-v6-legend");
    expect(app).not.toContain('"Şimdi: " + currentArea');
    expect(app).not.toContain("Durağa dokun ve devam et.");
    expect(app).not.toContain('class="current"');
    expect(index).not.toContain('id="logout-btn"');
    expect(index).toContain('data-user-menu-action="logout"');
    expect(index).toContain('id="user-name"');
    expect(app).toContain("learning-map-v6-character");
  });

  it("keeps the student home focused on the roadmap", () => {
    expect(styles).toContain(".student-shell #page-dashboard > #today-card");
    expect(styles).toContain(".student-shell #page-dashboard > #entitlement-card");
    expect(styles).toContain(".student-shell #page-dashboard > #review-card");
    expect(styles).toContain(".student-shell #learning-path-card .learning-map-v6-legend");
    expect(styles).toContain(".student-shell #learning-path-card .learning-map-v6-step");
    expect(app).toContain('label: "Öğren", icon: "⚡"');
    expect(app).toContain('label: "Öğren", icon: "★"');
    expect(app).toContain('label: "Öğren", icon: "◒"');
    expect(app).toContain('class="learning-map-v6-area"');
    expect(app).toContain('class="learning-map-v6-lock"');
    expect(app).not.toContain(">Kilitli<");
    expect(app).not.toContain('class="path-node-label"');
    expect(app).toContain('if (type === "TEACHING" || type === "SMALL_STUDY")');
    expect(app).toContain("Bu öğrenme adımının ders içeriği henüz yayınlanmadı.");
    expect(app).toContain("learning-map-v6-summary");
    expect(app).toContain("learning-map-v6-action");
    expect(app).toContain("learning-map-v6-character");
    expect(app).toContain("Bir sonraki durak seni bekliyor.");
    expect(styles).toContain("@keyframes okuplus-map-v6-pulse");
    expect(styles).toContain(".learning-map-v6-step.is-current .learning-map-v6-marker");
  });

  it("does not duplicate dashboard data loads after onboarding", () => {
    const onboarding = app.slice(
      app.indexOf("async function maybeShowOnboarding()"),
      app.indexOf("function showOnboardingError"),
    );
    expect(onboarding).not.toContain("void loadToday()");
    expect(onboarding).not.toContain("void loadLearningPath()");
    expect(app).toContain("if (todayLoading) return;");
    expect(app).toContain("if (learningPathLoading) return;");
  });
});
