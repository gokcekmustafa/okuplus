import { Prisma, type PrismaClient } from "@prisma/client";
import { conflictError } from "../lib/errors.js";
import {
  CANONICAL_PLACEMENT_IDENTITY,
  type CanonicalPlacementCandidate,
  type CanonicalPlacementIdentity,
} from "../modules/assessments/canonical-selector.js";

export type CanonicalPlacementCutoverCandidate = CanonicalPlacementCandidate;

export type CanonicalPlacementCutoverPlan = {
  action: "CUTOVER" | "NOOP" | "CONFLICT";
  targetAssessmentId: string;
  deactivateAssessmentIds: string[];
  conflicts: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCanonicalManifest(value: unknown, identity: CanonicalPlacementIdentity): boolean {
  return (
    isRecord(value) &&
    value.canonicalManifestId === identity.manifestId &&
    typeof value.canonicalManifestVersion === "string"
  );
}

function hasExactCanonicalVersion(value: unknown, identity: CanonicalPlacementIdentity): boolean {
  return isRecord(value) && value.canonicalManifestVersion === identity.manifestVersion;
}

function isEligibleCandidate(
  candidate: CanonicalPlacementCutoverCandidate,
  identity: CanonicalPlacementIdentity,
): boolean {
  return (
    candidate.tenantId === null &&
    candidate.type === "PLACEMENT" &&
    candidate.status === "PUBLISHED" &&
    candidate.deletedAt === null &&
    hasCanonicalManifest(candidate.config, identity)
  );
}

export function planCanonicalPlacementCutover(
  candidates: readonly CanonicalPlacementCutoverCandidate[],
  targetAssessmentId: string,
  identity: CanonicalPlacementIdentity = CANONICAL_PLACEMENT_IDENTITY,
): CanonicalPlacementCutoverPlan {
  const eligible = candidates.filter((candidate) => isEligibleCandidate(candidate, identity));
  const target = eligible.find((candidate) => candidate.id === targetAssessmentId);
  const conflicts: string[] = [];

  if (!target) {
    return {
      action: "CONFLICT",
      targetAssessmentId,
      deactivateAssessmentIds: [],
      conflicts: ["cutover hedefi Published global canonical placement olarak bulunamadı"],
    };
  }
  if (!hasExactCanonicalVersion(target.config, identity)) {
    return {
      action: "CONFLICT",
      targetAssessmentId,
      deactivateAssessmentIds: [],
      conflicts: ["cutover hedefinin canonical manifest sürümü eşleşmiyor"],
    };
  }

  const activeIds = eligible
    .filter((candidate) => isRecord(candidate.config) && candidate.config.canonicalActive === true)
    .map((candidate) => candidate.id);
  const deactivateAssessmentIds = activeIds.filter((id) => id !== targetAssessmentId);

  if (activeIds.length === 1 && activeIds[0] === targetAssessmentId) {
    return {
      action: "NOOP",
      targetAssessmentId,
      deactivateAssessmentIds: [],
      conflicts,
    };
  }

  return {
    action: "CUTOVER",
    targetAssessmentId,
    deactivateAssessmentIds,
    conflicts,
  };
}

export async function readCanonicalPlacementCutoverCandidates(
  client: PrismaClient | Prisma.TransactionClient,
  identity: CanonicalPlacementIdentity,
): Promise<CanonicalPlacementCutoverCandidate[]> {
  const rows = await client.assessment.findMany({
    where: {
      deletedAt: null,
      status: "PUBLISHED",
      type: "PLACEMENT",
      tenantId: null,
    },
    select: {
      id: true,
      tenantId: true,
      type: true,
      status: true,
      deletedAt: true,
      config: true,
    },
  });
  return rows.filter((candidate) => isEligibleCandidate(candidate, identity));
}

async function applyCanonicalPlacementCutover(
  client: PrismaClient,
  targetAssessmentId: string,
  identity: CanonicalPlacementIdentity,
): Promise<CanonicalPlacementCutoverPlan> {
  return client.$transaction(
    async (tx) => {
      let candidates = await readCanonicalPlacementCutoverCandidates(tx, identity);
      const ids = candidates.map((candidate) => candidate.id);
      if (ids.length > 0) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Assessment" WHERE "id" IN (${Prisma.join(ids)}) FOR UPDATE`,
        );
        candidates = await readCanonicalPlacementCutoverCandidates(tx, identity);
      }

      const plan = planCanonicalPlacementCutover(candidates, targetAssessmentId, identity);
      if (plan.action === "CONFLICT") {
        throw conflictError(plan.conflicts.join("; "));
      }
      if (plan.action === "NOOP") return plan;

      for (const candidate of candidates) {
        const currentConfig = isRecord(candidate.config) ? candidate.config : {};
        await tx.assessment.update({
          where: { id: candidate.id },
          data: {
            config: {
              ...currentConfig,
              canonicalActive: candidate.id === targetAssessmentId,
            } as Prisma.InputJsonValue,
          },
        });
      }
      return plan;
    },
    { maxWait: 3_000, timeout: 30_000 },
  );
}

export async function cutoverCanonicalPlacement(
  client: PrismaClient,
  targetAssessmentId: string,
  identity: CanonicalPlacementIdentity = CANONICAL_PLACEMENT_IDENTITY,
): Promise<CanonicalPlacementCutoverPlan> {
  return applyCanonicalPlacementCutover(client, targetAssessmentId, identity);
}

export async function rollbackCanonicalPlacement(
  client: PrismaClient,
  previousAssessmentId: string,
  identity: CanonicalPlacementIdentity,
): Promise<CanonicalPlacementCutoverPlan> {
  return applyCanonicalPlacementCutover(client, previousAssessmentId, identity);
}
