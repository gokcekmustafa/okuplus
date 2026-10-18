import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { conflictError } from "../../lib/errors.js";
import { withTenantContext } from "../tenant/index.js";

export type DraftQuestionFields = {
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  hint: string | null;
  explanation: string;
  sourceReference: string;
};

export type DraftQuestionIdentity = {
  routeFamily: "A" | "B" | "C" | "D";
  sequence: number;
  stationKey: string;
  questionKey: string;
};

export type DraftQuestionRevision = {
  fields: DraftQuestionFields;
  versionId: string;
  revision: number;
  sourceFingerprint: string;
};

export type DraftRevisionActor = { userId: string };

export interface DraftQuestionRevisionStore {
  listLatest(
    identities: DraftQuestionIdentity[],
    actor: DraftRevisionActor,
  ): Promise<Map<string, DraftQuestionRevision>>;
  append(input: {
    identity: DraftQuestionIdentity;
    expectedVersionId: string;
    sourceVersionId: string;
    sourceFingerprint: string;
    sourceFields: DraftQuestionFields;
    fields: DraftQuestionFields;
    actor: DraftRevisionActor;
  }): Promise<DraftQuestionRevision>;
}

const ENTITY_TYPE = "CURRICULUM_DRAFT_QUESTION";
const revisionSchema = {
  safeParse(value: unknown): { success: true; data: DraftQuestionRevision } | { success: false } {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { success: false };
    const row = value as Record<string, unknown>;
    const fields = row.fields;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return { success: false };
    const content = fields as Record<string, unknown>;
    if (
      typeof row.versionId !== "string" ||
      typeof row.revision !== "number" ||
      typeof row.sourceFingerprint !== "string" ||
      typeof content.prompt !== "string" ||
      !Array.isArray(content.options) ||
      typeof content.correctOptionId !== "string" ||
      (content.hint !== null && typeof content.hint !== "string") ||
      typeof content.explanation !== "string" ||
      typeof content.sourceReference !== "string"
    ) {
      return { success: false };
    }
    const options = content.options as unknown[];
    if (
      options.length !== 4 ||
      options.some(
        (option) =>
          !option ||
          typeof option !== "object" ||
          typeof (option as Record<string, unknown>).id !== "string" ||
          typeof (option as Record<string, unknown>).text !== "string",
      )
    ) {
      return { success: false };
    }
    return {
      success: true,
      data: {
        versionId: row.versionId,
        revision: row.revision,
        sourceFingerprint: row.sourceFingerprint,
        fields: {
          prompt: content.prompt,
          options: options as DraftQuestionFields["options"],
          correctOptionId: content.correctOptionId,
          hint: content.hint as string | null,
          explanation: content.explanation,
          sourceReference: content.sourceReference,
        },
      },
    };
  },
};

export function draftQuestionEntityId(identity: DraftQuestionIdentity): string {
  return JSON.stringify([
    identity.routeFamily,
    identity.sequence,
    identity.stationKey,
    identity.questionKey,
  ]);
}

export function draftQuestionSourceFingerprint(fields: DraftQuestionFields): string {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

export function draftQuestionSourceVersionId(
  identity: DraftQuestionIdentity,
  fields: DraftQuestionFields,
): string {
  const fingerprint = draftQuestionSourceFingerprint(fields);
  return `source:${createHash("sha256")
    .update(`${draftQuestionEntityId(identity)}:${fingerprint}`)
    .digest("hex")}`;
}

function latestFromRows(
  rows: Array<{ entityId: string; after: Prisma.JsonValue }>,
): Map<string, DraftQuestionRevision> {
  const latest = new Map<string, DraftQuestionRevision>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.entityId)) continue;
    seen.add(row.entityId);
    const parsed = revisionSchema.safeParse(row.after);
    if (!parsed.success) throw conflictError("Taslak sürüm geçmişi okunamadı; kayıt incelenmeli.");
    latest.set(row.entityId, parsed.data);
  }
  return latest;
}

export const prismaDraftQuestionRevisionStore: DraftQuestionRevisionStore = {
  async listLatest(identities, actor) {
    if (identities.length === 0) return new Map();
    const entityIds = identities.map(draftQuestionEntityId);
    return withTenantContext(
      { userId: actor.userId, tenantId: null, platformRole: "SUPER_ADMIN" },
      async (tx) => {
        const rows = await tx.auditLog.findMany({
          where: { entityType: ENTITY_TYPE, entityId: { in: entityIds } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { entityId: true, after: true },
        });
        return latestFromRows(rows as Array<{ entityId: string; after: Prisma.JsonValue }>);
      },
    );
  },

  async append(input) {
    const entityId = draftQuestionEntityId(input.identity);
    return withTenantContext(
      { userId: input.actor.userId, tenantId: null, platformRole: "SUPER_ADMIN" },
      async (tx) => {
        // Serialize edits for a question so two tabs cannot both overwrite the same revision.
        const lockRows = await tx.$queryRaw<Array<{ locked: number }>>`
          WITH lock_result AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(hashtextextended(${entityId}, 0))
          )
          SELECT 1::int AS locked FROM lock_result
        `;
        if (lockRows.length !== 1) throw conflictError("Taslak düzenleme kilidi alınamadı.");
        const latestRow = await tx.auditLog.findFirst({
          where: { entityType: ENTITY_TYPE, entityId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, after: true, createdAt: true },
        });
        const latest = latestRow ? revisionSchema.safeParse(latestRow.after) : null;
        if (latest && !latest.success)
          throw conflictError("Taslak sürümü okunamadı; yeniden yükleyin.");
        const current = latest?.success ? latest.data : null;
        const currentVersionId = current?.versionId ?? input.sourceVersionId;
        if (currentVersionId !== input.expectedVersionId) {
          throw conflictError(
            "Taslak başka bir sekmede değiştirildi. Güncel sürümü yeniden yükleyin.",
          );
        }
        if (current && current.sourceFingerprint !== input.sourceFingerprint) {
          throw conflictError("Kaynak taslak bu sırada değişti. En güncel taslağı yeniden açın.");
        }

        const id = randomUUID();
        const revision: DraftQuestionRevision = {
          fields: input.fields,
          versionId: `edit:${id}`,
          revision: (current?.revision ?? 0) + 1,
          sourceFingerprint: input.sourceFingerprint,
        };
        await tx.auditLog.create({
          data: {
            id,
            tenantId: null,
            actorUserId: input.actor.userId,
            action: "UPDATE",
            entityType: ENTITY_TYPE,
            entityId,
            before: (current?.fields ?? input.sourceFields) as Prisma.InputJsonValue,
            after: revision as unknown as Prisma.InputJsonValue,
            createdAt: new Date(Math.max(Date.now(), (latestRow?.createdAt.getTime() ?? 0) + 1)),
          },
        });
        return revision;
      },
    );
  },
};
