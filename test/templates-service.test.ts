import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    exerciseTemplate: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    exerciseTemplateVersion: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contentVersion: { findMany: vi.fn() },
    questionVersion: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../src/lib/prisma.js", () => ({ prisma: mocks.prisma }));

import {
  createTemplateVersion,
  getTemplateVersion,
  publishTemplateVersion,
  updateTemplateVersion,
} from "../src/modules/templates/service.js";

const TEMPLATE_ID = "template-1";
const VERSION_ID = "template-version-1";
const ACTOR_ID = "actor-1";

const validConfig = () => ({
  schemaVersion: 1,
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
    types: ["POSITIVE", "CORRECTIVE"],
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
  rendererKey: "QUESTION_MULTIPLE_CHOICE",
  settings: { optionCount: 4, showExplanation: true },
});

const versionDetail = (config: unknown, status = "DRAFT") => ({
  id: VERSION_ID,
  templateId: TEMPLATE_ID,
  version: 1,
  config,
  status,
  publishedAt: null,
  createdAt: new Date("2026-09-10T00:00:00.000Z"),
  createdBy: null,
  contents: [],
  questions: [],
});

describe("template version config persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.contentVersion.findMany.mockResolvedValue([]);
    mocks.prisma.questionVersion.findMany.mockResolvedValue([]);
    mocks.prisma.exerciseTemplateVersion.update.mockResolvedValue({});
    mocks.prisma.exerciseTemplate.update.mockResolvedValue({});
  });

  it("persists config when creating a version", async () => {
    const config = validConfig();
    mocks.prisma.exerciseTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });
    mocks.prisma.exerciseTemplateVersion.findFirst.mockResolvedValue(null);
    mocks.prisma.exerciseTemplateVersion.create.mockResolvedValue({ id: VERSION_ID });
    mocks.prisma.exerciseTemplateVersion.findUnique.mockResolvedValue(versionDetail(config));

    const result = await createTemplateVersion(TEMPLATE_ID, { config }, ACTOR_ID);

    expect(mocks.prisma.exerciseTemplateVersion.create).toHaveBeenCalledWith({
      data: {
        templateId: TEMPLATE_ID,
        version: 1,
        status: "DRAFT",
        config,
        createdById: ACTOR_ID,
      },
      select: { id: true },
    });
    expect(result.config).toEqual(config);
  });

  it("persists config when updating a DRAFT version", async () => {
    const config = validConfig();
    mocks.prisma.exerciseTemplateVersion.findUnique
      .mockResolvedValueOnce({ status: "DRAFT" })
      .mockResolvedValueOnce(versionDetail(config));

    const result = await updateTemplateVersion(VERSION_ID, { config });

    expect(mocks.prisma.exerciseTemplateVersion.update).toHaveBeenCalledWith({
      where: { id: VERSION_ID },
      data: { config },
    });
    expect(result.config).toEqual(config);
  });

  it("returns version config from the detail projection", async () => {
    const config = validConfig();
    mocks.prisma.exerciseTemplateVersion.findUnique.mockResolvedValue(versionDetail(config));

    const result = await getTemplateVersion(VERSION_ID);

    expect(result.config).toEqual(config);
  });

  it("rejects publishing a version without a valid config", async () => {
    mocks.prisma.exerciseTemplateVersion.findUnique.mockResolvedValue({
      id: VERSION_ID,
      templateId: TEMPLATE_ID,
      status: "REVIEW",
      config: null,
    });

    await expect(publishTemplateVersion(VERSION_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: "Yayınlanacak şablon sürümünün geçerli config alanı olmalı",
    });
    expect(mocks.prisma.exerciseTemplateVersion.update).not.toHaveBeenCalled();
    expect(mocks.prisma.exerciseTemplate.update).not.toHaveBeenCalled();
  });

  it("publishes a configured version and its parent atomically", async () => {
    const config = validConfig();
    mocks.prisma.exerciseTemplateVersion.findUnique
      .mockResolvedValueOnce({
        id: VERSION_ID,
        templateId: TEMPLATE_ID,
        status: "REVIEW",
        config,
      })
      .mockResolvedValueOnce({ contents: [], questions: [] })
      .mockResolvedValueOnce(versionDetail(config, "PUBLISHED"));
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof mocks.prisma) => Promise<unknown>) =>
        callback(mocks.prisma),
    );

    const result = await publishTemplateVersion(VERSION_ID);

    expect(mocks.prisma.exerciseTemplateVersion.update).toHaveBeenCalledWith({
      where: { id: VERSION_ID },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date) },
    });
    expect(mocks.prisma.exerciseTemplate.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: { status: "PUBLISHED" },
    });
    expect(result.status).toBe("PUBLISHED");
    expect(result.config).toEqual(config);
  });
});
