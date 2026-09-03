/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Prisma, type ExerciseTemplateStatus, type VersionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError } from "../../lib/errors.js";
import type {
  CreateTemplateInput,
  CreateTemplateVersionInput,
  ListTemplatesQuery,
  UpdateTemplateInput,
  UpdateTemplateVersionContentsInput,
  UpdateTemplateVersionQuestionsInput,
} from "./schemas.js";

const TEMPLATE_LIST_SELECT = {
  id: true,
  tenantId: true,
  title: true,
  type: true,
  skillId: true,
  config: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, name: true } },
  skill: { select: { id: true, code: true, name: true } },
  _count: { select: { versions: true } },
} satisfies Prisma.ExerciseTemplateSelect;

const TEMPLATE_DETAIL_SELECT = {
  ...TEMPLATE_LIST_SELECT,
  versions: {
    select: {
      id: true,
      version: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      createdBy: { select: { displayName: true } },
    },
    orderBy: { version: "desc" as const },
  },
} satisfies Prisma.ExerciseTemplateSelect;

const VERSION_SUMMARY_SELECT = {
  id: true,
  templateId: true,
  version: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  createdBy: { select: { displayName: true } },
} satisfies Prisma.ExerciseTemplateVersionSelect;

const VERSION_DETAIL_SELECT = {
  ...VERSION_SUMMARY_SELECT,
  contents: {
    select: {
      position: true,
      contentVersion: {
        select: {
          id: true,
          title: true,
          version: true,
          status: true,
          content: { select: { id: true, title: true, tenantId: true } },
        },
      },
    },
    orderBy: { position: "asc" as const },
  },
  questions: {
    select: {
      position: true,
      questionVersion: {
        select: {
          id: true,
          prompt: true,
          version: true,
          status: true,
          question: { select: { id: true, type: true, contentId: true } },
        },
      },
    },
    orderBy: { position: "asc" as const },
  },
} satisfies Prisma.ExerciseTemplateVersionSelect;

export interface TemplateListItem {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  title: string;
  type: string;
  skillId: string | null;
  skillName: string | null;
  status: ExerciseTemplateStatus;
  versionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateListResult {
  items: TemplateListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listTemplates(query: ListTemplatesQuery): Promise<TemplateListResult> {
  const { search, type, status, skillId, tenantId, scope, page, pageSize } = query;
  const where: Prisma.ExerciseTemplateWhereInput = {
    deletedAt: null,
    ...(tenantId ? { tenantId } : {}),
    ...(scope === "GLOBAL" ? { tenantId: null } : {}),
    ...(scope === "TENANT" ? { tenantId: { not: null } } : {}),
    ...(type ? { type: type as any } : {}),
    ...(status ? { status: status as any } : {}),
    ...(skillId ? { skillId } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.exerciseTemplate.findMany({
      where,
      select: TEMPLATE_LIST_SELECT,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.exerciseTemplate.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      tenantName: (r.tenant as any)?.name ?? null,
      title: r.title,
      type: r.type,
      skillId: r.skillId,
      skillName: (r.skill as any)?.name ?? null,
      status: r.status,
      versionCount: (r as any)._count.versions,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getTemplate(id: string) {
  const row = await prisma.exerciseTemplate.findFirst({
    where: { id, deletedAt: null },
    select: TEMPLATE_DETAIL_SELECT,
  });
  if (!row) throw notFoundError("Şablon bulunamadı");
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: (row.tenant as any)?.name ?? null,
    title: row.title,
    type: row.type,
    skillId: row.skillId,
    skillName: (row.skill as any)?.name ?? null,
    config: row.config,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    versions: (row as any).versions.map((v: any) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      publishedAt: v.publishedAt,
      createdAt: v.createdAt,
      createdByName: v.createdBy?.displayName ?? null,
    })),
  };
}

export async function createTemplate(input: CreateTemplateInput, actorId?: string) {
  const tenantId = input.tenantId ?? null;
  if (tenantId !== null) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) throw notFoundError("Kurum bulunamadı");
  }
  if (input.skillId) {
    const skill = await prisma.skill.findUnique({
      where: { id: input.skillId },
      select: { id: true },
    });
    if (!skill) throw notFoundError("Beceri bulunamadı");
  }
  const created = await prisma.exerciseTemplate.create({
    data: {
      tenantId,
      title: input.title,
      type: input.type as any,
      skillId: input.skillId ?? null,
      config: (input.config as any) ?? Prisma.JsonNull,
      ...(input.status ? { status: input.status as any } : {}),
      ...(actorId ? { createdById: actorId } : {}),
    },
    select: { id: true },
  });
  // İlk sürümü oluştur (v1 DRAFT)
  await prisma.exerciseTemplateVersion.create({
    data: {
      templateId: created.id,
      version: 1,
      status: "DRAFT",
      ...(actorId ? { createdById: actorId } : {}),
    },
  });
  return getTemplate(created.id);
}

export async function updateTemplate(id: string, input: UpdateTemplateInput) {
  const existing = await prisma.exerciseTemplate.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw notFoundError("Şablon bulunamadı");
  if (input.skillId !== undefined && input.skillId !== null) {
    const skill = await prisma.skill.findUnique({
      where: { id: input.skillId },
      select: { id: true },
    });
    if (!skill) throw notFoundError("Beceri bulunamadı");
  }
  const data: Prisma.ExerciseTemplateUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.type !== undefined) data.type = input.type as any;
  if (input.skillId !== undefined) data.skillId = input.skillId;
  if (input.config !== undefined) data.config = input.config as any;
  if (Object.keys(data).length) await prisma.exerciseTemplate.update({ where: { id }, data });
  return getTemplate(id);
}

export async function deleteTemplate(id: string) {
  const existing = await prisma.exerciseTemplate.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw notFoundError("Şablon bulunamadı");
  const updated = await prisma.exerciseTemplate.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  return updated;
}

export async function listTemplateVersions(templateId: string) {
  const template = await prisma.exerciseTemplate.findFirst({
    where: { id: templateId, deletedAt: null },
    select: { id: true },
  });
  if (!template) throw notFoundError("Şablon bulunamadı");
  const rows = await prisma.exerciseTemplateVersion.findMany({
    where: { templateId },
    select: VERSION_SUMMARY_SELECT,
    orderBy: { version: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    templateId: r.templateId,
    version: r.version,
    status: r.status,
    publishedAt: r.publishedAt,
    createdAt: r.createdAt,
    createdByName: (r as any).createdBy?.displayName ?? null,
  }));
}

export async function getTemplateVersion(id: string) {
  const row = await prisma.exerciseTemplateVersion.findUnique({
    where: { id },
    select: VERSION_DETAIL_SELECT,
  });
  if (!row) throw notFoundError("Şablon sürümü bulunamadı");
  return {
    id: row.id,
    templateId: row.templateId,
    version: row.version,
    status: row.status,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    createdByName: (row as any).createdBy?.displayName ?? null,
    contents: (row as any).contents.map((c: any) => ({
      position: c.position,
      contentVersionId: c.contentVersion.id,
      contentVersionTitle: c.contentVersion.title,
      contentVersionVersion: c.contentVersion.version,
      contentVersionStatus: c.contentVersion.status,
      contentId: c.contentVersion.content.id,
      contentTitle: c.contentVersion.content.title,
      contentTenantId: c.contentVersion.content.tenantId,
    })),
    questions: (row as any).questions.map((q: any) => ({
      position: q.position,
      questionVersionId: q.questionVersion.id,
      questionVersionPrompt: q.questionVersion.prompt,
      questionVersionVersion: q.questionVersion.version,
      questionVersionStatus: q.questionVersion.status,
      questionId: q.questionVersion.question.id,
      questionType: q.questionVersion.question.type,
    })),
  };
}

export async function createTemplateVersion(
  templateId: string,
  _input: CreateTemplateVersionInput,
  actorId?: string,
) {
  const template = await prisma.exerciseTemplate.findFirst({
    where: { id: templateId, deletedAt: null },
    select: { id: true },
  });
  if (!template) throw notFoundError("Şablon bulunamadı");
  const last = await prisma.exerciseTemplateVersion.findFirst({
    where: { templateId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (last?.version ?? 0) + 1;
  const created = await prisma.exerciseTemplateVersion.create({
    data: {
      templateId,
      version: nextVersion,
      status: "DRAFT",
      ...(actorId ? { createdById: actorId } : {}),
    },
    select: { id: true },
  });
  return getTemplateVersion(created.id);
}

export async function updateTemplateVersion(id: string, _input: any) {
  const existing = await prisma.exerciseTemplateVersion.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) throw notFoundError("Şablon sürümü bulunamadı");
  if (existing.status !== "DRAFT") throw validationError("Yalnızca taslak sürüm düzenlenebilir");
  // Şablon sürümünde düzenlenebilir alan yok (config template'de), sadece varlık kontrolü
  return getTemplateVersion(id);
}

export async function reviewTemplateVersion(id: string) {
  const existing = await prisma.exerciseTemplateVersion.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) throw notFoundError("Şablon sürümü bulunamadı");
  if (existing.status !== "DRAFT")
    throw validationError("Yalnızca taslak sürüm incelemeye alınabilir");
  await prisma.exerciseTemplateVersion.update({ where: { id }, data: { status: "REVIEW" } });
  return getTemplateVersion(id);
}

export async function publishTemplateVersion(id: string) {
  const existing = await prisma.exerciseTemplateVersion.findUnique({
    where: { id },
    select: { id: true, templateId: true, status: true },
  });
  if (!existing) throw notFoundError("Şablon sürümü bulunamadı");
  if (existing.status === "PUBLISHED") throw validationError("Sürüm zaten yayınlanmış");
  if (existing.status === "ARCHIVED") throw validationError("Arşivlenmiş sürüm yayınlanamaz");
  // İçerik ve soru versiyonlarının PUBLISHED kontrolü
  const version = await prisma.exerciseTemplateVersion.findUnique({
    where: { id },
    select: {
      contents: { select: { contentVersionId: true } },
      questions: { select: { questionVersionId: true } },
    },
  });
  if (version) {
    if (version.contents.length > 0) {
      const bad = await prisma.contentVersion.findMany({
        where: {
          id: { in: version.contents.map((c) => c.contentVersionId) },
          status: { not: "PUBLISHED" },
        },
        select: { id: true },
      });
      if (bad.length) throw validationError("Şablondaki içerik sürümlerinden biri yayınlanmamış");
    }
    if (version.questions.length > 0) {
      const bad = await prisma.questionVersion.findMany({
        where: {
          id: { in: version.questions.map((q) => q.questionVersionId) },
          status: { not: "PUBLISHED" },
        },
        select: { id: true },
      });
      if (bad.length) throw validationError("Şablondaki soru sürümlerinden biri yayınlanmamış");
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.exerciseTemplateVersion.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await tx.exerciseTemplate.update({
      where: { id: existing.templateId },
      data: { status: "PUBLISHED" },
    });
  });
  return getTemplateVersion(id);
}

export async function updateTemplateVersionContents(
  templateVersionId: string,
  input: UpdateTemplateVersionContentsInput,
) {
  const version = await prisma.exerciseTemplateVersion.findUnique({
    where: { id: templateVersionId },
    select: { id: true, status: true, templateId: true, template: { select: { tenantId: true } } },
  });
  if (!version) throw notFoundError("Şablon sürümü bulunamadı");
  if (version.status !== "DRAFT")
    throw validationError("Yalnızca taslak sürümün içerikleri düzenlenebilir");
  const contentVersionIds = input.contents.map((c) => c.contentVersionId);
  const contentVersions = await prisma.contentVersion.findMany({
    where: { id: { in: contentVersionIds } },
    select: { id: true, status: true, content: { select: { tenantId: true } } },
  });
  if (contentVersions.length !== contentVersionIds.length)
    throw notFoundError("İçerik sürümü bulunamadı");
  for (const cv of contentVersions) {
    if (cv.status !== "PUBLISHED")
      throw validationError("Yalnızca yayınlanmış içerik sürümleri bağlanabilir");
    const contentTenantId = (cv.content as any).tenantId as string | null;
    const templateTenantId = version.template.tenantId as string | null;
    if (
      templateTenantId !== null &&
      contentTenantId !== null &&
      contentTenantId !== templateTenantId
    ) {
      throw validationError("Şablon ve içerik aynı tenant kapsamına ait olmalı");
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.exerciseTemplateVersionContent.deleteMany({ where: { templateVersionId } });
    if (input.contents.length) {
      await tx.exerciseTemplateVersionContent.createMany({
        data: input.contents.map((c) => ({
          templateVersionId,
          contentVersionId: c.contentVersionId,
          position: c.position,
        })),
      });
    }
  });
  return getTemplateVersion(templateVersionId);
}

export async function updateTemplateVersionQuestions(
  templateVersionId: string,
  input: UpdateTemplateVersionQuestionsInput,
) {
  const version = await prisma.exerciseTemplateVersion.findUnique({
    where: { id: templateVersionId },
    select: { id: true, status: true, templateId: true, template: { select: { tenantId: true } } },
  });
  if (!version) throw notFoundError("Şablon sürümü bulunamadı");
  if (version.status !== "DRAFT")
    throw validationError("Yalnızca taslak sürümün soruları düzenlenebilir");
  const questionVersionIds = input.questions.map((q) => q.questionVersionId);
  const questionVersions = await prisma.questionVersion.findMany({
    where: { id: { in: questionVersionIds } },
    select: {
      id: true,
      status: true,
      question: { select: { content: { select: { tenantId: true } } } },
    },
  });
  if (questionVersions.length !== questionVersionIds.length)
    throw notFoundError("Soru sürümü bulunamadı");
  for (const qv of questionVersions) {
    if (qv.status !== "PUBLISHED")
      throw validationError("Yalnızca yayınlanmış soru sürümleri bağlanabilir");
    const qTenantId = (qv.question as any).content.tenantId as string | null;
    const templateTenantId = version.template.tenantId as string | null;
    if (templateTenantId !== null && qTenantId !== null && qTenantId !== templateTenantId) {
      throw validationError("Şablon ve soru aynı tenant kapsamına ait olmalı");
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.exerciseTemplateVersionQuestion.deleteMany({ where: { templateVersionId } });
    if (input.questions.length) {
      await tx.exerciseTemplateVersionQuestion.createMany({
        data: input.questions.map((q) => ({
          templateVersionId,
          questionVersionId: q.questionVersionId,
          position: q.position,
        })),
      });
    }
  });
  return getTemplateVersion(templateVersionId);
}
