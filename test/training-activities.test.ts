import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TRAINING_ACTIVITY_CATALOG,
  findTrainingActivity,
  listTrainingActivities,
  startTrainingActivity,
} from "../src/modules/training/index.js";
import { isIndependentTrainingSession } from "../src/modules/training/session-origin.js";

const routes = readFileSync("src/modules/training/routes.ts", "utf8");
const app = readFileSync("public/app.js", "utf8");
const index = readFileSync("public/index.html", "utf8");
const sessions = readFileSync("src/modules/sessions/service.ts", "utf8");
const aggregation = readFileSync("src/modules/progress/aggregation.ts", "utf8");
const activities = readFileSync("src/modules/training/activities.ts", "utf8");

describe("independent training activities", () => {
  it("publishes the six student activities with stable, Turkish copy", () => {
    expect(TRAINING_ACTIVITY_CATALOG.map((activity) => activity.id)).toEqual([
      "hizli-bul",
      "kelime-avi",
      "anlami-yakala",
      "hafizada-tut",
      "siralamayi-bul",
      "cikarimi-yakala",
    ]);
    expect(TRAINING_ACTIVITY_CATALOG).toHaveLength(6);
    expect(findTrainingActivity("siralamayi-bul")?.title).toBe("Sıralamayı Bul");
    expect(findTrainingActivity("gecersiz-aktivite")).toBeUndefined();
    expect(TRAINING_ACTIVITY_CATALOG.every((activity) => activity.description.length > 0)).toBe(
      true,
    );
    expect(JSON.stringify(TRAINING_ACTIVITY_CATALOG)).not.toContain("Learn");
  });

  it("uses authenticated student routes and never accepts a client template choice", () => {
    expect(routes).toContain('"/student/training/activities"');
    expect(routes).toContain('"/student/training/activities/:activityId/start"');
    expect(routes).toContain("requireAuth(opts.authProvider)");
    expect(routes).toContain("assertStudentActor(actor)");
    expect(routes).toContain("startTrainingActivity(actor, activityId");
    const activityStartRoute = routes.slice(
      routes.indexOf('"/student/training/activities/:activityId/start"'),
      routes.indexOf('"/student/training/daily/:id"'),
    );
    expect(activityStartRoute).not.toContain("templateVersionId");
  });

  it("renders the direct activity flow without loading Learning Path", () => {
    expect(index).toContain('id="training-activities-list"');
    expect(index).toContain('id="training-activities-grid"');
    expect(index).toContain('id="training-activities-status"');
    expect(index).toContain('id="exercise-page-kicker"');
    expect(index).toContain('id="exercise-page-title"');
    expect(index).toContain("Bir beceri seç, kısa bir çalışma yap ve istersen tekrar et.");
    expect(index).toContain("Buradaki sonuçlar resmi ölçüm veya seviye");
    expect(index).toContain("belirleme için kullanılmaz.");
    expect(app).toContain('authenticatedFetch("/student/training/activities"');
    expect(app).toContain("data-training-activity-start");
    expect(app).toContain("data-training-activity-session");
    expect(activities).toContain("loadActivityProgress");
    expect(activities).toContain("isIndependentTrainingSession");
    expect(activities).toContain("progress: progress.get(activity.id) ?? null");
    expect(app).toContain("Beceri");
    expect(app).toContain("Tekrar çalış →");
    expect(app).toContain("Devam et →");
    expect(app).toContain("Antrenmanlara dön");
    expect(app).toContain("Tekrar oyna");
    expect(app).toContain('trainingActivitiesState = "loading"');
    expect(app).toContain('trainingActivitiesState === "error"');
    expect(app).toContain("Aktiviteleri yeniden yükle");
    expect(app).toContain("data-training-empty-learning-path");
    expect(app).toContain("data-training-action-label");
    const pageLoader = app.slice(
      app.indexOf("async function loadExercisePage()"),
      app.indexOf("function returnToExercisePath()"),
    );
    expect(pageLoader).not.toContain('fetch("/student/learning-path"');
  });

  it("keeps Learning Path practice context separate from independent Training", () => {
    expect(index).toContain('id="exercise-learning-path-context"');
    expect(app).toContain('"ÖĞRENME YOLU · UYGULAMA"');
    expect(app).toContain("learningPathExerciseContextLabel");
    expect(app).toContain("Öğrenme yolu uygulama akışı");
    expect(app).toContain('"ANTRENMAN"');
    expect(app).toContain("learningPathEntryMode && Boolean(exerciseSession?.learningStepId)");
  });

  it("marks independent sessions and blocks academic progress/path sync", () => {
    expect(isIndependentTrainingSession({ source: "INDEPENDENT_TRAINING" })).toBe(true);
    expect(isIndependentTrainingSession({ source: "LEARNING_PATH" })).toBe(false);
    expect(isIndependentTrainingSession(null)).toBe(false);
    expect(sessions).toContain("isIndependentTrainingSession(session.deviceInfo)");
    expect(sessions).toContain("!session.trainingSessionItem");
    expect(aggregation).toContain("isIndependentTrainingSession(session.deviceInfo)");
    expect(aggregation).toContain("session.trainingSessionItem");
  });

  it("keeps the catalog service student-only and rejects unknown activities", async () => {
    await expect(
      listTrainingActivities({ userId: "student", tenantId: null, platformRole: null }),
    ).rejects.toThrow("yalnızca öğrencilere");
    await expect(
      startTrainingActivity({ userId: "student", tenantId: null, platformRole: null }, "unknown"),
    ).rejects.toThrow("yalnızca öğrencilere");
  });
});
