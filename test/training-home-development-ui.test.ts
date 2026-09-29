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

  it("keeps the student shell focused on five primary destinations", () => {
    expect(index).toContain('data-page="dashboard" data-student-primary');
    expect(index).toContain('data-page="exercise" data-student-primary');
    expect(index).toContain('data-page="lessons" data-student');
    expect(index).toContain('data-page="progress" data-student-primary');
    expect(index).toContain('data-page="settings" data-student-primary');
    expect(index).toContain("Bugün ne öğreneceksin?");
    expect(index).toContain("Öğren");
    expect(index).toContain("Geri bildirim");
    expect(app).toContain("formatStudentError");
    expect(app).toContain("data-student-secondary");
  });

  it("groups student navigation without removing secondary destinations", () => {
    expect(index).toContain('class="student-nav-more" data-student');
    expect(index).toContain("Öğrenme Yolum");
    expect(index).toContain("Gelişimim");
    expect(index).toContain("Profilim");
    expect(index).toContain('id="student-more-toggle"');
    expect(index).toContain('class="student-more-menu hidden"');
    expect(index).toContain('aria-hidden="true"');
    expect(index).toContain('data-student-menu-page="exercise"');
    expect(index).toContain('data-student-menu-page="assignments"');
    expect(index).toContain('data-student-menu-page="assessments"');
    expect(index).toContain('data-student-menu-page="badges"');
    expect(index).toContain('data-student-menu-page="billing-account"');
    expect(app).toContain('item.classList.toggle("hidden", isPlatform)');
    expect(app).toContain("function setStudentMoreMenuOpen(open)");
    expect(app).toContain("menu.hidden = !open");
    expect(app).toContain('event.key === "Escape"');
    expect(app).toContain("data-student-menu-page");
  });

  it("prioritizes the real daily action before the learning path on the student home", () => {
    expect(styles).toContain(".student-shell #page-dashboard > #today-card");
    expect(styles).toContain(".student-shell #page-dashboard > #learning-path-card");
    expect(styles).toContain(".student-shell #today-card.supporting-task-card");
    expect(styles).toContain(".student-shell #learning-path-card .learning-path-summary-item");
  });

  it("shows one guided data-driven learning map without changing the path contract", () => {
    expect(index).toContain('id="learning-map-current"');
    expect(index).toContain('id="learning-model-details"');
    expect(app).toContain("function renderLearningPathMap(pathGroups)");
    expect(app).toContain("GUIDED_LEARNING_SKILL_ORDER");
    expect(app).toContain("learningPathNodeRoadmapPhase");
    expect(app).toContain("function learningPathMapKind(node)");
    expect(app).not.toContain("studentLearningPathSelectedArea");
    expect(styles).toContain(".student-shell .learning-map-track::before");
    expect(styles).toContain(".student-shell .learning-map-phase");
    expect(styles).toContain(".student-shell .learning-map-step.roadmap-right");
    expect(styles).toContain(".student-shell .learning-map-step.kind-checkpoint");
    expect(styles).toContain(".student-shell .learning-map-empty-state");
    expect(app).toContain("function renderLearningPathEmptyState(currentLevel)");
  });
});
