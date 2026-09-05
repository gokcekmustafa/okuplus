import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  CANONICAL_PLACEMENT_IDENTITY,
  buildCanonicalPlacementAssessmentWhere,
  selectCanonicalPlacementAssessment,
  type CanonicalPlacementCandidate,
} from "../src/modules/assessments/canonical-selector.js";
import {
  cutoverCanonicalPlacement,
  planCanonicalPlacementCutover,
  rollbackCanonicalPlacement,
  type CanonicalPlacementCutoverCandidate,
} from "../src/curriculum/canonical-placement-cutover.js";

function candidate(
  overrides: Partial<CanonicalPlacementCandidate> = {},
): CanonicalPlacementCandidate {
  return {
    id: "assessment-v1-1-0",
    tenantId: null,
    type: "PLACEMENT",
    status: "PUBLISHED",
    deletedAt: null,
    config: {
      canonicalManifestId: CANONICAL_PLACEMENT_IDENTITY.manifestId,
      canonicalManifestVersion: CANONICAL_PLACEMENT_IDENTITY.manifestVersion,
      canonicalActive: true,
    },
    ...overrides,
  };
}

describe("canonical placement selector", () => {
  it("builds a published placement query with exact identity and active filters", () => {
    expect(buildCanonicalPlacementAssessmentWhere("tenant-a")).toMatchObject({
      deletedAt: null,
      status: "PUBLISHED",
      type: "PLACEMENT",
      OR: [{ tenantId: null }, { tenantId: "tenant-a" }],
      AND: [
        { config: { path: ["canonicalManifestId"], equals: "OKU-READING-PLACEMENT-V1" } },
        { config: { path: ["canonicalManifestVersion"], equals: "1.1.0" } },
        { config: { path: ["canonicalActive"], equals: true } },
      ],
    });
  });

  it("returns NONE when no canonical assessment exists", () => {
    expect(selectCanonicalPlacementAssessment([], null).status).toBe("NONE");
  });

  it("returns the one exact active canonical assessment", () => {
    const result = selectCanonicalPlacementAssessment([candidate()], null);
    expect(result).toMatchObject({ status: "FOUND", assessment: { id: "assessment-v1-1-0" } });
  });

  it("fails closed when multiple active canonical assessments exist", () => {
    const result = selectCanonicalPlacementAssessment(
      [candidate(), candidate({ id: "assessment-v1-1-0-b" })],
      null,
    );
    expect(result).toEqual({
      status: "CONFLICT",
      assessment: null,
      assessmentIds: ["assessment-v1-1-0", "assessment-v1-1-0-b"],
    });
  });

  it("ignores wrong versions, types, statuses, deletion, and tenant scope", () => {
    const wrongVersion = candidate({
      id: "wrong-version",
      config: {
        canonicalManifestId: CANONICAL_PLACEMENT_IDENTITY.manifestId,
        canonicalManifestVersion: "1.0.0",
        canonicalActive: true,
      },
    });
    const ignored = [
      wrongVersion,
      candidate({ id: "wrong-type", type: "PRACTICE" }),
      candidate({ id: "archived", status: "ARCHIVED" }),
      candidate({ id: "deleted", deletedAt: new Date("2026-01-01") }),
      candidate({ id: "other-tenant", tenantId: "tenant-b" }),
    ];
    const result = selectCanonicalPlacementAssessment(
      [...ignored, candidate({ id: "global" })],
      "tenant-a",
    );
    expect(result).toMatchObject({ status: "FOUND", assessment: { id: "global" } });
  });

  it("allows an active tenant assessment only for the active tenant", () => {
    const result = selectCanonicalPlacementAssessment(
      [candidate({ id: "tenant-a", tenantId: "tenant-a" })],
      "tenant-a",
    );
    expect(result).toMatchObject({ status: "FOUND", assessment: { id: "tenant-a" } });
    expect(
      selectCanonicalPlacementAssessment([candidate({ tenantId: "tenant-a" })], null).status,
    ).toBe("NONE");
  });

  it("selects the exact 1.1.0 assessment while an inactive 1.0.0 graph remains", () => {
    const old = candidate({
      id: "assessment-v1-0-0",
      config: {
        canonicalManifestId: CANONICAL_PLACEMENT_IDENTITY.manifestId,
        canonicalManifestVersion: "1.0.0",
        canonicalActive: false,
      },
    });
    expect(selectCanonicalPlacementAssessment([old, candidate()], null)).toMatchObject({
      status: "FOUND",
      assessment: { id: "assessment-v1-1-0" },
    });
  });
});

describe("canonical placement cutover plan", () => {
  it("plans a reversible cutover from 1.0.0 to 1.1.0", () => {
    const old = candidate({
      id: "assessment-v1-0-0",
      config: {
        canonicalManifestId: CANONICAL_PLACEMENT_IDENTITY.manifestId,
        canonicalManifestVersion: "1.0.0",
        canonicalActive: true,
      },
    }) as CanonicalPlacementCutoverCandidate;
    const next = candidate({ canonicalActive: false }) as CanonicalPlacementCutoverCandidate;

    expect(planCanonicalPlacementCutover([old, next], next.id)).toEqual({
      action: "CUTOVER",
      targetAssessmentId: next.id,
      deactivateAssessmentIds: [old.id],
      conflicts: [],
    });

    expect(
      planCanonicalPlacementCutover(
        [
          { ...old, config: { ...(old.config as object), canonicalActive: false } },
          { ...next, config: { ...(next.config as object), canonicalActive: true } },
        ],
        next.id,
      ),
    ).toMatchObject({ action: "NOOP" });
  });

  it("plans rollback to the previous published version without ARCHIVED", () => {
    const old = candidate({
      id: "assessment-v1-0-0",
      config: {
        canonicalManifestId: CANONICAL_PLACEMENT_IDENTITY.manifestId,
        canonicalManifestVersion: "1.0.0",
        canonicalActive: false,
      },
    }) as CanonicalPlacementCutoverCandidate;
    const next = candidate({ canonicalActive: true }) as CanonicalPlacementCutoverCandidate;
    expect(
      planCanonicalPlacementCutover([old, next], old.id, {
        manifestId: CANONICAL_PLACEMENT_IDENTITY.manifestId,
        manifestVersion: "1.0.0",
      }),
    ).toMatchObject({
      action: "CUTOVER",
      targetAssessmentId: old.id,
      deactivateAssessmentIds: [next.id],
    });
  });

  it("rejects a missing or wrong-version target", () => {
    expect(planCanonicalPlacementCutover([candidate()], "missing").action).toBe("CONFLICT");
    expect(
      planCanonicalPlacementCutover(
        [
          candidate({
            config: {
              ...((candidate().config as object) ?? {}),
              canonicalManifestVersion: "1.0.0",
            },
          }),
        ],
        "assessment-v1-1-0",
      ).action,
    ).toBe("CONFLICT");
  });
});

function fakePrismaForCutover(rows: CanonicalPlacementCutoverCandidate[]): PrismaClient {
  const state = rows.map((row) => ({ ...row }));
  const tx = {
    assessment: {
      findMany: async () => state.map((row) => ({ ...row })),
      update: async ({ where, data }: { where: { id: string }; data: { config: unknown } }) => {
        const row = state.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error("fake assessment missing");
        row.config = data.config;
        return row;
      },
    },
    $queryRaw: async () => [],
  };
  return {
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaClient;
}

describe("canonical placement cutover transactions", () => {
  it("activates 1.1.0 and deactivates 1.0.0 atomically", async () => {
    const old = candidate({
      id: "assessment-v1-0-0",
      config: {
        canonicalManifestId: CANONICAL_PLACEMENT_IDENTITY.manifestId,
        canonicalManifestVersion: "1.0.0",
        canonicalActive: true,
      },
    }) as CanonicalPlacementCutoverCandidate;
    const next = candidate({ canonicalActive: false }) as CanonicalPlacementCutoverCandidate;
    const client = fakePrismaForCutover([old, next]);

    const result = await cutoverCanonicalPlacement(client, next.id);
    expect(result.action).toBe("CUTOVER");
    expect(result.deactivateAssessmentIds).toEqual([old.id]);
  });

  it("supports rollback by reversing active flags in a transaction", async () => {
    const old = candidate({
      id: "assessment-v1-0-0",
      config: {
        canonicalManifestId: CANONICAL_PLACEMENT_IDENTITY.manifestId,
        canonicalManifestVersion: "1.0.0",
        canonicalActive: false,
      },
    }) as CanonicalPlacementCutoverCandidate;
    const next = candidate({ canonicalActive: true }) as CanonicalPlacementCutoverCandidate;
    const client = fakePrismaForCutover([old, next]);

    const result = await rollbackCanonicalPlacement(client, old.id, {
      manifestId: CANONICAL_PLACEMENT_IDENTITY.manifestId,
      manifestVersion: "1.0.0",
    });
    expect(result.action).toBe("CUTOVER");
    expect(result.deactivateAssessmentIds).toEqual([next.id]);
  });
});
