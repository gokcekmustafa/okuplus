import type { PlatformRole, Prisma } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { notFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { withTenantContext } from "../tenant/index.js";
import { assertStudentActor } from "../student-learning/policy.js";
import {
  assertLearningContentAccessible,
  completeLearningStepForContentVersion,
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
  currentVersion: {
    id: string;
    contentId: string;
    version: number;
    title: string;
    body: string;
    status: string;
    publishedAt: Date | null;
    metadata: Prisma.JsonValue | null;
  } | null;
  contentSkills: Array<{ skill: { code: string; name: string } }>;
};

const LESSON_SELECT = {
  id: true,
  title: true,
  difficulty: true,
  tenantId: true,
  currentVersion: {
    select: {
      id: true,
      contentId: true,
      version: true,
      title: true,
      body: true,
      status: true,
      publishedAt: true,
      metadata: true,
    },
  },
  contentSkills: { select: { skill: { select: { code: true, name: true } } } },
} satisfies Prisma.ContentSelect;

function assertActor(actor: LessonActor): asserts actor is LessonActor & { tenantId: string } {
  assertStudentActor(actor);
}

function metadataFor(row: LessonRow): LessonMetadata | null {
  return parseLessonMetadata(row.currentVersion?.metadata);
}

function visibleWhere(actor: LessonActor): Prisma.ContentWhereInput {
  return {
    deletedAt: null,
    status: "PUBLISHED",
    OR: [{ tenantId: null }, { tenantId: actor.tenantId }],
    currentVersion: { status: "PUBLISHED" },
  };
}

async function findLessonRows(actor: LessonActor): Promise<LessonRow[]> {
  const rows = (await prisma.content.findMany({
    where: {
      deletedAt: null,
      status: "PUBLISHED",
      OR: [{ tenantId: null }, { tenantId: actor.tenantId ?? undefined }],
      currentVersion: { status: "PUBLISHED" },
    },
    select: LESSON_SELECT,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 100,
  })) as LessonRow[];
  return rows.filter((row) => metadataFor(row) !== null);
}

function toLesson(row: LessonRow, completedAt: Date | null) {
  const metadata = metadataFor(row);
  if (!metadata || !row.currentVersion) throw notFoundError("Ders bulunamadı");
  return {
    id: row.id,
    contentVersionId: row.currentVersion.id,
    version: row.currentVersion.version,
    title: row.currentVersion.title || row.title,
    body: row.currentVersion.body,
    difficulty: row.difficulty,
    skill: row.contentSkills[0]?.skill ?? null,
    ...metadata,
    completion: { completed: completedAt !== null, completedAt },
  };
}

export async function listStudentLessons(actor: LessonActor) {
  assertActor(actor);
  const rows = await findLessonRows(actor);
  const versionIds = rows.flatMap((row) => (row.currentVersion ? [row.currentVersion.id] : []));
  const completions = await withTenantContext(actor, (tx) =>
    tx.studentLessonProgress.findMany({
      where: {
        tenantId: actor.tenantId,
        studentId: actor.userId,
        contentVersionId: { in: versionIds },
      },
      select: { contentVersionId: true, completedAt: true },
    }),
  );
  const byVersion = new Map(completions.map((item) => [item.contentVersionId, item.completedAt]));
  return { items: rows.map((row) => toLesson(row, byVersion.get(row.currentVersion!.id) ?? null)) };
}

export async function getStudentLesson(id: string, actor: LessonActor) {
  assertActor(actor);
  const row = (await prisma.content.findFirst({
    where: { id, ...visibleWhere(actor) },
    select: LESSON_SELECT,
  })) as LessonRow | null;
  if (!row || !row.currentVersion || !metadataFor(row)) throw notFoundError("Ders bulunamadı");
  const contentVersionId = row.currentVersion.id;
  const progress = await withTenantContext(actor, (tx) =>
    tx.studentLessonProgress.findUnique({
      where: {
        tenantId_studentId_contentVersionId: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          contentVersionId,
        },
      },
      select: { completedAt: true },
    }),
  );
  return toLesson(row, progress?.completedAt ?? null);
}

export async function completeStudentLesson(id: string, actor: LessonActor) {
  assertActor(actor);
  const lesson = await getStudentLesson(id, actor);
  await assertLearningContentAccessible(actor, lesson.contentVersionId);
  const completedAt = new Date();
  try {
    await withTenantContext(actor, async (tx) => {
      await tx.studentLessonProgress.create({
        data: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          contentVersionId: lesson.contentVersionId,
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
  await completeLearningStepForContentVersion(actor, lesson.contentVersionId).catch(() => {});
  return getStudentLesson(id, actor);
}
