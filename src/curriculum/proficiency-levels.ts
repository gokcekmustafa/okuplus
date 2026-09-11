import { z } from "zod";

/**
 * Proficiency placement için kullanılan beceri kapsamı.
 * Mevcut G8_12 pilot kataloğundaki Skill kodlarıyla aynı tutulur.
 */
export const PROFICIENCY_SKILL_CODES = ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"] as const;

export type ProficiencySkillCode = (typeof PROFICIENCY_SKILL_CODES)[number];

export const proficiencySkillCodeSchema = z.enum(PROFICIENCY_SKILL_CODES);

export const PROFICIENCY_LEVEL_CODES = [
  "R1_FOUNDATION",
  "R2_DEVELOPING",
  "R3_INDEPENDENT",
  "R4_ADVANCED",
] as const;

export type ProficiencyLevelCode = (typeof PROFICIENCY_LEVEL_CODES)[number];

export const proficiencyLevelCodeSchema = z.enum(PROFICIENCY_LEVEL_CODES);

const proficiencyLevelEntrySchema = z
  .object({
    code: proficiencyLevelCodeSchema,
    name: z.string().trim().min(1).max(120),
    gradeBand: z.string().trim().min(1).max(120),
    difficultyMin: z.number().finite().min(0).max(1),
    difficultyMax: z.number().finite().min(0).max(1),
    skillCoverage: z.array(proficiencySkillCodeSchema).min(1),
    displayOrder: z.number().int().min(0),
  })
  .strict()
  .superRefine((level, ctx) => {
    if (level.difficultyMin > level.difficultyMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["difficultyMin"],
        message: "difficultyMin difficultyMax değerini aşamaz",
      });
    }

    if (new Set(level.skillCoverage).size !== level.skillCoverage.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["skillCoverage"],
        message: "skillCoverage içinde tekrar eden Skill olamaz",
      });
    }
  });

export const canonicalProficiencyLevelManifestSchema = z
  .object({
    manifestId: z.literal("OKU-PROFICIENCY-LEVELS"),
    manifestVersion: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+$/u),
    lifecycle: z.literal("DESIGN_ONLY"),
    calibrationStatus: z.literal("NOT_CALIBRATED"),
    levels: z.array(proficiencyLevelEntrySchema).length(PROFICIENCY_LEVEL_CODES.length),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const codes = manifest.levels.map((level) => level.code);
    const displayOrders = manifest.levels.map((level) => level.displayOrder);

    if (new Set(codes).size !== codes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["levels"],
        message: "proficiency Level code değerleri unique olmalı",
      });
    }
    if (new Set(displayOrders).size !== displayOrders.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["levels"],
        message: "proficiency Level displayOrder değerleri unique olmalı",
      });
    }

    const expectedCodes = new Set(PROFICIENCY_LEVEL_CODES);
    for (const [index, code] of codes.entries()) {
      if (!expectedCodes.has(code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["levels", index, "code"],
          message: "beklenmeyen proficiency Level code",
        });
      }
    }
  });

export type CanonicalProficiencyLevelManifest = z.infer<
  typeof canonicalProficiencyLevelManifestSchema
>;
export type CanonicalProficiencyLevel = CanonicalProficiencyLevelManifest["levels"][number];

/**
 * Tasarım manifestidir. difficulty ve gradeBand değerleri kalibrasyon verisi
 * değildir; production'da otomatik Level atamasını etkinleştirmez.
 */
const CANONICAL_PROFICIENCY_LEVEL_MANIFEST_DRAFT = {
  manifestId: "OKU-PROFICIENCY-LEVELS",
  manifestVersion: "1.0.0",
  lifecycle: "DESIGN_ONLY",
  calibrationStatus: "NOT_CALIBRATED",
  levels: [
    {
      code: "R1_FOUNDATION",
      name: "Okuma Temeli",
      gradeBand: "5–6",
      difficultyMin: 0.2,
      difficultyMax: 0.4,
      skillCoverage: PROFICIENCY_SKILL_CODES,
      displayOrder: 10,
    },
    {
      code: "R2_DEVELOPING",
      name: "Gelişen Okur",
      gradeBand: "6–8",
      difficultyMin: 0.35,
      difficultyMax: 0.55,
      skillCoverage: PROFICIENCY_SKILL_CODES,
      displayOrder: 20,
    },
    {
      code: "R3_INDEPENDENT",
      name: "Bağımsız Okur",
      gradeBand: "8–10",
      difficultyMin: 0.5,
      difficultyMax: 0.7,
      skillCoverage: PROFICIENCY_SKILL_CODES,
      displayOrder: 30,
    },
    {
      code: "R4_ADVANCED",
      name: "İleri Düzey Okur",
      gradeBand: "10–12",
      difficultyMin: 0.65,
      difficultyMax: 0.85,
      skillCoverage: PROFICIENCY_SKILL_CODES,
      displayOrder: 40,
    },
  ],
} as const;

export function validateCanonicalProficiencyLevelManifest(
  input: unknown,
): CanonicalProficiencyLevelManifest {
  return canonicalProficiencyLevelManifestSchema.parse(input);
}

export const CANONICAL_PROFICIENCY_LEVEL_MANIFEST = validateCanonicalProficiencyLevelManifest(
  CANONICAL_PROFICIENCY_LEVEL_MANIFEST_DRAFT,
);
