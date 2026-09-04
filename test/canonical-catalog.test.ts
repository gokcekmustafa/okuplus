import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  assertFirstRealPackCanonicalBinding,
  CANONICAL_CATALOG_MANIFEST,
  canonicalCatalogManifestSchema,
  canonicalRuntimeMetadataConflicts,
  type CanonicalCatalogManifest,
  validateFirstRealPackCanonicalCatalogManifest,
} from "../src/curriculum/canonical-catalog.js";
import {
  applyCanonicalCatalogBootstrap,
  planCanonicalCatalogBootstrap,
  type CanonicalCatalogSnapshot,
} from "../src/curriculum/canonical-catalog-bootstrap.js";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
  targetFingerprint,
} from "../src/curriculum/catalog-target-verification.js";

const stagingUrl =
  "postgresql://neondb_owner@ep-fixture-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";

function cloneManifest(): CanonicalCatalogManifest {
  return structuredClone(CANONICAL_CATALOG_MANIFEST);
}

function exactSnapshot(): CanonicalCatalogSnapshot {
  const level = CANONICAL_CATALOG_MANIFEST.levels[0]!;
  return {
    level: { id: "level-1", ...level },
    skills: CANONICAL_CATALOG_MANIFEST.skills.map((skill, index) => ({
      id: `skill-${index + 1}`,
      code: skill.code,
      name: skill.name,
      category: skill.category,
      description: skill.description,
      displayOrder: skill.displayOrder,
    })),
  };
}

function fakePrisma(
  options: { failSkillCreateAt?: number } = {},
  initial: CanonicalCatalogSnapshot = exactSnapshot(),
) {
  let state = structuredClone(initial);
  let skillCreateCount = 0;
  const transactionClient = {
    level: {
      findUnique: async () => state.level,
      create: async ({ data }: { data: CanonicalCatalogSnapshot["level"] }) => {
        state.level = { id: "level-created", ...data! };
        return state.level;
      },
    },
    skill: {
      findMany: async () => state.skills,
      create: async ({ data }: { data: CanonicalCatalogSnapshot["skills"][number] }) => {
        skillCreateCount += 1;
        if (options.failSkillCreateAt === skillCreateCount) {
          throw new Error("P2002 unique constraint race");
        }
        const created = { id: `skill-created-${skillCreateCount}`, ...data };
        state.skills.push(created);
        return created;
      },
    },
  };
  return {
    client: {
      $transaction: async (callback: (tx: typeof transactionClient) => Promise<unknown>) => {
        const before = structuredClone(state);
        try {
          return await callback(transactionClient);
        } catch (error) {
          state = before;
          throw error;
        }
      },
    } as unknown as PrismaClient,
    getState: () => state,
  };
}

describe("8G-8 canonical pilot catalog", () => {
  it("approved pilot manifest contains exactly one Level and three Skills", () => {
    expect(CANONICAL_CATALOG_MANIFEST.lifecycle).toBe("ACTIVE");
    expect(CANONICAL_CATALOG_MANIFEST.levels).toHaveLength(1);
    expect(CANONICAL_CATALOG_MANIFEST.skills).toHaveLength(3);
    expect(CANONICAL_CATALOG_MANIFEST.levels[0]).toMatchObject({
      code: "G8_12",
      minScore: 0,
      maxScore: 100,
      difficultyMin: 0.45,
      difficultyMax: 0.7,
    });
  });

  it("keeps the pack track order bound to the canonical Skill codes", () => {
    expect(() =>
      assertFirstRealPackCanonicalBinding({
        levelCode: "G8_12",
        skillCodes: ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"],
      }),
    ).not.toThrow();

    expect(() =>
      assertFirstRealPackCanonicalBinding({
        levelCode: "G8_12",
        skillCodes: ["RC_DETAIL", "RC_MAIN_IDEA", "RC_INFERENCE"],
      }),
    ).toThrow(/Skill sırası/u);
  });

  it("rejects fixture markers in a canonical manifest", () => {
    const fixtureManifest = {
      ...CANONICAL_CATALOG_MANIFEST,
      skills: CANONICAL_CATALOG_MANIFEST.skills.map((skill, index) =>
        index === 0 ? { ...skill, code: "E2E_SKILL" } : skill,
      ),
    };

    expect(canonicalCatalogManifestSchema.safeParse(fixtureManifest).success).toBe(false);
  });

  it("keeps generic validation separate from the First Real Pack size rules", () => {
    const extended = cloneManifest();
    extended.skills.push({ ...extended.skills[2], code: "RC_EXTRA", displayOrder: 40 });

    expect(canonicalCatalogManifestSchema.safeParse(extended).success).toBe(true);
    expect(() => validateFirstRealPackCanonicalCatalogManifest(extended)).toThrow();
  });

  it("rejects strict, duplicate-code, and duplicate-displayOrder manifests", () => {
    const unknownField = cloneManifest();
    unknownField.unexpected = true;
    expect(canonicalCatalogManifestSchema.safeParse(unknownField).success).toBe(false);

    const duplicateCode = cloneManifest();
    duplicateCode.skills[1].code = duplicateCode.skills[0].code;
    expect(canonicalCatalogManifestSchema.safeParse(duplicateCode).success).toBe(false);

    const duplicateOrder = cloneManifest();
    duplicateOrder.skills[1].displayOrder = duplicateOrder.skills[0].displayOrder;
    expect(canonicalCatalogManifestSchema.safeParse(duplicateOrder).success).toBe(false);
  });

  it("blocks immutable code rename while accepting the approved baseline", () => {
    expect(() =>
      validateFirstRealPackCanonicalCatalogManifest(CANONICAL_CATALOG_MANIFEST),
    ).not.toThrow();
    const renamed = cloneManifest();
    renamed.skills[0].code = "RC_MAIN_IDEA_RENAMED";
    renamed.packBindings[0].tracks[0].skillCode = "RC_MAIN_IDEA_RENAMED";
    expect(() => validateFirstRealPackCanonicalCatalogManifest(renamed)).toThrow(/immutable/u);
  });
});

describe("canonical catalog target verification", () => {
  it("accepts the approved target and live identity without backend host matching", () => {
    const target = parseCatalogTargetUrl(stagingUrl, "STAGING");
    expect(target.provider).toBe("NEON");
    const identity = { database: "neondb", db_user: "neondb_owner" };
    expect(() =>
      assertApprovedTargetFingerprint(target, identity, targetFingerprint(target, identity)),
    ).not.toThrow();
    expect(() =>
      assertLiveCatalogTargetIdentity(target, {
        database: "neondb",
        db_user: "neondb_owner",
      }),
    ).not.toThrow();
  });

  it("blocks wrong database, wrong target fingerprint, production-marked staging, and TEST DB", () => {
    const target = parseCatalogTargetUrl(stagingUrl, "STAGING");
    expect(() =>
      assertLiveCatalogTargetIdentity(target, {
        database: "other_database",
        db_user: "neondb_owner",
      }),
    ).toThrow(/database/u);
    expect(() =>
      assertLiveCatalogTargetIdentity(target, {
        database: "neondb",
        db_user: "other_owner",
      }),
    ).toThrow(/user/u);
    const identity = { database: "neondb", db_user: "neondb_owner" };
    expect(() => assertApprovedTargetFingerprint(target, identity, "0".repeat(64))).toThrow(
      /fingerprint/u,
    );
    const productionMarked = parseCatalogTargetUrl(
      "postgresql://owner@prod.example.test/neondb",
      "STAGING",
    );
    expect(() =>
      assertCatalogEnvironmentSafety(productionMarked, { rejectTestDatabase: true }),
    ).toThrow(/production/u);
    const testTarget = parseCatalogTargetUrl(
      "postgresql://owner@localhost/oku_plus_test",
      "STAGING",
    );
    expect(() => assertCatalogEnvironmentSafety(testTarget, { rejectTestDatabase: true })).toThrow(
      /TEST/u,
    );
    const productionFingerprint = targetFingerprint(
      { ...target, environment: "PRODUCTION" },
      identity,
    );
    expect(() => assertApprovedTargetFingerprint(target, identity, productionFingerprint)).toThrow(
      /fingerprint/u,
    );
  });

  it("accepts a Neon pooled endpoint as URL identity while ignoring inet_server_addr()", () => {
    const target = parseCatalogTargetUrl(stagingUrl, "STAGING");
    expect(target.host).toContain("-pooler");
    expect(target.provider).toBe("NEON");
    const identity = { database: "neondb", db_user: "neondb_owner" };
    expect(() =>
      assertApprovedTargetFingerprint(target, identity, targetFingerprint(target, identity)),
    ).not.toThrow();
  });
});

describe("canonical catalog runtime metadata and bootstrap planning", () => {
  it("blocks Skill metadata mismatch as a conflict", () => {
    const snapshot = exactSnapshot();
    snapshot.skills[0]!.category = "DETAIL";
    expect(
      canonicalRuntimeMetadataConflicts(
        CANONICAL_CATALOG_MANIFEST,
        snapshot.level,
        snapshot.skills,
      ),
    ).toContain("Skill RC_MAIN_IDEA category mismatch");
    expect(planCanonicalCatalogBootstrap(CANONICAL_CATALOG_MANIFEST, snapshot).action).toBe(
      "CONFLICT",
    );
  });

  it("returns NOOP on sequential rerun after a successful bootstrap", async () => {
    const empty: CanonicalCatalogSnapshot = { level: null, skills: [] };
    const fake = fakePrisma({}, empty);
    await applyCanonicalCatalogBootstrap(fake.client, CANONICAL_CATALOG_MANIFEST, empty);
    expect(planCanonicalCatalogBootstrap(CANONICAL_CATALOG_MANIFEST, fake.getState()).action).toBe(
      "NOOP",
    );
  });

  it("rolls back all catalog creates on transaction failure", async () => {
    const empty: CanonicalCatalogSnapshot = { level: null, skills: [] };
    const fake = fakePrisma({ failSkillCreateAt: 2 }, empty);
    await expect(
      applyCanonicalCatalogBootstrap(fake.client, CANONICAL_CATALOG_MANIFEST, empty),
    ).rejects.toThrow(/P2002/u);
    expect(fake.getState()).toEqual(empty);
  });

  it("surfaces a concurrent unique race as a clear failure with rollback", async () => {
    const empty: CanonicalCatalogSnapshot = { level: null, skills: [] };
    const fake = fakePrisma({ failSkillCreateAt: 1 }, empty);
    await expect(
      applyCanonicalCatalogBootstrap(fake.client, CANONICAL_CATALOG_MANIFEST, empty),
    ).rejects.toThrow(/unique constraint race/u);
    expect(fake.getState()).toEqual(empty);
  });
});
