import type { PlatformRole, Prisma } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { notFoundError, validationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { withTenantContext } from "../tenant/index.js";
import { assertStudentActor } from "../student-learning/policy.js";
import {
  assertLearningStepAdjacent,
  assertLearningStepAccessible,
  completeLearningStep,
  getLearningStepNavigation,
  getNextLearningStepAfter,
} from "../learning-path/index.js";
import { parseLessonMetadata, type LessonMetadata } from "./contract.js";

export type LessonActor = {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
};

type LessonRow = {
  id: string;
  title: string;
  difficulty: number;
  tenantId: string | null;
  versions: Array<{
    id: string;
    contentId: string;
    version: number;
    title: string;
    body: string;
    status: string;
    publishedAt: Date | null;
    metadata: Prisma.JsonValue | null;
  }>;
  contentSkills: Array<{ skill: { code: string; name: string } }>;
};

const LESSON_VERSION_SELECT = {
  id: true,
  contentId: true,
  version: true,
  title: true,
  body: true,
  status: true,
  publishedAt: true,
  metadata: true,
} satisfies Prisma.ContentVersionSelect;

const LESSON_SELECT = {
  id: true,
  title: true,
  difficulty: true,
  tenantId: true,
  contentSkills: { select: { skill: { select: { code: true, name: true } } } },
} satisfies Prisma.ContentSelect;

function assertActor(actor: LessonActor): asserts actor is LessonActor & { tenantId: string } {
  assertStudentActor(actor);
}
function metadataFor(version: LessonRow["versions"][number] | undefined): LessonMetadata | null {
  return parseLessonMetadata(version?.metadata);
}

function visibleWhere(actor: LessonActor): Prisma.ContentWhereInput {
  return {
    deletedAt: null,
    status: "PUBLISHED",
    OR: [{ tenantId: null }, { tenantId: actor.tenantId }],
  };
}

function toLesson(
  row: LessonRow,
  version: LessonRow["versions"][number],
  completedAt: Date | null,
) {
  const metadata = metadataFor(version);
  if (!metadata) throw notFoundError("Ders bulunamadı");
  return {
    id: row.id,
    contentVersionId: version.id,
    version: version.version,
    title: version.title || row.title,
    body: version.body,
    difficulty: row.difficulty,
    skill: row.contentSkills[0]?.skill ?? null,
    ...metadata,
    completion: { completed: completedAt !== null, completedAt },
  };
}

function learningStepView(node: Awaited<ReturnType<typeof assertLearningStepAccessible>>) {
  return {
    id: node.id,
    type: node.type,
    title: node.label,
    unitTitle: node.unit.title,
    status: node.status,
  };
}

async function findLessonForContentVersion(contentVersionId: string, actor: LessonActor) {
  const row = (await prisma.content.findFirst({
    where: {
      ...visibleWhere(actor),
      versions: { some: { id: contentVersionId, status: "PUBLISHED" } },
    },
    select: {
      ...LESSON_SELECT,
      versions: {
        where: { id: contentVersionId, status: "PUBLISHED" },
        take: 1,
        select: LESSON_VERSION_SELECT,
      },
    },
  })) as LessonRow | null;
  const version = row?.versions[0];
  if (!row || !version || !metadataFor(version)) throw notFoundError("Ders bulunamadı");
  const progress = await withTenantContext(actor, (tx) =>
    tx.studentLessonProgress.findUnique({
      where: {
        tenantId_studentId_contentVersionId: {
          tenantId: actor.tenantId!,
          studentId: actor.userId,
          contentVersionId,
        },
      },
      select: { completedAt: true },
    }),
  );
  return toLesson(row, version, progress?.completedAt ?? null);
}

/**
 * Returns the lesson belonging to one accessible roadmap station. The roadmap
 * is the source of truth for which lesson the student may open next.
 */
export async function getStudentLearningStepLesson(
  stepId: string,
  actor: LessonActor,
  navigationFromStepId?: string,
) {
  assertActor(actor);
  if (navigationFromStepId) {
    await assertLearningStepAdjacent(actor, navigationFromStepId, stepId);
  }
  const node = await assertLearningStepAccessible(actor, stepId);
  if (node.type !== "TEACHING" && node.type !== "SMALL_STUDY") {
    throw validationError("Bu öğrenme adımı doğrudan ders ekranı kullanmıyor");
  }
  if (!node.contentVersionId) {
    throw notFoundError("Bu öğrenme adımının yayınlanmış dersi yok");
  }
  return {
    lesson: await findLessonForContentVersion(node.contentVersionId, actor),
    learningStep: learningStepView(node),
    navigation: await getLearningStepNavigation(actor, stepId),
  };
}

/**
 * Completes the currently open teaching/small-study station and returns the
 * server-selected next station. The client never supplies the next step.
 */
export async function completeStudentLearningStepLesson(stepId: string, actor: LessonActor) {
  assertActor(actor);
  const current = await getStudentLearningStepLesson(stepId, actor);
  const completedAt = new Date();
  try {
    await withTenantContext(actor, async (tx) => {
      await tx.studentLessonProgress.create({
        data: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          contentVersionId: current.lesson.contentVersionId,
          completedAt,
        },
      });
    });
  } catch (error) {
    if (
      !(error instanceof PrismaNamespace.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }

  await completeLearningStep(actor, stepId);
  return {
    lesson: await findLessonForContentVersion(current.lesson.contentVersionId, actor),
    learningStep: { ...current.learningStep, status: "completed" as const },
    nextStep: await getNextLearningStepAfter(actor, stepId),
  };
}
