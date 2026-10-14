import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveActivityPackageProgress,
  TRAINING_ACTIVITY_CATALOG,
  findTrainingActivity,
  listTrainingActivities,
  startTrainingActivity,
} from "../src/modules/training/index.js";
import type {
  TrainingActivityPackage,
  TrainingActivitySessionSnapshot,
} from "../src/modules/training/index.js";
import { isIndependentTrainingSession } from "../src/modules/training/session-origin.js";

const routes = readFileSync("src/modules/training/routes.ts", "utf8");
const app = readFileSync("public/app.js", "utf8");
const index = readFileSync("public/index.html", "utf8");
const sessions = readFileSync("src/modules/sessions/service.ts", "utf8");
const aggregation = readFileSync("src/modules/progress/aggregation.ts", "utf8");
const activities = readFileSync("src/modules/training/activities.ts", "utf8");
const studentLearningService = readFileSync("src/modules/student-learning/service.ts", "utf8");

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
    expect(index).toContain("Kısa, isteğe bağlı çalışmalar · İstediğin zaman tekrar edebilirsin.");
    expect(index).toContain("BAĞIMSIZ ANTRENMAN");
    expect(index).toContain("Buradaki sonuçlar resmi ölçüm veya seviye");
    expect(index).toContain("belirleme için kullanılmaz.");
    expect(app).toContain('authenticatedFetch("/student/training/activities"');
    expect(app).toContain("data-training-activity-start");
    expect(app).toContain("data-training-activity-session");
    expect(activities).toContain("loadActivityProgress");
    expect(activities).toContain("isIndependentTrainingSession");
    expect(activities).toContain("legacyProgress: currentSession");
    expect(app).toContain("Beceri");
    expect(app).toContain("Öğrenme Yolu'ndan ayrı çalışma");
    expect(app).toContain("Bir beceri seç; kısa bir çalışmayla başlayabilirsin.");
    expect(app).toContain("Tekrar çalış →");
    expect(app).toContain("Devam et →");
    expect(app).toContain("Antrenmanlara dön");
    expect(app).toContain("Tekrar oyna");
    expect(app).toContain('trainingActivitiesState = "loading"');
    expect(app).toContain('trainingActivitiesState === "error"');
    expect(app).toContain("data-training-activities-retry");
    expect(app).toContain("void loadTrainingActivities()");
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

  it("clears an independent Training return target when opening a Learning Path station", () => {
    const start = app.indexOf("async function startLearningPathNode(");
    const end = app.indexOf("window.startTodayLearningStep", start);
    const startLearningPathNode = app.slice(start, end);
    expect(startLearningPathNode).toContain("exerciseMode = null");
    expect(startLearningPathNode).toContain("activeTrainingActivityId = null");
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

  it("unlocks independent packages only after the previous package is completed", () => {
    const packages: TrainingActivityPackage[] = [
      {
        packageNumber: 1,
        templateVersionId: "tv-foundation",
        templateVersionIds: ["tv-foundation"],
        difficulty: "FOUNDATION",
        questionCount: 2,
      },
      {
        packageNumber: 2,
        templateVersionId: "tv-developing",
        templateVersionIds: ["tv-developing"],
        difficulty: "DEVELOPING",
        questionCount: 2,
      },
      {
        packageNumber: 3,
        templateVersionId: "tv-challenging",
        templateVersionIds: ["tv-challenging"],
        difficulty: "CHALLENGING",
        questionCount: 2,
      },
    ];
    const session = (id: string, templateVersionId: string, status: "IN_PROGRESS" | "COMPLETED") =>
      ({
        id,
        templateVersionId,
        status,
        averageScore: null,
        attemptCount: 2,
        lastActivityAt: "2026-10-12T10:00:00.000Z",
        completedAt: status === "COMPLETED" ? "2026-10-12T10:00:00.000Z" : null,
      }) satisfies TrainingActivitySessionSnapshot;

    expect(deriveActivityPackageProgress(packages, []).packages.map((item) => item.status)).toEqual(
      ["AVAILABLE", "LOCKED", "LOCKED"],
    );
    expect(
      deriveActivityPackageProgress(packages, [session("s1", "tv-foundation", "IN_PROGRESS")]),
    ).toMatchObject({
      completedPackages: 0,
      currentPackageNumber: 1,
      currentPackageStatus: "IN_PROGRESS",
      currentSessionId: "s1",
    });
    expect(
      deriveActivityPackageProgress(packages, [
        session("s1", "tv-foundation", "COMPLETED"),
      ]).packages.map((item) => item.status),
    ).toEqual(["COMPLETED", "AVAILABLE", "LOCKED"]);
  });

  it("keeps replay available after all published packages are completed", () => {
    const packages: TrainingActivityPackage[] = [
      {
        packageNumber: 1,
        templateVersionId: "tv-one",
        templateVersionIds: ["tv-one"],
        difficulty: "FOUNDATION",
        questionCount: 1,
      },
      {
        packageNumber: 2,
        templateVersionId: "tv-two",
        templateVersionIds: ["tv-two"],
        difficulty: "DEVELOPING",
        questionCount: 1,
      },
    ];
    const sessions: TrainingActivitySessionSnapshot[] = [
      {
        id: "s1",
        templateVersionId: "tv-one",
        status: "COMPLETED",
        averageScore: 1,
        attemptCount: 1,
        lastActivityAt: "2026-10-12T10:00:00.000Z",
        completedAt: "2026-10-12T10:00:00.000Z",
      },
      {
        id: "s2",
        templateVersionId: "tv-two",
        status: "COMPLETED",
        averageScore: 1,
        attemptCount: 1,
        lastActivityAt: "2026-10-12T11:00:00.000Z",
        completedAt: "2026-10-12T11:00:00.000Z",
      },
    ];
    expect(deriveActivityPackageProgress(packages, sessions)).toMatchObject({
      completedPackages: 2,
      totalPackages: 2,
      currentPackageNumber: 2,
      currentPackageStatus: "COMPLETED",
      currentSessionId: null,
    });
  });

  it("keeps package progress scoped to the independent activity and student tenant query", () => {
    expect(activities).toContain("tenantId: actor.tenantId");
    expect(activities).toContain("studentId: actor.userId");
    expect(activities).toContain("templateVersionId");
    expect(activities).toContain("packageProgress");
    expect(activities).toContain("isIndependentTrainingSession");
    expect(studentLearningService).toContain("independent:${independentTrainingActivityId}");
    expect(studentLearningService).toContain("activeIndependent");
    expect(studentLearningService).toContain("learningStep = independentTraining");
    expect(aggregation).toContain("isIndependentTrainingSession(session.deviceInfo)");
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
