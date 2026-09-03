import { Prisma, type ContentStatus, type VersionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError } from "../../lib/errors.js";
import type {
  CreateContentInput,
  CreateContentVersionInput,
  CreateLevelInput,
  CreateSkillInput,
  ListContentsQuery,
  ListLevelsQuery,
  ListSkillsQuery,
  UpdateContentInput,
  UpdateContentSkillsInput,
  UpdateContentStatusInput,
  UpdateContentVersionInput,
  UpdateLevelInput,
  UpdateSkillInput,
} from "./schemas.js";

/**
 * İçerik Yönetimi servisi (SUPER_ADMIN + CONTENT_EDITOR).
 *
 * KAPSAM:
 *  - tenantId NULL = GLOBAL katalog: tüm kurumlar okur, yönetim yalnızca
 *    platform yetkilileri (route guard + servis kuralı).
 *  - tenantId dolu = o kuruma özel katalog; kurum var olmalı ve soft-delete
 *    edilmemiş olmalı (aksi halde 404).
 *
 * SÜRÜM YAŞAM DÖNGÜSÜ: DRAFT → REVIEW → PUBLISHED.
 *  - ContentVersion.status PUBLISHED immutable'dır (DB trigger manual/007 +
 *    servis kuralı). Değişiklik her zaman yeni bir sürüm üretir.
 *  - Publish işlemi: sürüm PUBLISHED + publishedAt olur; ardından
 *    Content.currentVersionId ve Content.status=PUBLISHED güncellenir.
 *  - wordCount body'den servis tarafında hesaplanır; readabilityScore
 *    şimdilik boş/opsiyonel bırakılır (yazılmaz).
 *
 * İÇERİK DURUMU:
 *  - PUBLISHED: yayınlanmış bir sürümü olmalıdır (currentVersionId).
 *  - ARCHIVED: DRAFT veya PUBLISHED durumundan geçilebilir (arşivleme).
 *  - DRAFT: yalnızca ARCHIVED durumdan geri alınabilir.
 *  - İçerik silme SOFT-DELETE'tir (deletedAt); yayınlı içerik de silinebilir,
 *    sürüm geçmişi korunur.
 *
 * BECERİ / SEVİYE (salt global katalog):
 *  - Skill.code ve Level.code unique'dir (P2002 → 409).
 *  - Beceri içeriklerde/ilerlemede kullanılıyorsa silinemez (P2003 → 409).
 */

const CONTENT_LIST_SELECT = {
  id: true,
  tenantId: true,
  type: true,
  title: true,
  difficulty: true,
  status: true,
  currentVersionId: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, name: true, deletedAt: true } },
  currentVersion: { select: { version: true, status: true } },
  _count: { select: { versions: true, questions: true, contentSkills: true } },
} satisfies Prisma.ContentSelect;

const CONTENT_DETAIL_SELECT = {
  ...CONTENT_LIST_SELECT,
  currentVersion: {
    select: {
      id: true,
      version: true,
      title: true,
      status: true,
      publishedAt: true,
      wordCount: true,
      createdAt: true,
      createdBy: { select: { displayName: true } },
    },
  },
  contentSkills: {
    select: { skill: { select: { id: true, code: true, name: true, category: true } } },
    orderBy: { skill: { displayOrder: "asc" } },
  },
} satisfies Prisma.ContentSelect;

const VERSION_SUMMARY_SELECT = {
  id: true,
  contentId: true,
  version: true,
  title: true,
  status: true,
  publishedAt: true,
  wordCount: true,
  createdAt: true,
  createdBy: { select: { displayName: true } },
} satisfies Prisma.ContentVersionSelect;

const VERSION_DETAIL_SELECT = {
  ...VERSION_SUMMARY_SELECT,
  body: true,
  license: true,
  changelog: true,
  readabilityScore: true,
} satisfies Prisma.ContentVersionSelect;

export interface ContentListItem {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  type: string;
  title: string;
  difficulty: number;
  status: ContentStatus;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  versionCount: number;
  questionCount: number;
  skillCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentListResult {
  items: ContentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ContentSkillSummary {
  id: string;
  code: string;
  name: string;
  category: string;
}

export interface CurrentVersionSummary {
  id: string;
  version: number;
  title: string;
  status: VersionStatus;
  publishedAt: Date | null;
  wordCount: number;
  createdAt: Date;
  createdByName: string | null;
}

export interface ContentDetail extends ContentListItem {
  currentVersion: CurrentVersionSummary | null;
  skills: ContentSkillSummary[];
}

export interface ContentVersionSummary {
  id: string;
  contentId: string;
  version: number;
  title: string;
  status: VersionStatus;
  publishedAt: Date | null;
  wordCount: number;
  createdAt: Date;
  createdByName: string | null;
}

export interface ContentVersionDetail extends ContentVersionSummary {
  body: string;
  license: string | null;
  changelog: string | null;
  readabilityScore: number | null;
}

export interface SkillItem {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  displayOrder: number;
  contentCount: number;
  createdAt: Date;
}

export interface SkillListResult {
  items: SkillItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LevelItem {
  id: string;
  code: string;
  name: string;
  minScore: number;
  maxScore: number;
  gradeBand: string | null;
  difficultyMin: number;
  difficultyMax: number;
  displayOrder: number;
  createdAt: Date;
}

export interface LevelListResult {
  items: LevelItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------- İçerik ----------

export async function listContents(query: ListContentsQuery): Promise<ContentListResult> {
  const { search, scope, tenantId, type, status, skillId, page, pageSize } = query;

  const where: Prisma.ContentWhereInput = {
    deletedAt: null,
    OR: [{ tenantId: null }, { tenant: { deletedAt: null } }],
    ...(scope === "GLOBAL" ? { tenantId: null } : {}),
    ...(scope === "TENANT" ? { tenantId: { not: null } } : {}),
    ...(tenantId ? { tenantId } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(skillId ? { contentSkills: { some: { skillId } } } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.content.findMany({
      where,
      select: CONTENT_LIST_SELECT,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.content.count({ where }),
  ]);

  return {
    items: rows.map(toContentListItem),
    total,
    page,
    pageSize,
  };
}

export async function getContent(id: string): Promise<ContentDetail> {
  const row = await findContent(id);
  if (!row) {
    throw notFoundError("İçerik bulunamadı");
  }
  return toContentDetail(row);
}

export async function createContent(
  input: CreateContentInput,
  actorId?: string,
): Promise<ContentDetail> {
  const tenantId = input.tenantId ?? null;
  if (tenantId !== null) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) {
      throw notFoundError("Kurum bulunamadı");
    }
  }

  const created = await prisma.content.create({
    data: {
      tenantId,
      type: input.type,
      title: input.title,
      difficulty: input.difficulty,
      ...(input.status ? { status: input.status } : {}),
      ...(actorId ? { createdById: actorId } : {}),
    },
    select: { id: true },
  });
  return getContent(created.id);
}

export async function updateContent(id: string, input: UpdateContentInput): Promise<ContentDetail> {
  if (!(await findContent(id))) {
    throw notFoundError("İçerik bulunamadı");
  }

  await prisma.content.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
    },
  });
  return getContent(id);
}

export async function updateContentStatus(
  id: string,
  input: UpdateContentStatusInput,
): Promise<ContentDetail> {
  const row = await prisma.content.findFirst({
    where: { id, deletedAt: null, OR: [{ tenantId: null }, { tenant: { deletedAt: null } }] },
    select: { id: true, status: true },
  });
  if (!row) {
    throw notFoundError("İçerik bulunamadı");
  }

  if (input.status !== row.status) {
    switch (input.status) {
      case "PUBLISHED": {
        const published = await prisma.contentVersion.findFirst({
          where: { contentId: id, status: "PUBLISHED" },
          select: { id: true },
        });
        if (!published) {
          throw validationError("Yayınlanmış bir sürümü olmayan içerik yayınlanamaz");
        }
        break;
      }
      case "ARCHIVED": {
        if (row.status !== "DRAFT" && row.status !== "PUBLISHED") {
          throw validationError("Bu durumdan arşivlenmiş duruma geçilemez");
        }
        break;
      }
      case "DRAFT": {
        if (row.status !== "ARCHIVED") {
          throw validationError("Yalnızca arşivlenmiş içerik taslağa alınabilir");
        }
        break;
      }
    }

    await prisma.content.update({ where: { id }, data: { status: input.status } });
  }

  return getContent(id);
}

export async function softDeleteContent(id: string): Promise<{ id: string; deletedAt: Date }> {
  const content = await prisma.content.findFirst({ where: { id, deletedAt: null } });
  if (!content) {
    throw notFoundError("İçerik bulunamadı");
  }

  const updated = await prisma.content.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  if (updated.deletedAt === null) {
    throw new Error("softDeleteContent: deletedAt set edilemedi");
  }
  return { id: updated.id, deletedAt: updated.deletedAt };
}

// ---------- İçerik sürümleri ----------

export async function listContentVersions(contentId: string): Promise<ContentVersionSummary[]> {
  if (!(await findContent(contentId))) {
    throw notFoundError("İçerik bulunamadı");
  }

  const rows = await prisma.contentVersion.findMany({
    where: { contentId },
    select: VERSION_SUMMARY_SELECT,
    orderBy: { version: "desc" },
  });
  return rows.map(toContentVersionSummary);
}

export async function getContentVersion(id: string): Promise<ContentVersionDetail> {
  const row = await prisma.contentVersion.findUnique({
    where: { id },
    select: VERSION_DETAIL_SELECT,
  });
  if (!row) {
    throw notFoundError("İçerik sürümü bulunamadı");
  }
  return toContentVersionDetail(row);
}

export async function createContentVersion(
  contentId: string,
  input: CreateContentVersionInput,
  actorId?: string,
): Promise<ContentVersionDetail> {
  const content = await prisma.content.findFirst({
    where: { id: contentId, deletedAt: null },
    select: { id: true, title: true },
  });
  if (!content) {
    throw notFoundError("İçerik bulunamadı");
  }

  const last = await prisma.contentVersion.findFirst({
    where: { contentId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (last?.version ?? 0) + 1;

  const created = await prisma.contentVersion.create({
    data: {
      contentId,
      version: nextVersion,
      title: input.title ?? content.title,
      body: input.body,
      wordCount: computeWordCount(input.body),
      license: input.license ?? null,
      changelog: input.changelog ?? null,
      ...(actorId ? { createdById: actorId } : {}),
    },
    select: { id: true },
  });
  return getContentVersion(created.id);
}

export async function updateContentVersion(
  id: string,
  input: UpdateContentVersionInput,
): Promise<ContentVersionDetail> {
  const existing = await prisma.contentVersion.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw notFoundError("İçerik sürümü bulunamadı");
  }
  if (existing.status === "PUBLISHED") {
    throw validationError("Yayınlanmış sürüm düzenlenemez. Yeni bir sürüm oluşturulmalı.");
  }

  const data: Prisma.ContentVersionUncheckedUpdateInput = {};
  if (input.title !== undefined) {
    data.title = input.title;
  }
  if (input.body !== undefined) {
    data.body = input.body;
    data.wordCount = computeWordCount(input.body);
  }
  if (input.license !== undefined) {
    data.license = input.license;
  }
  if (input.changelog !== undefined) {
    data.changelog = input.changelog;
  }

  await prisma.contentVersion.update({ where: { id }, data });
  return getContentVersion(id);
}

export async function reviewContentVersion(id: string): Promise<ContentVersionDetail> {
  const existing = await prisma.contentVersion.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw notFoundError("İçerik sürümü bulunamadı");
  }
  if (existing.status !== "DRAFT") {
    throw validationError("Yalnızca taslak sürüm incelemeye alınabilir");
  }

  await prisma.contentVersion.update({ where: { id }, data: { status: "REVIEW" } });
  return getContentVersion(id);
}

export async function publishContentVersion(id: string): Promise<ContentVersionDetail> {
  const existing = await prisma.contentVersion.findUnique({
    where: { id },
    select: { id: true, contentId: true, status: true },
  });
  if (!existing) {
    throw notFoundError("İçerik sürümü bulunamadı");
  }
  if (existing.status === "PUBLISHED") {
    throw validationError("Sürüm zaten yayınlanmış");
  }
  if (existing.status === "ARCHIVED") {
    throw validationError("Arşivlenmiş sürüm yayınlanamaz");
  }

  const content = await prisma.content.findFirst({
    where: { id: existing.contentId, deletedAt: null },
    select: { id: true },
  });
  if (!content) {
    throw notFoundError("İçerik bulunamadı");
  }

  await prisma.$transaction(async (tx) => {
    await tx.contentVersion.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await tx.content.update({
      where: { id: existing.contentId },
      data: { currentVersionId: id, status: "PUBLISHED" },
    });
  });

  return getContentVersion(id);
}

// ---------- Beceri bağlantıları ----------

export async function updateContentSkills(
  contentId: string,
  input: UpdateContentSkillsInput,
): Promise<ContentDetail> {
  if (!(await findContent(contentId))) {
    throw notFoundError("İçerik bulunamadı");
  }

  const skillIds = [...new Set(input.skillIds)];
  if (skillIds.length > 0) {
    const found = await prisma.skill.findMany({
      where: { id: { in: skillIds } },
      select: { id: true },
    });
    if (found.length !== skillIds.length) {
      throw validationError("Beceri kataloğunda bulunamayan beceri kimliği var");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.contentSkill.deleteMany({ where: { contentId } });
    if (skillIds.length > 0) {
      await tx.contentSkill.createMany({
        data: skillIds.map((skillId) => ({ contentId, skillId })),
      });
    }
  });

  return getContent(contentId);
}

// ---------- Beceri kataloğu ----------

export async function listSkills(query: ListSkillsQuery): Promise<SkillListResult> {
  const { search, category, page, pageSize } = query;

  const where: Prisma.SkillWhereInput = {
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(category ? { category } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        description: true,
        displayOrder: true,
        createdAt: true,
        _count: { select: { contentSkills: true } },
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.skill.count({ where }),
  ]);

  return {
    items: rows.map(({ _count, ...s }) => ({
      ...s,
      contentCount: _count.contentSkills,
    })),
    total,
    page,
    pageSize,
  };
}

export async function createSkill(input: CreateSkillInput): Promise<SkillItem> {
  try {
    const created = await prisma.skill.create({
      data: {
        code: input.code,
        name: input.name,
        category: input.category,
        description: input.description ?? null,
        displayOrder: input.displayOrder,
      },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        description: true,
        displayOrder: true,
        createdAt: true,
        _count: { select: { contentSkills: true } },
      },
    });
    const { _count, ...skill } = created;
    return { ...skill, contentCount: _count.contentSkills };
  } catch (err) {
    throw translateCatalogError(err, "beceri");
  }
}

export async function updateSkill(id: string, input: UpdateSkillInput): Promise<SkillItem> {
  const data: Prisma.SkillUncheckedUpdateInput = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.name !== undefined) data.name = input.name;
  if (input.category !== undefined) data.category = input.category;
  if (input.description !== undefined) data.description = input.description;
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;

  try {
    const updated = await prisma.skill.update({
      where: { id },
      data,
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        description: true,
        displayOrder: true,
        createdAt: true,
        _count: { select: { contentSkills: true } },
      },
    });
    const { _count, ...skill } = updated;
    return { ...skill, contentCount: _count.contentSkills };
  } catch (err) {
    throw translateCatalogError(err, "beceri");
  }
}

export async function deleteSkill(id: string): Promise<{ id: string }> {
  // Beceri ContentSkill (Restrict) ve StudentProgress (Restrict) ile
  // referanslanıyorsa DB silmeyi RESTRICT (SQLSTATE 23001) ile engeller.
  // Bu kod Prisma tarafından P2003'e eşlenmediği için referans kontrolü
  // önceden yapılır (defense-in-depth + net hata mesajı).
  const [contentSkillCount, progressCount] = await Promise.all([
    prisma.contentSkill.count({ where: { skillId: id } }),
    prisma.studentProgress.count({ where: { skillId: id } }),
  ]);
  if (contentSkillCount > 0 || progressCount > 0) {
    throw conflictError("Beceri içeriklerde veya öğrenci ilerlemelerinde kullanılıyor; silinemez");
  }

  try {
    await prisma.skill.delete({ where: { id } });
    return { id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw notFoundError("Beceri bulunamadı");
    }
    throw err;
  }
}

// ---------- Seviye kataloğu ----------

export async function listLevels(query: ListLevelsQuery): Promise<LevelListResult> {
  const { search, page, pageSize } = query;

  const where: Prisma.LevelWhereInput = {
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.level.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        minScore: true,
        maxScore: true,
        gradeBand: true,
        difficultyMin: true,
        difficultyMax: true,
        displayOrder: true,
        createdAt: true,
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.level.count({ where }),
  ]);

  return { items: rows, total, page, pageSize };
}

export async function createLevel(input: CreateLevelInput): Promise<LevelItem> {
  try {
    return await prisma.level.create({
      data: {
        code: input.code,
        name: input.name,
        minScore: input.minScore,
        maxScore: input.maxScore,
        gradeBand: input.gradeBand ?? null,
        difficultyMin: input.difficultyMin,
        difficultyMax: input.difficultyMax,
        displayOrder: input.displayOrder,
      },
    });
  } catch (err) {
    throw translateCatalogError(err, "seviye");
  }
}

export async function updateLevel(id: string, input: UpdateLevelInput): Promise<LevelItem> {
  const data: Prisma.LevelUncheckedUpdateInput = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.name !== undefined) data.name = input.name;
  if (input.minScore !== undefined) data.minScore = input.minScore;
  if (input.maxScore !== undefined) data.maxScore = input.maxScore;
  if (input.gradeBand !== undefined) data.gradeBand = input.gradeBand;
  if (input.difficultyMin !== undefined) data.difficultyMin = input.difficultyMin;
  if (input.difficultyMax !== undefined) data.difficultyMax = input.difficultyMax;
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;

  try {
    return await prisma.level.update({ where: { id }, data });
  } catch (err) {
    throw translateCatalogError(err, "seviye");
  }
}

export async function deleteLevel(id: string): Promise<{ id: string }> {
  try {
    await prisma.level.delete({ where: { id } });
    return { id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        throw notFoundError("Seviye bulunamadı");
      }
      if (err.code === "P2003") {
        throw conflictError("Seviye kullanımda olduğu için silinemez");
      }
    }
    throw err;
  }
}

// ---------- Yardımcılar ----------

async function findContent(id: string) {
  return prisma.content.findFirst({
    where: { id, deletedAt: null, OR: [{ tenantId: null }, { tenant: { deletedAt: null } }] },
    select: CONTENT_DETAIL_SELECT,
  });
}

function toContentListItem(row: {
  id: string;
  tenantId: string | null;
  type: string;
  title: string;
  difficulty: number;
  status: ContentStatus;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenant: { id: string; name: string; deletedAt: Date | null } | null;
  currentVersion: { version: number; status: string } | null;
  _count: { versions: number; questions: number; contentSkills: number };
}): ContentListItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenant
      ? row.tenant.deletedAt
        ? `${row.tenant.name} (silindi)`
        : row.tenant.name
      : null,
    type: row.type,
    title: row.title,
    difficulty: row.difficulty,
    status: row.status,
    currentVersionId: row.currentVersionId,
    currentVersionNumber: row.currentVersion?.version ?? null,
    versionCount: row._count.versions,
    questionCount: row._count.questions,
    skillCount: row._count.contentSkills,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toContentDetail(row: {
  id: string;
  tenantId: string | null;
  type: string;
  title: string;
  difficulty: number;
  status: ContentStatus;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenant: { id: string; name: string; deletedAt: Date | null } | null;
  currentVersion: {
    id: string;
    version: number;
    title: string;
    status: VersionStatus;
    publishedAt: Date | null;
    wordCount: number;
    createdAt: Date;
    createdBy: { displayName: string } | null;
  } | null;
  _count: { versions: number; questions: number; contentSkills: number };
  contentSkills: Array<{ skill: { id: string; code: string; name: string; category: string } }>;
}): ContentDetail {
  const item = toContentListItem(row);
  return {
    ...item,
    currentVersion: row.currentVersion
      ? {
          id: row.currentVersion.id,
          version: row.currentVersion.version,
          title: row.currentVersion.title,
          status: row.currentVersion.status,
          publishedAt: row.currentVersion.publishedAt,
          wordCount: row.currentVersion.wordCount,
          createdAt: row.currentVersion.createdAt,
          createdByName: row.currentVersion.createdBy?.displayName ?? null,
        }
      : null,
    skills: row.contentSkills.map(({ skill }) => skill),
  };
}

function toContentVersionSummary(row: {
  id: string;
  contentId: string;
  version: number;
  title: string;
  status: VersionStatus;
  publishedAt: Date | null;
  wordCount: number;
  createdAt: Date;
  createdBy: { displayName: string } | null;
}): ContentVersionSummary {
  return {
    id: row.id,
    contentId: row.contentId,
    version: row.version,
    title: row.title,
    status: row.status,
    publishedAt: row.publishedAt,
    wordCount: row.wordCount,
    createdAt: row.createdAt,
    createdByName: row.createdBy?.displayName ?? null,
  };
}

function toContentVersionDetail(row: {
  id: string;
  contentId: string;
  version: number;
  title: string;
  status: VersionStatus;
  publishedAt: Date | null;
  wordCount: number;
  createdAt: Date;
  createdBy: { displayName: string } | null;
  body: string;
  license: string | null;
  changelog: string | null;
  readabilityScore: number | null;
}): ContentVersionDetail {
  return {
    ...toContentVersionSummary(row),
    body: row.body,
    license: row.license,
    changelog: row.changelog,
    readabilityScore: row.readabilityScore,
  };
}

function computeWordCount(body: string): number {
  const trimmed = body.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function translateCatalogError(err: unknown, entity: "beceri" | "seviye"): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw conflictError(`Bu koda sahip bir ${entity} zaten mevcut`);
  }
  throw err;
}
