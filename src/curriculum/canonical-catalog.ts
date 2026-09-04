import { z } from "zod";
import { catalogFixtureReason, type CatalogRecordIdentity } from "./catalog-validation.js";

const canonicalCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,49}$/u, "canonical code yalnızca büyük harf, sayı ve _ içermeli");

const trackIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/u, "track ID yalnızca küçük harf, sayı ve - içermeli");

const skillCategorySchema = z.enum([
  "MAIN_IDEA",
  "DETAIL",
  "INFERENCE",
  "VOCABULARY",
  "FACTUAL",
  "COMPREHENSION",
]);

const lifecycleSchema = z.enum(["DRAFT", "REVIEW", "APPROVED", "ACTIVE", "RETIRED"]);

const levelManifestSchema = z
  .object({
    code: canonicalCodeSchema,
    name: z.string().trim().min(1).max(120),
    gradeBand: z.string().trim().min(1).max(120),
    minScore: z.number().finite().min(0).max(100),
    maxScore: z.number().finite().min(0).max(100),
    difficultyMin: z.number().finite().min(0).max(1),
    difficultyMax: z.number().finite().min(0).max(1),
    displayOrder: z.number().int().min(0),
  })
  .strict()
  .superRefine((level, ctx) => {
    if (level.minScore > level.maxScore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minScore"],
        message: "minScore maxScore değerini aşamaz",
      });
    }
    if (level.difficultyMin > level.difficultyMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["difficultyMin"],
        message: "difficultyMin difficultyMax değerini aşamaz",
      });
    }
  });

const skillManifestSchema = z
  .object({
    code: canonicalCodeSchema,
    name: z.string().trim().min(1).max(120),
    category: skillCategorySchema,
    description: z.string().trim().min(1).max(500),
    learningOutcome: z.string().trim().min(1).max(1000),
    rubricSummary: z.string().trim().min(1).max(2000),
    displayOrder: z.number().int().min(0),
  })
  .strict();

const packTrackSchema = z
  .object({
    trackId: trackIdSchema,
    skillCode: canonicalCodeSchema,
  })
  .strict();

const packBindingSchema = z
  .object({
    packId: z.string().trim().min(1).max(120),
    levelCode: canonicalCodeSchema,
    expectedContentCount: z.number().int().nonnegative(),
    expectedQuestionCount: z.number().int().nonnegative(),
    tracks: z.array(packTrackSchema),
  })
  .strict();

function duplicateValues(values: string[] | number[]): Set<string | number> {
  const counts = new Map<string | number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value));
}

function addDuplicateIssues(
  values: string[] | number[],
  pathPrefix: "levels" | "skills",
  field: "code" | "displayOrder",
  ctx: z.RefinementCtx,
): void {
  const duplicates = duplicateValues(values);
  for (const [index, value] of values.entries()) {
    if (!duplicates.has(value)) continue;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [pathPrefix, index, field],
      message: `${pathPrefix} ${field} unique olmalı: ${String(value)}`,
    });
  }
}

function addDuplicateTrackIssues(
  tracks: Array<{ trackId: string }>,
  bindingIndex: number,
  ctx: z.RefinementCtx,
): void {
  const duplicates = duplicateValues(tracks.map((track) => track.trackId));
  for (const [trackIndex, track] of tracks.entries()) {
    if (!duplicates.has(track.trackId)) continue;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["packBindings", bindingIndex, "tracks", trackIndex, "trackId"],
      message: `pack trackId unique olmalı: ${track.trackId}`,
    });
  }
}

export const canonicalCatalogManifestSchema = z
  .object({
    manifestId: z.string().trim().min(1).max(120),
    manifestVersion: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+$/u),
    lifecycle: lifecycleSchema,
    scope: z.string().trim().min(1).max(120),
    levels: z.array(levelManifestSchema).min(1),
    skills: z.array(skillManifestSchema).min(1),
    packBindings: z.array(packBindingSchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const manifestIdentity: CatalogRecordIdentity = {
      id: `canonical:${manifest.manifestId}`,
      code: manifest.manifestId,
      name: manifest.scope,
    };
    const manifestFixtureReason = catalogFixtureReason(manifestIdentity);
    if (manifestFixtureReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manifestId"],
        message: manifestFixtureReason,
      });
    }
    addDuplicateIssues(
      manifest.levels.map((entry) => entry.code),
      "levels",
      "code",
      ctx,
    );
    addDuplicateIssues(
      manifest.skills.map((entry) => entry.code),
      "skills",
      "code",
      ctx,
    );
    addDuplicateIssues(
      manifest.levels.map((entry) => entry.displayOrder),
      "levels",
      "displayOrder",
      ctx,
    );
    addDuplicateIssues(
      manifest.skills.map((entry) => entry.displayOrder),
      "skills",
      "displayOrder",
      ctx,
    );

    const levelCodes = new Set(manifest.levels.map((entry) => entry.code));
    const skillCodes = new Set(manifest.skills.map((entry) => entry.code));
    for (const [bindingIndex, binding] of manifest.packBindings.entries()) {
      const bindingFixtureReason = catalogFixtureReason({
        id: `canonical:${binding.packId}`,
        code: binding.packId,
        name: binding.packId,
      });
      if (bindingFixtureReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["packBindings", bindingIndex, "packId"],
          message: bindingFixtureReason,
        });
      }
      if (!levelCodes.has(binding.levelCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["packBindings", bindingIndex, "levelCode"],
          message: "pack Level code manifest içindeki Level ile eşleşmiyor",
        });
      }
      addDuplicateTrackIssues(binding.tracks, bindingIndex, ctx);
      for (const [trackIndex, track] of binding.tracks.entries()) {
        if (!skillCodes.has(track.skillCode)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["packBindings", bindingIndex, "tracks", trackIndex, "skillCode"],
            message: "track Skill code manifest içinde bulunmuyor",
          });
        }
      }
    }

    for (const [index, entry] of manifest.levels.entries()) {
      const record = entry as { code: string; name: string };
      const identity: CatalogRecordIdentity = {
        id: `canonical:${record.code}`,
        code: record.code,
        name: record.name,
      };
      const reason = catalogFixtureReason(identity);
      if (reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["levels", index],
          message: reason,
        });
      }
    }
    for (const [index, entry] of manifest.skills.entries()) {
      const identity: CatalogRecordIdentity = {
        id: `canonical:${entry.code}`,
        code: entry.code,
        name: entry.name,
      };
      const reason = catalogFixtureReason(identity);
      if (reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["skills", index],
          message: reason,
        });
      }
    }
  });

export type CanonicalCatalogManifest = z.infer<typeof canonicalCatalogManifestSchema>;

export const firstRealPackCatalogManifestSchema = canonicalCatalogManifestSchema.superRefine(
  (manifest, ctx) => {
    if (manifest.manifestId !== "OKU-8G8-PILOT-CATALOG") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manifestId"],
        message: "First Real Pack manifestId eşleşmiyor",
      });
    }
    if (manifest.scope !== "FIRST_REAL_PACK_PILOT") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: "First Real Pack scope eşleşmiyor",
      });
    }
    if (manifest.levels.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["levels"],
        message: "First Real Pack tam olarak bir Level içermeli",
      });
    }
    if (manifest.skills.length !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["skills"],
        message: "First Real Pack tam olarak üç Skill içermeli",
      });
    }
    if (manifest.packBindings.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packBindings"],
        message: "First Real Pack tam olarak bir pack binding içermeli",
      });
      return;
    }

    const binding = manifest.packBindings[0]!;
    if (binding.packId !== "OKU-8G8-FIRST-REAL-CURRICULUM") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packBindings", 0, "packId"],
        message: "First Real Pack packId eşleşmiyor",
      });
    }
    if (binding.expectedContentCount !== 9 || binding.expectedQuestionCount !== 36) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packBindings", 0],
        message: "First Real Pack beklenen content/question sayısı eşleşmiyor",
      });
    }
    if (binding.tracks.length !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packBindings", 0, "tracks"],
        message: "First Real Pack tam olarak üç track içermeli",
      });
    }
    if (binding.levelCode !== manifest.levels[0]?.code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packBindings", 0, "levelCode"],
        message: "pack Level code manifest içindeki Level ile eşleşmiyor",
      });
    }

    const expectedTracks = [
      { trackId: "main-idea", category: "MAIN_IDEA" },
      { trackId: "detail", category: "DETAIL" },
      { trackId: "inference", category: "INFERENCE" },
    ] as const;
    for (const [index, expected] of expectedTracks.entries()) {
      const track = binding.tracks[index];
      if (!track || track.trackId !== expected.trackId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["packBindings", 0, "tracks", index, "trackId"],
          message: `track sırası ${expected.trackId} olmalı`,
        });
        continue;
      }
      const skill = manifest.skills.find((candidate) => candidate.code === track.skillCode);
      if (skill?.category !== expected.category) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["packBindings", 0, "tracks", index, "skillCode"],
          message: `${expected.trackId} track'i ${expected.category} Skill ile eşleşmeli`,
        });
      }
    }
  },
);

export type CanonicalRuntimeLevelRecord = {
  code: string;
  name: string;
  minScore: number;
  maxScore: number;
  gradeBand: string | null;
  difficultyMin: number;
  difficultyMax: number;
  displayOrder: number;
};

export type CanonicalRuntimeSkillRecord = {
  code: string;
  name: string;
  category: string;
  description: string | null;
  displayOrder: number;
};

export function canonicalRuntimeMetadataConflicts(
  manifest: CanonicalCatalogManifest,
  level: CanonicalRuntimeLevelRecord | null,
  skills: CanonicalRuntimeSkillRecord[],
): string[] {
  const conflicts: string[] = [];
  const expectedLevel = manifest.levels[0];
  if (expectedLevel) {
    if (!level) conflicts.push(`Level ${expectedLevel.code} missing`);
    else {
      const levelFields: Array<keyof typeof expectedLevel> = [
        "code",
        "name",
        "minScore",
        "maxScore",
        "gradeBand",
        "difficultyMin",
        "difficultyMax",
        "displayOrder",
      ];
      for (const field of levelFields) {
        if (level[field] !== expectedLevel[field]) conflicts.push(`Level ${field} mismatch`);
      }
    }
  }

  const skillsByCode = new Map(skills.map((skill) => [skill.code, skill]));
  for (const expected of manifest.skills) {
    const actual = skillsByCode.get(expected.code);
    if (!actual) {
      conflicts.push(`Skill ${expected.code} missing`);
      continue;
    }
    const skillFields: Array<
      keyof Pick<typeof expected, "code" | "name" | "category" | "description" | "displayOrder">
    > = ["code", "name", "category", "description", "displayOrder"];
    for (const field of skillFields) {
      if (actual[field] !== expected[field])
        conflicts.push(`Skill ${expected.code} ${field} mismatch`);
    }
  }
  return conflicts;
}

export function assertCanonicalRuntimeMetadata(
  manifest: CanonicalCatalogManifest,
  level: CanonicalRuntimeLevelRecord | null,
  skills: CanonicalRuntimeSkillRecord[],
): void {
  const conflicts = canonicalRuntimeMetadataConflicts(manifest, level, skills);
  if (conflicts.length > 0) throw new Error(conflicts.join("; "));
}

/**
 * Pilot code baseline. A code rename requires an explicit manifest-versioned
 * decision and a deliberate update to this guard; it cannot happen by an
 * incidental edit to the manifest.
 */
export const CANONICAL_CATALOG_CODE_BASELINE = Object.freeze({
  manifestId: "OKU-8G8-PILOT-CATALOG",
  levelCode: "G8_12",
  skillCodes: ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"] as const,
});

const CANONICAL_CATALOG_MANIFEST_DRAFT = {
  manifestId: "OKU-8G8-PILOT-CATALOG",
  manifestVersion: "1.0.0",
  lifecycle: "ACTIVE",
  scope: "FIRST_REAL_PACK_PILOT",
  levels: [
    {
      code: "G8_12",
      name: "8–12. Sınıf Okuma Başlangıç",
      gradeBand: "8–12",
      minScore: 0,
      maxScore: 100,
      difficultyMin: 0.45,
      difficultyMax: 0.7,
      displayOrder: 10,
    },
  ],
  skills: [
    {
      code: "RC_MAIN_IDEA",
      name: "Ana fikri bul",
      category: "MAIN_IDEA",
      description: "Metnin merkez düşüncesini ve ana mesajını belirleme becerisi.",
      learningOutcome: "Öğrenci, ana düşünceyi onu destekleyen ayrıntılardan ayırır.",
      rubricSummary:
        "Ana mesajı doğru belirler; tekil bir ayrıntıyı ana fikir olarak seçmez ve yanıtını metin kanıtıyla ilişkilendirir.",
      displayOrder: 10,
    },
    {
      code: "RC_DETAIL",
      name: "Detayları yakala",
      category: "DETAIL",
      description: "Metinde açıkça verilen bilgi, kanıt ve ilişkileri bulma becerisi.",
      learningOutcome: "Öğrenci, açık bilgiyi doğru konum ve bağlamla eşleştirir.",
      rubricSummary:
        "Metindeki açık kanıtı doğru bulur; ilgisiz ayrıntıyı veya desteklenmeyen çıkarımı seçmez.",
      displayOrder: 20,
    },
    {
      code: "RC_INFERENCE",
      name: "Çıkarım yap",
      category: "INFERENCE",
      description: "Metin kanıtlarından desteklenen örtük sonuç çıkarma becerisi.",
      learningOutcome:
        "Öğrenci, metinde doğrudan yazmayan fakat kanıtlarla desteklenen makul sonucu çıkarır.",
      rubricSummary:
        "Sonucu metinsel ipuçlarıyla destekler; metinde bulunmayan varsayımlar eklemez ve en güçlü kanıtlı sonucu seçer.",
      displayOrder: 30,
    },
  ],
  packBindings: [
    {
      packId: "OKU-8G8-FIRST-REAL-CURRICULUM",
      levelCode: "G8_12",
      expectedContentCount: 9,
      expectedQuestionCount: 36,
      tracks: [
        { trackId: "main-idea", skillCode: "RC_MAIN_IDEA" },
        { trackId: "detail", skillCode: "RC_DETAIL" },
        { trackId: "inference", skillCode: "RC_INFERENCE" },
      ],
    },
  ],
} as const;

export function assertCanonicalCatalogCodeImmutability(manifest: CanonicalCatalogManifest): void {
  const levelCode = manifest.levels[0]?.code;
  const skillCodes = manifest.skills
    .slice()
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((skill) => skill.code);
  if (manifest.manifestId !== CANONICAL_CATALOG_CODE_BASELINE.manifestId) {
    throw new Error("canonical catalog manifestId immutable baseline ile eşleşmiyor");
  }
  if (levelCode !== CANONICAL_CATALOG_CODE_BASELINE.levelCode) {
    throw new Error(`canonical Level code immutable baseline ile eşleşmiyor: ${levelCode}`);
  }
  if (skillCodes.length !== CANONICAL_CATALOG_CODE_BASELINE.skillCodes.length) {
    throw new Error("canonical Skill code sayısı immutable baseline ile eşleşmiyor");
  }
  for (const [index, code] of skillCodes.entries()) {
    if (code !== CANONICAL_CATALOG_CODE_BASELINE.skillCodes[index]) {
      throw new Error(`canonical Skill code immutable baseline ile eşleşmiyor: ${code}`);
    }
  }
}

export function validateCanonicalCatalogManifest(input: unknown): CanonicalCatalogManifest {
  return canonicalCatalogManifestSchema.parse(input);
}

export function validateFirstRealPackCanonicalCatalogManifest(
  input: unknown,
): CanonicalCatalogManifest {
  const manifest = firstRealPackCatalogManifestSchema.parse(input);
  assertCanonicalCatalogCodeImmutability(manifest);
  return manifest;
}

export const CANONICAL_CATALOG_MANIFEST = validateFirstRealPackCanonicalCatalogManifest(
  CANONICAL_CATALOG_MANIFEST_DRAFT,
);

export function assertFirstRealPackCanonicalBinding(input: {
  levelCode: string;
  skillCodes: string[];
}): void {
  const binding = CANONICAL_CATALOG_MANIFEST.packBindings[0]!;
  if (input.levelCode !== binding.levelCode) {
    throw new Error(
      `First Real Pack canonical Level binding uyuşmuyor: beklenen ${binding.levelCode}, alınan ${input.levelCode}`,
    );
  }
  const expected = binding.tracks.map((track) => track.skillCode);
  if (input.skillCodes.length !== expected.length) {
    throw new Error("First Real Pack canonical Skill binding tam olarak üç Skill içermeli");
  }
  for (const [index, skillCode] of input.skillCodes.entries()) {
    if (skillCode !== expected[index]) {
      throw new Error(
        `First Real Pack canonical Skill sırası uyuşmuyor: index=${index}, beklenen=${expected[index]}, alınan=${skillCode}`,
      );
    }
  }
}
