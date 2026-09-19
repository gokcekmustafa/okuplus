import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  toTrainingExerciseVersionConfig,
  type TrainingExerciseContract,
} from "../src/modules/training/exercise-contract.js";
import { loadTrainingRuntimeGraph } from "../src/modules/training/runtime.js";
import { prisma } from "../src/lib/prisma.js";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    exerciseTemplateVersion: { findUnique: vi.fn() },
  },
}));

const findUnique = vi.mocked(prisma.exerciseTemplateVersion.findUnique);

function config() {
  const contract: TrainingExerciseContract = {
    stableKey: "TRAINING_MAIN_IDEA_FOUNDATION",
    version: 1,
    family: "MAIN_IDEA",
    competency: "RC_MAIN_IDEA",
    difficulty: "FOUNDATION",
    estimatedDurationSeconds: 120,
    instructions: "Metni oku ve ana düşünceyi seç.",
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
    scoring: {
      mode: "DETERMINISTIC",
      primarySignal: "ACCURACY",
      timeRole: "SECONDARY",
      maxScore: 1,
      openEnded: false,
    },
    feedback: {
      types: ["POSITIVE", "CORRECTIVE", "HINT"],
      showExplanation: true,
      retryEnabled: true,
      maxMessageLength: 240,
    },
    xp: { completionPoints: 20, correctAnswerBonus: 2, dailyCap: 100 },
    eligibility: {
      usage: "TRAINING_ONLY",
      requiresPublishedContent: true,
      requiresPublishedQuestions: true,
      minimumDifficulty: "FOUNDATION",
      maximumDifficulty: "CHALLENGING",
    },
    versionConfig: { rendererKey: "QUESTION_MULTIPLE_CHOICE", settings: {} },
  };
  return toTrainingExerciseVersionConfig(contract);
}

function row() {
  return {
    id: "template-version-1",
    templateId: "template-1",
    version: 1,
    config: config(),
    status: "PUBLISHED",
    publishedAt: new Date(),
    template: {
      id: "template-1",
      title: "Ana fikir",
      type: "MIXED",
      tenantId: null,
      status: "PUBLISHED",
      deletedAt: null,
    },
    contents: [
      {
        position: 0,
        contentVersionId: "content-version-1",
        contentVersion: {
          id: "content-version-1",
          contentId: "content-1",
          title: "Kısa metin",
          body: "Yayınlanmış metin.",
          status: "PUBLISHED",
          content: {
            id: "content-1",
            tenantId: null,
            status: "PUBLISHED",
            deletedAt: null,
          },
        },
      },
    ],
    questions: [
      {
        position: 0,
        questionVersionId: "question-version-1",
        questionVersion: {
          id: "question-version-1",
          questionId: "question-1",
          contentVersionId: "content-version-1",
          prompt: "Ana düşünce nedir?",
          options: [
            { id: "a", text: "Birinci" },
            { id: "b", text: "İkinci" },
            { id: "c", text: "Üçüncü" },
            { id: "d", text: "Dördüncü" },
          ],
          correctAnswer: {
            type: "MULTIPLE_CHOICE",
            correctOptionIds: ["a"],
            allowMultiple: false,
          },
          explanation: "Açıklama",
          hint: "İpucu",
          difficulty: "FOUNDATION",
          status: "PUBLISHED",
          question: {
            id: "question-1",
            contentId: "content-1",
            type: "MULTIPLE_CHOICE",
            status: "PUBLISHED",
            deletedAt: null,
            skill: { code: "RC_MAIN_IDEA" },
          },
        },
      },
    ],
  };
}

describe("training runtime graph query reuse", () => {
  beforeEach(() => vi.resetAllMocks());

  it("loads and validates the complete graph with one database query", async () => {
    findUnique.mockResolvedValue(row() as never);

    const graph = await loadTrainingRuntimeGraph("template-version-1", {
      userId: "student-1",
      tenantId: "tenant-1",
      platformRole: null,
    });

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(graph.questions).toHaveLength(1);
    expect(graph.questions[0]?.questionVersionId).toBe("question-version-1");
  });
});
