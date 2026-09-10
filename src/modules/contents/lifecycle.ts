import type { PlatformRole } from "@prisma/client";
import { ApiError } from "../../lib/errors.js";

/**
 * Content/question lifecycle policy.
 *
 * The existing relational models keep the stable entity and its immutable
 * versions separate. This module contains the shared, DB-independent policy
 * so content and question workflows cannot drift apart.
 */
export const CONTENT_LIFECYCLE_STATUSES = [
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
  "RETIRED",
  "ARCHIVED",
] as const;

export type ContentLifecycleStatus = (typeof CONTENT_LIFECYCLE_STATUSES)[number];
export type LifecycleEntity = "CONTENT" | "CONTENT_VERSION" | "QUESTION" | "QUESTION_VERSION";

export interface ContentMutationActor {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}

const FORWARD_TRANSITIONS: Readonly<
  Record<ContentLifecycleStatus, readonly ContentLifecycleStatus[]>
> = {
  DRAFT: ["REVIEW", "ARCHIVED"],
  REVIEW: ["APPROVED", "DRAFT", "ARCHIVED"],
  APPROVED: ["PUBLISHED", "REVIEW", "ARCHIVED"],
  PUBLISHED: ["RETIRED", "ARCHIVED"],
  RETIRED: [],
  ARCHIVED: ["DRAFT"],
};

export class LifecyclePolicyError extends ApiError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
    this.name = "LifecyclePolicyError";
  }
}

export function canTransitionLifecycle(
  from: ContentLifecycleStatus,
  to: ContentLifecycleStatus,
): boolean {
  return from === to || FORWARD_TRANSITIONS[from].includes(to);
}

export function assertLifecycleTransition(
  entity: LifecycleEntity,
  from: ContentLifecycleStatus,
  to: ContentLifecycleStatus,
): void {
  if (!canTransitionLifecycle(from, to)) {
    throw new LifecyclePolicyError(`${entity} için ${from} → ${to} geçişi geçersiz`);
  }
}

function assertPlatformRole(actor: ContentMutationActor, roles: readonly PlatformRole[]): void {
  if (!actor.platformRole || !roles.includes(actor.platformRole)) {
    throw new LifecyclePolicyError("Bu lifecycle işlemi için yetkiniz yok");
  }
}

export function assertCanCreateDraft(actor: ContentMutationActor): void {
  assertPlatformRole(actor, ["SUPER_ADMIN", "CONTENT_EDITOR"]);
}

export function assertCanEditDraft(actor: ContentMutationActor, createdById: string | null): void {
  if (actor.platformRole === "SUPER_ADMIN") return;
  assertPlatformRole(actor, ["CONTENT_EDITOR"]);
  if (createdById !== actor.userId) {
    throw new LifecyclePolicyError("İçerik yalnızca oluşturan editör tarafından düzenlenebilir");
  }
}

export function assertCanSubmitForReview(actor: ContentMutationActor): void {
  assertPlatformRole(actor, ["SUPER_ADMIN", "CONTENT_EDITOR"]);
}

export function buildCreatedAuditEntry(input: {
  tenantId: string | null;
  actorUserId: string | null;
  entityType: LifecycleEntity;
  entityId: string;
  status: ContentLifecycleStatus;
}): LifecycleAuditEntry {
  return {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: "CREATE",
    entityType: input.entityType,
    entityId: input.entityId,
    before: null,
    after: { status: input.status },
  };
}

export function assertCanApprove(input: {
  actorRole: PlatformRole | null;
  actorUserId: string;
  createdById: string | null;
}): void {
  if (input.actorRole !== "SUPER_ADMIN" && input.actorRole !== "CONTENT_REVIEWER") {
    throw new LifecyclePolicyError("Onay işlemi için içerik inceleme yetkisi gerekli");
  }
  if (input.createdById !== null && input.createdById === input.actorUserId) {
    throw new LifecyclePolicyError("İçeriği oluşturan kullanıcı kendi içeriğini onaylayamaz");
  }
}

export function assertCanPublish(input: {
  actorRole: PlatformRole | null;
  status: ContentLifecycleStatus;
}): void {
  if (input.actorRole !== "SUPER_ADMIN" && input.actorRole !== "CONTENT_REVIEWER") {
    throw new LifecyclePolicyError("Yayınlama işlemi için içerik yayınlama yetkisi gerekli");
  }
  if (input.status !== "APPROVED") {
    throw new LifecyclePolicyError("Yalnızca onaylanmış içerik yayınlanabilir");
  }
}

export function assertCanRetire(input: {
  actorRole: PlatformRole | null;
  status: ContentLifecycleStatus;
}): void {
  if (input.actorRole !== "SUPER_ADMIN" && input.actorRole !== "CONTENT_REVIEWER") {
    throw new LifecyclePolicyError("Arşivleme işlemi için içerik yayınlama yetkisi gerekli");
  }
  assertLifecycleTransition("CONTENT_VERSION", input.status, "RETIRED");
}

export function assertCanArchive(input: {
  actorRole: PlatformRole | null;
  status: ContentLifecycleStatus;
}): void {
  if (input.actorRole !== "SUPER_ADMIN" && input.actorRole !== "CONTENT_REVIEWER") {
    throw new LifecyclePolicyError("Arşivleme işlemi için içerik inceleme yetkisi gerekli");
  }
  assertLifecycleTransition("CONTENT", input.status, "ARCHIVED");
}

export function isSelectablePublishedStatus(status: ContentLifecycleStatus): boolean {
  return status === "PUBLISHED";
}

export type LifecycleAuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "SUBMITTED_FOR_REVIEW"
  | "APPROVED"
  | "PUBLISH"
  | "RETIRED"
  | "VERSION_CREATED";

export interface LifecycleAuditEntry {
  tenantId: string | null;
  actorUserId: string | null;
  action: LifecycleAuditAction;
  entityType: LifecycleEntity;
  entityId: string;
  before: { status: ContentLifecycleStatus } | null;
  after: { status: ContentLifecycleStatus } | { version: number };
}

export function auditActionForTransition(
  from: ContentLifecycleStatus,
  to: ContentLifecycleStatus,
): LifecycleAuditAction {
  if (from === to) return "UPDATE";
  switch (to) {
    case "REVIEW":
      return "SUBMITTED_FOR_REVIEW";
    case "APPROVED":
      return "APPROVED";
    case "PUBLISHED":
      return "PUBLISH";
    case "RETIRED":
      return "RETIRED";
    default:
      return "UPDATE";
  }
}

export function buildLifecycleAuditEntry(input: {
  tenantId: string | null;
  actorUserId: string | null;
  entityType: LifecycleEntity;
  entityId: string;
  from: ContentLifecycleStatus;
  to: ContentLifecycleStatus;
}): LifecycleAuditEntry {
  assertLifecycleTransition(input.entityType, input.from, input.to);
  return {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: auditActionForTransition(input.from, input.to),
    entityType: input.entityType,
    entityId: input.entityId,
    before: { status: input.from },
    after: { status: input.to },
  };
}

export function buildDeletedAuditEntry(input: {
  tenantId: string | null;
  actorUserId: string | null;
  entityType: LifecycleEntity;
  entityId: string;
}): LifecycleAuditEntry {
  return {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: "DELETE",
    entityType: input.entityType,
    entityId: input.entityId,
    before: null,
    after: { status: "ARCHIVED" },
  };
}

export function buildVersionCreatedAuditEntry(input: {
  tenantId: string | null;
  actorUserId: string | null;
  entityType: "CONTENT_VERSION" | "QUESTION_VERSION";
  entityId: string;
  version: number;
}): LifecycleAuditEntry {
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new LifecyclePolicyError("Sürüm numarası pozitif tam sayı olmalı");
  }
  return {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: "VERSION_CREATED",
    entityType: input.entityType,
    entityId: input.entityId,
    before: null,
    after: { version: input.version },
  };
}
