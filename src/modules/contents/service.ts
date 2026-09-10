import { Prisma, type ContentStatus, type VersionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError } from "../../lib/errors.js";
import { withTenantContext } from "../tenant/index.js";
import { writeLifecycleAudit } from "./audit.js";
import {
  assertCanApprove,
  assertCanArchive,
  assertCanCreateDraft,
  assertCanEditDraft,
  assertCanPublish,
  assertCanRetire,
  assertCanSubmitForReview,
  assertLifecycleTransition,
  buildCreatedAuditEntry,
  buildDeletedAuditEntry,
  buildLifecycleAuditEntry,
  buildVersionCreatedAuditEntry,
  type ContentMutationActor,
} from "./lifecycle.js";
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
  retiredAt: true,
  metadata: true,
  createdBy: { select: { displayName: true } },
  tenant: { select: { id: true, name: true, deletedAt: true } },
  currentVersion: { select: { version: true, status: true, publishedAt: true } },
  contentSkills: {
    select: { skill: { select: { code: true, name: true } } },
    orderBy: { skill: { displayOrder: "asc" } },
  },
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
      retiredAt: true,
      wordCount: true,
      createdAt: true,
      createdBy: { select: { displayName: true } },
      reviewedBy: { select: { displayName: true } },
      reviewedAt: true,
      approvedBy: { select: { displayName: true } },
      approvedAt: true,
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
  retiredAt: true,
  wordCount: true,
  createdAt: true,
  createdBy: { select: { displayName: true } },
  reviewedBy: { select: { displayName: true } },
  reviewedAt: true,
  approvedBy: { select: { displayName: true } },
  approvedAt: true,
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
  retiredAt: Date | null;
  metadataKeys: string[];
  skillNames: string[];
  createdByName: string | null;
  publishedAt: Date | null;
  lastAction: ContentAuditEntry | null;
}

export interface ContentListResult {
  items: ContentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ContentAuthorItem {
  id: string;
  displayName: string;
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
  retiredAt: Date | null;
  wordCount: number;
  createdAt: Date;
  createdByName: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  approvedByName: string | null;
  approvedAt: Date | null;
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
  retiredAt: Date | null;
  wordCount: number;
  createdAt: Date;
  createdByName: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  approvedByName: string | null;
  approvedAt: Date | null;
}

export interface ContentVersionDetail extends ContentVersionSummary {
  body: string;
  license: string | null;
  changelog: string | null;
  readabilityScore: number | null;
}

export interface ContentAuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  version: number | null;
  fromStatus: string | null;
  toStatus: string | null;
  actorName: string | null;
  createdAt: Date;
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
  const {
    search,
    scope,
    tenantId,
    type,
    status,
    skillId,
    authorId,
    sort,
    sortDirection,
    page,
    pageSize,
  } = query;

  const where: Prisma.ContentWhereInput = {
    deletedAt: null,
    AND: [
      { OR: [{ tenantId: null }, { tenant: { deletedAt: null } }] },
      ...(search
        ? [
            {
              OR: [
                { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { id: { contains: search, mode: Prisma.QueryMode.insensitive } },
                {
                  contentSkills: {
                    some: {
                      skill: {
                        OR: [
                          { code: { contains: search, mode: Prisma.QueryMode.insensitive } },
                          { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          ]
        : []),
    ],
    ...(scope === "GLOBAL" ? { tenantId: null } : {}),
    ...(scope === "TENANT" ? { tenantId: { not: null } } : {}),
    ...(tenantId ? { tenantId } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(skillId ? { contentSkills: { some: { skillId } } } : {}),
    ...(authorId ? { createdById: authorId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.content.findMany({
      where,
      select: CONTENT_LIST_SELECT,
      orderBy: { [sort]: sortDirection },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.content.count({ where }),
  ]);

  const items = rows.map(toContentListItem);
  await attachLastActions(items);

  return {
    items,
    total,
    page,
    pageSize,
  };
}

export async function listContentAuthors(): Promise<ContentAuthorItem[]> {
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      platformRole: { not: null },
      createdContents: { some: { deletedAt: null } },
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
}

export async function getContent(id: string): Promise<ContentDetail> {
  const row = await findContent(id);
  if (!row) {
    throw notFoundError("İçerik bulunamadı");
  }
  return toContentDetail(row);
}

/**
 * Returns lifecycle metadata only. Bodies, stems, options and answers are
 * intentionally never included in the admin audit response.
 */
export async function listContentAudit(contentId: string): Promise<ContentAuditEntry[]> {
  if (!(await findContent(contentId))) {
    throw notFoundError("İçerik bulunamadı");
  }

  const versions = await prisma.contentVersion.findMany({
    where: { contentId },
    select: { id: true, version: true },
  });
  const versionNumbers = new Map(versions.map((version) => [version.id, version.version]));
  const rows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "CONTENT", entityId: contentId },
        { entityType: "CONTENT_VERSION", entityId: { in: [...versionNumbers.keys()] } },
      ],
    },
    select: {
      action: true,
      entityType: true,
      entityId: true,
      before: true,
      after: true,
      createdAt: true,
      actor: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => toContentAuditEntry(row, versionNumbers));
}

export async function createContent(
  input: CreateContentInput,
  actor: ContentMutationActor,
): Promise<ContentDetail> {
  assertCanCreateDraft(actor);
  const tenantId = input.tenantId ?? null;
  if (input.status !== undefined && input.status !== "DRAFT") {
    throw validationError("Yeni içerik yalnızca DRAFT durumunda oluşturulabilir");
  }

  const created = await withTenantContext(actor, async (tx) => {
    if (tenantId !== null) {
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!tenant) {
        throw notFoundError("Kurum bulunamadı");
      }
    }

    const row = await tx.content.create({
      data: {
        tenantId,
        type: input.type,
        title: input.title,
        difficulty: input.difficulty,
        status: "DRAFT",
        createdById: actor.userId,
        metadata: toMetadataInput(input.metadata),
      },
      select: { id: true },
    });
    await writeLifecycleAudit(
      tx,
      buildCreatedAuditEntry({
        tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT",
        entityId: row.id,
        status: "DRAFT",
      }),
    );
    return row;
  });
  return getContent(created.id);
}

export async function updateContent(
  id: string,
  input: UpdateContentInput,
  actor: ContentMutationActor,
): Promise<ContentDetail> {
  await withTenantContext(actor, async (tx) => {
    const existing = await tx.content.findFirst({
      where: { id, deletedAt: null, OR: [{ tenantId: null }, { tenant: { deletedAt: null } }] },
      select: { id: true, tenantId: true, status: true, createdById: true },
    });
    if (!existing) throw notFoundError("İçerik bulunamadı");
    if (existing.status !== "DRAFT") {
      throw validationError("Yalnızca taslak içerik düzenlenebilir; yeni sürüm oluşturulmalı");
    }
    assertCanEditDraft(actor, existing.createdById);

    const data: Prisma.ContentUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.difficulty !== undefined) data.difficulty = input.difficulty;
    if (input.metadata !== undefined) data.metadata = toMetadataInput(input.metadata);
    if (Object.keys(data).length === 0) return;
    await tx.content.update({ where: { id }, data });
    await writeLifecycleAudit(
      tx,
      buildLifecycleAuditEntry({
        tenantId: existing.tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT",
        entityId: id,
        from: existing.status,
        to: existing.status,
      }),
    );
  });
  return getContent(id);
}

export async function updateContentStatus(
  id: string,
  input: UpdateContentStatusInput,
  actor: ContentMutationActor,
): Promise<ContentDetail> {
  await withTenantContext(actor, async (tx) => {
    const row = await tx.content.findFirst({
      where: { id, deletedAt: null, OR: [{ tenantId: null }, { tenant: { deletedAt: null } }] },
      select: { id: true, tenantId: true, status: true, createdById: true },
    });
    if (!row) throw notFoundError("İçerik bulunamadı");
    if (input.status === row.status) return;

    assertLifecycleTransition("CONTENT", row.status, input.status);
    switch (input.status) {
      case "REVIEW":
        assertCanSubmitForReview(actor);
        assertCanEditDraft(actor, row.createdById);
        break;
      case "APPROVED":
        assertCanApprove({
          actorRole: actor.platformRole,
          actorUserId: actor.userId,
          createdById: row.createdById,
        });
        break;
      case "PUBLISHED":
        assertCanPublish({ actorRole: actor.platformRole, status: row.status });
        if (
          !(await tx.contentVersion.findFirst({
            where: { contentId: id, status: "PUBLISHED" },
            select: { id: true },
          }))
        ) {
          throw validationError("Yayınlanmış bir sürümü olmayan içerik yayınlanamaz");
        }
        break;
      case "RETIRED":
        assertCanRetire({ actorRole: actor.platformRole, status: row.status });
        break;
      case "ARCHIVED":
        if (row.status === "DRAFT") assertCanEditDraft(actor, row.createdById);
        else assertCanRetire({ actorRole: actor.platformRole, status: row.status });
        break;
      case "DRAFT":
        assertCanEditDraft(actor, row.createdById);
        break;
    }

    await tx.content.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.status === "RETIRED" ? { retiredAt: new Date() } : {}),
      },
    });
    await writeLifecycleAudit(
      tx,
      buildLifecycleAuditEntry({
        tenantId: row.tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT",
        entityId: id,
        from: row.status,
        to: input.status,
      }),
    );
  });
  return getContent(id);
}

export async function softDeleteContent(
  id: string,
  actor: ContentMutationActor,
): Promise<{ id: string; deletedAt: Date }> {
  return withTenantContext(actor, async (tx) => {
    const content = await tx.content.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, tenantId: true, status: true, createdById: true },
    });
    if (!content) throw notFoundError("İçerik bulunamadı");
    if (content.status === "DRAFT") assertCanEditDraft(actor, content.createdById);
    else assertCanArchive({ actorRole: actor.platformRole, status: content.status });

    const deletedAt = new Date();
    const updated = await tx.content.update({
      where: { id },
      data: { deletedAt, status: "ARCHIVED" },
      select: { id: true, deletedAt: true },
    });
    if (updated.deletedAt === null) throw new Error("softDeleteContent: deletedAt set edilemedi");
    await writeLifecycleAudit(
      tx,
      buildDeletedAuditEntry({
        tenantId: content.tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT",
        entityId: id,
      }),
    );
    return { id: updated.id, deletedAt: updated.deletedAt };
  });
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
  actor: ContentMutationActor,
): Promise<ContentVersionDetail> {
  const created = await withTenantContext(actor, async (tx) => {
    const content = await tx.content.findFirst({
      where: { id: contentId, deletedAt: null },
      select: { id: true, title: true, tenantId: true, status: true, createdById: true },
    });
    if (!content) throw notFoundError("İçerik bulunamadı");
    if (content.status === "RETIRED" || content.status === "ARCHIVED") {
      throw validationError("Emekli/arşivlenmiş içerik için yeni sürüm oluşturulamaz");
    }
    assertCanEditDraft(actor, content.createdById);

    const last = await tx.contentVersion.findFirst({
      where: { contentId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (last?.version ?? 0) + 1;
    const row = await tx.contentVersion.create({
      data: {
        contentId,
        version: nextVersion,
        title: input.title ?? content.title,
        body: input.body,
        wordCount: computeWordCount(input.body),
        license: input.license ?? null,
        changelog: input.changelog ?? null,
        status: "DRAFT",
        createdById: actor.userId,
      },
      select: { id: true },
    });
    await writeLifecycleAudit(
      tx,
      buildVersionCreatedAuditEntry({
        tenantId: content.tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT_VERSION",
        entityId: row.id,
        version: nextVersion,
      }),
    );
    return row;
  });
  return getContentVersion(created.id);
}

export async function updateContentVersion(
  id: string,
  input: UpdateContentVersionInput,
  actor: ContentMutationActor,
): Promise<ContentVersionDetail> {
  await withTenantContext(actor, async (tx) => {
    const existing = await tx.contentVersion.findUnique({
      where: { id },
      select: {
        id: true,
        contentId: true,
        status: true,
        createdById: true,
        content: { select: { tenantId: true } },
      },
    });
    if (!existing) throw notFoundError("İçerik sürümü bulunamadı");
    if (existing.status !== "DRAFT") {
      throw validationError("Yalnızca taslak sürüm düzenlenebilir. Yeni sürüm oluşturulmalı.");
    }
    assertCanEditDraft(actor, existing.createdById);

    const data: Prisma.ContentVersionUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.body !== undefined) {
      data.body = input.body;
      data.wordCount = computeWordCount(input.body);
    }
    if (input.license !== undefined) data.license = input.license;
    if (input.changelog !== undefined) data.changelog = input.changelog;
    if (Object.keys(data).length === 0) return;
    await tx.contentVersion.update({ where: { id }, data });
    await writeLifecycleAudit(
      tx,
      buildLifecycleAuditEntry({
        tenantId: existing.content.tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT_VERSION",
        entityId: id,
        from: existing.status,
        to: existing.status,
      }),
    );
  });
  return getContentVersion(id);
}

export async function reviewContentVersion(
  id: string,
  actor: ContentMutationActor,
): Promise<ContentVersionDetail> {
  await withTenantContext(actor, async (tx) => {
    const existing = await tx.contentVersion.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        createdById: true,
        content: { select: { tenantId: true } },
      },
    });
    if (!existing) throw notFoundError("İçerik sürümü bulunamadı");
    if (existing.status !== "DRAFT") {
      throw validationError("Yalnızca taslak sürüm incelemeye alınabilir");
    }
    assertCanSubmitForReview(actor);
    assertCanEditDraft(actor, existing.createdById);
    await tx.contentVersion.update({
      where: { id },
      data: { status: "REVIEW", reviewedById: actor.userId, reviewedAt: new Date() },
    });
    await writeLifecycleAudit(
      tx,
      buildLifecycleAuditEntry({
        tenantId: existing.content.tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT_VERSION",
        entityId: id,
        from: existing.status,
        to: "REVIEW",
      }),
    );
  });
  return getContentVersion(id);
}

export async function approveContentVersion(
  id: string,
  actor: ContentMutationActor,
): Promise<ContentVersionDetail> {
  await withTenantContext(actor, async (tx) => {
    const existing = await tx.contentVersion.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        createdById: true,
        content: { select: { tenantId: true } },
      },
    });
    if (!existing) throw notFoundError("İçerik sürümü bulunamadı");
    if (existing.status !== "REVIEW") {
      throw validationError("Yalnızca incelemedeki sürüm onaylanabilir");
    }
    assertCanApprove({
      actorRole: actor.platformRole,
      actorUserId: actor.userId,
      createdById: existing.createdById,
    });
    await tx.contentVersion.update({
      where: { id },
      data: { status: "APPROVED", approvedById: actor.userId, approvedAt: new Date() },
    });
    await writeLifecycleAudit(
      tx,
      buildLifecycleAuditEntry({
        tenantId: existing.content.tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT_VERSION",
        entityId: id,
        from: existing.status,
        to: "APPROVED",
      }),
    );
  });
  return getContentVersion(id);
}

export async function publishContentVersion(
  id: string,
  actor: ContentMutationActor,
): Promise<ContentVersionDetail> {
  const result = await withTenantContext(actor, async (tx) => {
    const existing = await tx.contentVersion.findUnique({
      where: { id },
      select: {
        id: true,
        contentId: true,
        status: true,
        content: { select: { id: true, tenantId: true, status: true } },
      },
    });
    if (!existing) throw notFoundError("İçerik sürümü bulunamadı");
    if (existing.status === "PUBLISHED") throw validationError("Sürüm zaten yayınlanmış");
    assertCanPublish({ actorRole: actor.platformRole, status: existing.status });
    await tx.contentVersion.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await tx.content.update({
      where: { id: existing.contentId },
      data: { currentVersionId: id, status: "PUBLISHED" },
    });
    await writeLifecycleAudit(
      tx,
      buildLifecycleAuditEntry({
        tenantId: existing.content.tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT_VERSION",
        entityId: id,
        from: existing.status,
        to: "PUBLISHED",
      }),
    );
    await writeLifecycleAudit(
      tx,
      buildLifecycleAuditEntry({
        tenantId: existing.content.tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT",
        entityId: existing.contentId,
        from: existing.content.status,
        to: "PUBLISHED",
      }),
    );
    return { id };
  });
  return result ? getContentVersion(result.id) : getContentVersion(id);
}

export async function retireContentVersion(
  id: string,
  actor: ContentMutationActor,
): Promise<ContentVersionDetail> {
  await withTenantContext(actor, async (tx) => {
    const existing = await tx.contentVersion.findUnique({
      where: { id },
      select: {
        id: true,
        contentId: true,
        status: true,
        content: { select: { tenantId: true, status: true, currentVersionId: true } },
      },
    });
    if (!existing) throw notFoundError("İçerik sürümü bulunamadı");
    assertCanRetire({ actorRole: actor.platformRole, status: existing.status });
    await tx.contentVersion.update({
      where: { id },
      data: { status: "RETIRED", retiredAt: new Date() },
    });
    if (existing.content.currentVersionId === id) {
      await tx.content.update({
        where: { id: existing.contentId },
        data: { status: "RETIRED", retiredAt: new Date() },
      });
    }
    await writeLifecycleAudit(
      tx,
      buildLifecycleAuditEntry({
        tenantId: existing.content.tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT_VERSION",
        entityId: id,
        from: existing.status,
        to: "RETIRED",
      }),
    );
  });
  return getContentVersion(id);
}

// ---------- Beceri bağlantıları ----------

export async function updateContentSkills(
  contentId: string,
  input: UpdateContentSkillsInput,
  actor: ContentMutationActor,
): Promise<ContentDetail> {
  const skillIds = [...new Set(input.skillIds)];
  await withTenantContext(actor, async (tx) => {
    const content = await tx.content.findFirst({
      where: { id: contentId, deletedAt: null },
      select: { id: true, tenantId: true, status: true, createdById: true },
    });
    if (!content) throw notFoundError("İçerik bulunamadı");
    if (content.status !== "DRAFT") {
      throw validationError("Yalnızca taslak içeriğin becerileri düzenlenebilir");
    }
    assertCanEditDraft(actor, content.createdById);
    if (skillIds.length > 0) {
      const found = await tx.skill.findMany({
        where: { id: { in: skillIds } },
        select: { id: true },
      });
      if (found.length !== skillIds.length) {
        throw validationError("Beceri kataloğunda bulunamayan beceri kimliği var");
      }
    }

    await tx.contentSkill.deleteMany({ where: { contentId } });
    if (skillIds.length > 0) {
      await tx.contentSkill.createMany({
        data: skillIds.map((skillId) => ({ contentId, skillId })),
      });
    }
    await writeLifecycleAudit(
      tx,
      buildLifecycleAuditEntry({
        tenantId: content.tenantId,
        actorUserId: actor.userId,
        entityType: "CONTENT",
        entityId: contentId,
        from: content.status,
        to: content.status,
      }),
    );
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

async function attachLastActions(items: ContentListItem[]): Promise<void> {
  if (items.length === 0) return;
  const contentIds = items.map((item) => item.id);
  const versionRows = await prisma.contentVersion.findMany({
    where: { contentId: { in: contentIds } },
    select: { id: true, contentId: true },
  });
  const entityToContent = new Map<string, string>(contentIds.map((id) => [id, id]));
  for (const version of versionRows) entityToContent.set(version.id, version.contentId);

  const rows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "CONTENT", entityId: { in: contentIds } },
        { entityType: "CONTENT_VERSION", entityId: { in: versionRows.map((row) => row.id) } },
      ],
    },
    select: {
      action: true,
      entityType: true,
      entityId: true,
      before: true,
      after: true,
      createdAt: true,
      actor: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const lastByContent = new Map<string, ContentAuditEntry>();
  for (const row of rows) {
    const contentId = entityToContent.get(row.entityId);
    if (contentId && !lastByContent.has(contentId)) {
      lastByContent.set(contentId, toContentAuditEntry(row, new Map()));
    }
  }
  for (const item of items) item.lastAction = lastByContent.get(item.id) ?? null;
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Prisma.JsonValue>;
}

function toMetadataInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function jsonStatus(value: Prisma.JsonValue | null): string | null {
  const object = jsonObject(value);
  return typeof object?.status === "string" ? object.status : null;
}

function toContentAuditEntry(
  row: {
    action: string;
    entityType: string;
    entityId: string;
    before: Prisma.JsonValue | null;
    after: Prisma.JsonValue | null;
    createdAt: Date;
    actor: { displayName: string } | null;
  },
  versionNumbers: Map<string, number>,
): ContentAuditEntry {
  const after = jsonObject(row.after);
  return {
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    version:
      versionNumbers.get(row.entityId) ??
      (typeof after?.version === "number" ? after.version : null),
    fromStatus: jsonStatus(row.before),
    toStatus: jsonStatus(row.after),
    actorName: row.actor?.displayName ?? null,
    createdAt: row.createdAt,
  };
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
  retiredAt: Date | null;
  metadata: Prisma.JsonValue | null;
  createdBy: { displayName: string } | null;
  tenant: { id: string; name: string; deletedAt: Date | null } | null;
  currentVersion: { version: number; status: string; publishedAt: Date | null } | null;
  contentSkills: Array<{ skill: { code: string; name: string } }>;
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
    retiredAt: row.retiredAt,
    metadataKeys: Object.keys(jsonObject(row.metadata) ?? {}).sort(),
    skillNames: row.contentSkills.map(({ skill }) => `${skill.name} (${skill.code})`),
    createdByName: row.createdBy?.displayName ?? null,
    publishedAt: row.currentVersion?.publishedAt ?? null,
    lastAction: null,
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
  retiredAt: Date | null;
  metadata: Prisma.JsonValue | null;
  createdBy: { displayName: string } | null;
  tenant: { id: string; name: string; deletedAt: Date | null } | null;
  currentVersion: {
    id: string;
    version: number;
    title: string;
    status: VersionStatus;
    publishedAt: Date | null;
    retiredAt: Date | null;
    wordCount: number;
    createdAt: Date;
    createdBy: { displayName: string } | null;
    reviewedBy: { displayName: string } | null;
    reviewedAt: Date | null;
    approvedBy: { displayName: string } | null;
    approvedAt: Date | null;
  } | null;
  _count: { versions: number; questions: number; contentSkills: number };
  contentSkills: Array<{ skill: { id: string; code: string; name: string; category: string } }>;
}): ContentDetail {
  const item = toContentListItem(row);
  return {
    ...item,
    publishedAt: row.currentVersion?.publishedAt ?? null,
    currentVersion: row.currentVersion
      ? {
          id: row.currentVersion.id,
          version: row.currentVersion.version,
          title: row.currentVersion.title,
          status: row.currentVersion.status,
          publishedAt: row.currentVersion.publishedAt,
          retiredAt: row.currentVersion.retiredAt,
          wordCount: row.currentVersion.wordCount,
          createdAt: row.currentVersion.createdAt,
          createdByName: row.currentVersion.createdBy?.displayName ?? null,
          reviewedByName: row.currentVersion.reviewedBy?.displayName ?? null,
          reviewedAt: row.currentVersion.reviewedAt,
          approvedByName: row.currentVersion.approvedBy?.displayName ?? null,
          approvedAt: row.currentVersion.approvedAt,
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
  retiredAt: Date | null;
  wordCount: number;
  createdAt: Date;
  createdBy: { displayName: string } | null;
  reviewedBy: { displayName: string } | null;
  reviewedAt: Date | null;
  approvedBy: { displayName: string } | null;
  approvedAt: Date | null;
}): ContentVersionSummary {
  return {
    id: row.id,
    contentId: row.contentId,
    version: row.version,
    title: row.title,
    status: row.status,
    publishedAt: row.publishedAt,
    retiredAt: row.retiredAt,
    wordCount: row.wordCount,
    createdAt: row.createdAt,
    createdByName: row.createdBy?.displayName ?? null,
    reviewedByName: row.reviewedBy?.displayName ?? null,
    reviewedAt: row.reviewedAt,
    approvedByName: row.approvedBy?.displayName ?? null,
    approvedAt: row.approvedAt,
  };
}

function toContentVersionDetail(row: {
  id: string;
  contentId: string;
  version: number;
  title: string;
  status: VersionStatus;
  publishedAt: Date | null;
  retiredAt: Date | null;
  wordCount: number;
  createdAt: Date;
  createdBy: { displayName: string } | null;
  reviewedBy: { displayName: string } | null;
  reviewedAt: Date | null;
  approvedBy: { displayName: string } | null;
  approvedAt: Date | null;
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
