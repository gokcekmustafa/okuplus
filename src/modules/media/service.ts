/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import type { CreateMediaInput, ListMediaQuery } from "./schemas.js";

const MEDIA_SELECT = {
  id: true,
  tenantId: true,
  type: true,
  url: true,
  mimeType: true,
  width: true,
  height: true,
  durationMs: true,
  altText: true,
  caption: true,
  hash: true,
  sizeBytes: true,
  createdById: true,
  createdAt: true,
  deletedAt: true,
  tenant: { select: { id: true, name: true } },
} satisfies Prisma.QuestionMediaSelect;

export async function listMedia(query: ListMediaQuery) {
  const { tenantId, type, search, page, pageSize } = query;
  const where: Prisma.QuestionMediaWhereInput = {
    deletedAt: null,
    ...(tenantId ? { tenantId } : {}),
    ...(type ? { type: type as any } : {}),
    ...(search
      ? {
          OR: [
            { url: { contains: search, mode: "insensitive" } },
            { altText: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.questionMedia.findMany({
      where,
      select: MEDIA_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.questionMedia.count({ where }),
  ]);
  return { items: rows, total, page, pageSize };
}

export async function getMedia(id: string) {
  const row = await prisma.questionMedia.findFirst({
    where: { id, deletedAt: null },
    select: MEDIA_SELECT,
  });
  if (!row) throw notFoundError("Medya bulunamadı");
  return row;
}

export async function createMedia(input: CreateMediaInput, actorId?: string) {
  const tenantId = input.tenantId ?? null;
  if (tenantId !== null) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) throw notFoundError("Kurum bulunamadı");
  }
  // hash deduplication: same tenant+hash reuse
  const existing = await prisma.questionMedia.findFirst({
    where: { hash: input.hash, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (existing) throw conflictError("Aynı hash ile medya zaten mevcut");

  const created = await prisma.questionMedia.create({
    data: {
      tenantId,
      type: input.type as any,
      url: input.url,
      mimeType: input.mimeType,
      width: input.width ?? null,
      height: input.height ?? null,
      durationMs: input.durationMs ?? null,
      altText: input.altText ?? null,
      caption: input.caption ?? null,
      hash: input.hash,
      sizeBytes: input.sizeBytes,
      ...(actorId ? { createdById: actorId } : {}),
    },
    select: { id: true },
  });
  return getMedia(created.id);
}

export async function deleteMedia(id: string) {
  const existing = await prisma.questionMedia.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw notFoundError("Medya bulunamadı");
  // Check if still attached to any version
  const attached = await prisma.questionVersionMedia.findFirst({
    where: { mediaId: id },
    select: { questionVersionId: true },
  });
  if (attached) throw conflictError("Medya bir soru sürümüne bağlı, önce bağlantıyı kaldırın");
  await prisma.questionMedia.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id, deletedAt: new Date() };
}

export async function listQuestionVersionMedia(questionVersionId: string) {
  const qv = await prisma.questionVersion.findUnique({
    where: { id: questionVersionId },
    select: { id: true, status: true },
  });
  if (!qv) throw notFoundError("Soru sürümü bulunamadı");
  const rows = await prisma.questionVersionMedia.findMany({
    where: { questionVersionId },
    include: { media: { select: MEDIA_SELECT } },
    orderBy: [{ role: "asc" }, { position: "asc" }],
  });
  return rows.map((r) => ({
    questionVersionId: r.questionVersionId,
    mediaId: r.mediaId,
    role: r.role,
    position: r.position,
    media: r.media,
  }));
}

export async function attachMediaToQuestionVersion(
  questionVersionId: string,
  input: { mediaId: string; role?: string; position?: number },
  actor?: { userId: string; tenantId: string | null; platformRole: string | null },
) {
  const qv = await prisma.questionVersion.findUnique({
    where: { id: questionVersionId },
    select: {
      id: true,
      status: true,
      question: { select: { content: { select: { tenantId: true } } } },
    },
  });
  if (!qv) throw notFoundError("Soru sürümü bulunamadı");
  if (qv.status === "PUBLISHED")
    throw validationError("Yayınlanmış sürüme medya bağlanamaz, yeni sürüm oluşturun");

  const media = await prisma.questionMedia.findFirst({
    where: { id: input.mediaId, deletedAt: null },
    select: { id: true, tenantId: true },
  });
  if (!media) throw notFoundError("Medya bulunamadı");

  // Tenant isolation: global media (null) can be used by anyone, tenant media must match question's content tenant
  const qTenantId = (qv.question as any).content.tenantId as string | null;
  const mTenantId = media.tenantId as string | null;
  if (mTenantId !== null && qTenantId !== null && mTenantId !== qTenantId) {
    throw validationError("Medya ve soru aynı tenant kapsamına ait olmalı");
  }
  // If actor is not SUPER_ADMIN, check tenant access (student/teacher should not attach? But we allow CONTENT_EDITOR/SUPER_ADMIN only via route guard)
  // Additional check for non-platform users
  if (actor && !actor.platformRole) {
    // For now, allow if same tenant
    if (mTenantId !== null && actor.tenantId !== null && mTenantId !== actor.tenantId)
      throw forbiddenError("Bu medyaya erişim yetkiniz yok");
  }

  const role = (input.role as any) ?? "MAIN";
  const position = input.position ?? 0;

  // Check duplicate position for same role
  const existingPos = await prisma.questionVersionMedia.findFirst({
    where: { questionVersionId, role: role as any, position },
    select: { mediaId: true },
  });
  if (existingPos)
    throw conflictError(`Aynı rol (${role}) ve pozisyon (${position}) zaten kullanılıyor`);

  // Check already attached
  const already = await prisma.questionVersionMedia.findUnique({
    where: { questionVersionId_mediaId: { questionVersionId, mediaId: input.mediaId } },
  });
  if (already) throw conflictError("Medya zaten bu sürüme bağlı");

  await prisma.questionVersionMedia.create({
    data: { questionVersionId, mediaId: input.mediaId, role: role as any, position },
  });
  return listQuestionVersionMedia(questionVersionId);
}

export async function detachMediaFromQuestionVersion(questionVersionId: string, mediaId: string) {
  const qv = await prisma.questionVersion.findUnique({
    where: { id: questionVersionId },
    select: { status: true },
  });
  if (!qv) throw notFoundError("Soru sürümü bulunamadı");
  if (qv.status === "PUBLISHED")
    throw validationError("Yayınlanmış sürümün medyası değiştirilemez");
  const existing = await prisma.questionVersionMedia.findUnique({
    where: { questionVersionId_mediaId: { questionVersionId, mediaId } },
  });
  if (!existing) throw notFoundError("Bağlantı bulunamadı");
  await prisma.questionVersionMedia.delete({
    where: { questionVersionId_mediaId: { questionVersionId, mediaId } },
  });
  return listQuestionVersionMedia(questionVersionId);
}

export async function updateMediaBinding(
  questionVersionId: string,
  mediaId: string,
  input: { role?: string; position?: number },
) {
  const qv = await prisma.questionVersion.findUnique({
    where: { id: questionVersionId },
    select: { status: true },
  });
  if (!qv) throw notFoundError("Soru sürümü bulunamadı");
  if (qv.status === "PUBLISHED")
    throw validationError("Yayınlanmış sürümün medyası değiştirilemez");
  const existing = await prisma.questionVersionMedia.findUnique({
    where: { questionVersionId_mediaId: { questionVersionId, mediaId } },
  });
  if (!existing) throw notFoundError("Bağlantı bulunamadı");
  const newRole = (input.role as any) ?? existing.role;
  const newPos = input.position ?? existing.position;
  if (newRole !== existing.role || newPos !== existing.position) {
    const dup = await prisma.questionVersionMedia.findFirst({
      where: { questionVersionId, role: newRole as any, position: newPos, NOT: { mediaId } },
    });
    if (dup)
      throw conflictError(`Aynı rol (${newRole}) ve pozisyon (${newPos}) zaten kullanılıyor`);
  }
  await prisma.questionVersionMedia.update({
    where: { questionVersionId_mediaId: { questionVersionId, mediaId } },
    data: {
      ...(input.role ? { role: input.role as any } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    },
  });
  return listQuestionVersionMedia(questionVersionId);
}
