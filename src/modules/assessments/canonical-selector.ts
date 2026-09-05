import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST } from "../../curriculum/canonical-placement-assessment.js";
import { conflictError } from "../../lib/errors.js";
import { buildPublishedPlacementAssessmentWhere } from "../onboarding/placement-visibility.js";

export const CANONICAL_PLACEMENT_IDENTITY = Object.freeze({
  manifestId: CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST.manifestId,
  manifestVersion: CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST.manifestVersion,
});

export const canonicalAssessmentConfigSchema = z
  .object({
    canonicalManifestId: z.string().trim().min(1),
    canonicalManifestVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
    canonicalActive: z.boolean(),
  })
  .passthrough();

export type CanonicalAssessmentConfig = z.infer<typeof canonicalAssessmentConfigSchema>;

export type CanonicalPlacementCandidate = {
  id: string;
  tenantId: string | null;
  type: string;
  status: string;
  deletedAt: Date | null;
  config: unknown;
};

export type CanonicalPlacementSelection<T extends CanonicalPlacementCandidate> =
  | { status: "FOUND"; assessment: T }
  | { status: "NONE"; assessment: null }
  | { status: "CONFLICT"; assessment: null; assessmentIds: string[] };

export type CanonicalPlacementIdentity = {
  manifestId: string;
  manifestVersion: string;
};

export function parseCanonicalAssessmentConfig(value: unknown): CanonicalAssessmentConfig | null {
  const parsed = canonicalAssessmentConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function buildCanonicalPlacementAssessmentWhere(
  tenantId: string | null,
  identity: CanonicalPlacementIdentity = CANONICAL_PLACEMENT_IDENTITY,
): Prisma.AssessmentWhereInput {
  return {
    ...buildPublishedPlacementAssessmentWhere(tenantId),
    AND: [
      {
        config: {
          path: ["canonicalManifestId"],
          equals: identity.manifestId,
        },
      },
      {
        config: {
          path: ["canonicalManifestVersion"],
          equals: identity.manifestVersion,
        },
      },
      {
        config: {
          path: ["canonicalActive"],
          equals: true,
        },
      },
    ],
  };
}

export function selectCanonicalPlacementAssessment<T extends CanonicalPlacementCandidate>(
  candidates: readonly T[],
  tenantId: string | null,
  identity: CanonicalPlacementIdentity = CANONICAL_PLACEMENT_IDENTITY,
): CanonicalPlacementSelection<T> {
  const matches = candidates.filter((candidate) => {
    if (
      candidate.deletedAt !== null ||
      candidate.status !== "PUBLISHED" ||
      candidate.type !== "PLACEMENT" ||
      (candidate.tenantId !== null && candidate.tenantId !== tenantId)
    ) {
      return false;
    }
    const config = parseCanonicalAssessmentConfig(candidate.config);
    return (
      config?.canonicalManifestId === identity.manifestId &&
      config.canonicalManifestVersion === identity.manifestVersion &&
      config.canonicalActive === true
    );
  });

  if (matches.length === 0) return { status: "NONE", assessment: null };
  if (matches.length > 1) {
    return {
      status: "CONFLICT",
      assessment: null,
      assessmentIds: matches.map((candidate) => candidate.id),
    };
  }
  return { status: "FOUND", assessment: matches[0]! };
}

export async function findCanonicalPlacementAssessment(
  client: PrismaClient | Prisma.TransactionClient,
  tenantId: string | null,
  identity: CanonicalPlacementIdentity = CANONICAL_PLACEMENT_IDENTITY,
): Promise<CanonicalPlacementCandidate | null> {
  const candidates = await client.assessment.findMany({
    where: buildCanonicalPlacementAssessmentWhere(tenantId, identity),
    select: {
      id: true,
      tenantId: true,
      type: true,
      status: true,
      deletedAt: true,
      config: true,
    },
  });
  const selection = selectCanonicalPlacementAssessment(candidates, tenantId, identity);
  if (selection.status === "CONFLICT") {
    throw conflictError("Birden fazla aktif canonical placement assessment bulundu");
  }
  return selection.assessment;
}
