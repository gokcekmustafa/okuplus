import { PrismaClient, type SkillCategory } from "@prisma/client";
import {
  canonicalRuntimeMetadataConflicts,
  type CanonicalCatalogManifest,
  type CanonicalRuntimeLevelRecord,
  type CanonicalRuntimeSkillRecord,
} from "./canonical-catalog.js";
import { catalogFixtureReason, type CatalogRecordIdentity } from "./catalog-validation.js";

export type ExistingCanonicalLevel = CanonicalRuntimeLevelRecord & { id: string };
export type ExistingCanonicalSkill = CanonicalRuntimeSkillRecord & { id: string };

export type CanonicalCatalogSnapshot = {
  level: ExistingCanonicalLevel | null;
  skills: ExistingCanonicalSkill[];
};

export type CanonicalBootstrapAction = "CREATE" | "NOOP" | "CONFLICT";

export type CanonicalBootstrapPlan = {
  action: CanonicalBootstrapAction;
  conflicts: string[];
  missingLevel: boolean;
  missingSkills: string[];
};

function recordIdentity(record: CatalogRecordIdentity): CatalogRecordIdentity {
  return record;
}

function fixtureConflict(record: { id: string; code: string; name: string }): string[] {
  const reason = catalogFixtureReason(recordIdentity(record));
  return reason ? [reason] : [];
}

function levelConflicts(
  manifest: CanonicalCatalogManifest,
  level: ExistingCanonicalLevel,
): string[] {
  const expected = manifest.levels[0];
  const conflicts: string[] = [];
  if (expected) {
    const fields: Array<keyof typeof expected> = [
      "code",
      "name",
      "minScore",
      "maxScore",
      "gradeBand",
      "difficultyMin",
      "difficultyMax",
      "displayOrder",
    ];
    for (const field of fields) {
      if (level[field] !== expected[field]) conflicts.push(`Level ${field} mismatch`);
    }
  }
  return [...conflicts, ...fixtureConflict(level)];
}

function skillConflicts(
  manifest: CanonicalCatalogManifest,
  skill: ExistingCanonicalSkill,
): string[] {
  const expected = manifest.skills.find((entry) => entry.code === skill.code);
  if (!expected) return [];
  return [
    ...canonicalRuntimeMetadataConflicts(manifest, null, [skill]).filter((conflict) =>
      conflict.startsWith(`Skill ${skill.code}`),
    ),
    ...fixtureConflict(skill),
  ];
}

export function planCanonicalCatalogBootstrap(
  manifest: CanonicalCatalogManifest,
  snapshot: CanonicalCatalogSnapshot,
): CanonicalBootstrapPlan {
  const conflicts = snapshot.level ? levelConflicts(manifest, snapshot.level) : [];
  const skillsByCode = new Map(snapshot.skills.map((skill) => [skill.code, skill]));
  const missingSkills: string[] = [];

  for (const expected of manifest.skills) {
    const existing = skillsByCode.get(expected.code);
    if (!existing) {
      missingSkills.push(expected.code);
      continue;
    }
    conflicts.push(...skillConflicts(manifest, existing));
  }

  const missingLevel = snapshot.level === null;
  return {
    action:
      conflicts.length > 0
        ? "CONFLICT"
        : missingLevel || missingSkills.length > 0
          ? "CREATE"
          : "NOOP",
    conflicts,
    missingLevel,
    missingSkills,
  };
}

export async function applyCanonicalCatalogBootstrap(
  prisma: PrismaClient,
  manifest: CanonicalCatalogManifest,
  initial: CanonicalCatalogSnapshot,
): Promise<{ levelCreated: boolean; skillsCreated: string[] }> {
  const plan = planCanonicalCatalogBootstrap(manifest, initial);
  if (plan.action === "CONFLICT") throw new Error(plan.conflicts.join("; "));
  if (plan.action === "NOOP") return { levelCreated: false, skillsCreated: [] };

  return prisma.$transaction(async (tx) => {
    const expectedLevel = manifest.levels[0]!;
    const level = await tx.level.findUnique({ where: { code: expectedLevel.code } });
    if (level) {
      const conflicts = levelConflicts(manifest, level);
      if (conflicts.length > 0) {
        throw new Error("transaction içinde mevcut Level çakışması");
      }
    }

    const existingSkills = await tx.skill.findMany({
      where: { code: { in: manifest.skills.map((skill) => skill.code) } },
    });
    const existingByCode = new Map(existingSkills.map((skill) => [skill.code, skill]));
    for (const expected of manifest.skills) {
      const existing = existingByCode.get(expected.code);
      if (existing) {
        const conflicts = skillConflicts(manifest, existing);
        if (conflicts.length > 0) {
          throw new Error(`transaction içinde Skill çakışması: ${expected.code}`);
        }
      }
    }

    if (!level) await tx.level.create({ data: expectedLevel });

    const skillsCreated: string[] = [];
    for (const expected of manifest.skills) {
      if (existingByCode.has(expected.code)) continue;
      await tx.skill.create({
        data: {
          code: expected.code,
          name: expected.name,
          category: expected.category as SkillCategory,
          description: expected.description,
          displayOrder: expected.displayOrder,
        },
      });
      skillsCreated.push(expected.code);
    }
    return { levelCreated: !level, skillsCreated };
  });
}
