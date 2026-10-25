/** Resolve an optional scalar link without collapsing multi-skill outcomes. */
export function resolveSeedLearningStepSkillId(input: {
  learningOutcomeKeys: readonly string[];
  skillIdsByOutcomeKey: ReadonlyMap<string, readonly string[]>;
}): string | null {
  if (input.learningOutcomeKeys.length === 0)
    throw new Error("Öğrenme adımının kaynak kazanım bağlantısı bulunamadı.");
  const skillIds = new Set<string>();
  for (const outcomeKey of input.learningOutcomeKeys) {
    const outcomeSkillIds = input.skillIdsByOutcomeKey.get(outcomeKey);
    if (!outcomeSkillIds)
      throw new Error(`Öğrenme kazanımının beceri eşlemesi bulunamadı: ${outcomeKey}`);
    for (const skillId of outcomeSkillIds) skillIds.add(skillId);
  }
  return skillIds.size === 1 ? skillIds.values().next().value! : null;
}

/**
 * Stored Skill rows are broad application competencies; route outcomes may
 * name narrower curriculum targets. Keep this mapping explicit and fail closed
 * for targets that have no reviewed application competency.
 */
const curriculumSkillToStoredSkills: Readonly<Record<string, readonly string[]>> = {
  FAST_SCAN: ["FAST_ATTENTION"],
  RC_CLASSIFY: ["RC_DETAIL"],
  RC_CONTEXT_CLUES: ["RC_DETAIL"],
  RC_EXPLANATION: ["RC_INFERENCE"],
  RC_MODEL_LIMITS: ["RC_INFERENCE"],
  RC_RELATION: ["RC_INFERENCE"],
  RC_SYNTHESIS: ["RC_INFERENCE"],
  RC_CONNECTOR: ["RC_DETAIL"],
  RC_STRUCTURE: ["RC_MAIN_IDEA"],
  RC_EVIDENCE: ["RC_DETAIL"],
  // Claim/evidence work includes locating textual details and judging their inferential support.
  RC_CLAIM_EVIDENCE: ["RC_DETAIL", "RC_INFERENCE"],
  RC_CAUSE_EFFECT: ["RC_INFERENCE"],
  RC_COMPARE_CONTRAST: ["RC_INFERENCE"],
  RC_SEQUENCE: ["RC_DETAIL"],
  RC_VOCABULARY_CONTEXT: ["RC_DETAIL"],
  RC_DATA_INTERPRETATION: ["RC_DETAIL"],
  RC_LIMITS: ["RC_INFERENCE"],
};

const storedSkillCodeCatalog = new Set([
  "FAST_ATTENTION",
  "FAST_RECOGNITION",
  "FAST_CHUNKING",
  "RC_MAIN_IDEA",
  "RC_DETAIL",
  "RC_INFERENCE",
]);

export function mapCurriculumSkillCodeToStoredSkillCode(code: string): string | null {
  if (storedSkillCodeCatalog.has(code)) return code;
  const mapped = curriculumSkillToStoredSkills[code];
  return mapped?.length === 1 ? (mapped[0] ?? null) : null;
}

export function mapCurriculumSkillCodesToStoredSkillCodes(codes: readonly string[]): {
  storedSkillCodes: string[];
  unmappedSkillCodes: string[];
} {
  const mappedStoredSkillCodes = new Set<string>();
  const unmappedSkillCodes = new Set<string>();
  for (const code of codes) {
    if (storedSkillCodeCatalog.has(code)) {
      mappedStoredSkillCodes.add(code);
      continue;
    }
    const mappedCodes = curriculumSkillToStoredSkills[code];
    if (mappedCodes) for (const storedCode of mappedCodes) mappedStoredSkillCodes.add(storedCode);
    else unmappedSkillCodes.add(code);
  }
  return {
    storedSkillCodes: [...mappedStoredSkillCodes],
    unmappedSkillCodes: [...unmappedSkillCodes],
  };
}

export function mapLearningOutcomeSkillIds(
  outcomes: readonly { key: string; targetSkillCodes: readonly string[] }[],
  skillIdByCode: ReadonlyMap<string, string>,
): { skillIdsByOutcomeKey: Map<string, readonly string[]>; unmappedSkillCodes: string[] } {
  const skillIdsByOutcomeKey = new Map<string, readonly string[]>();
  const unmappedSkillCodes = new Set<string>();
  for (const outcome of outcomes) {
    const mapped = mapCurriculumSkillCodesToStoredSkillCodes(outcome.targetSkillCodes);
    for (const code of mapped.unmappedSkillCodes) unmappedSkillCodes.add(code);
    const ids = mapped.storedSkillCodes.flatMap((code) => {
      const id = skillIdByCode.get(code);
      if (!id) {
        unmappedSkillCodes.add(code);
        return [];
      }
      return [id];
    });
    skillIdsByOutcomeKey.set(outcome.key, ids);
  }
  return { skillIdsByOutcomeKey, unmappedSkillCodes: [...unmappedSkillCodes] };
}

export function mapLearningOutcomeSkillsToContent(input: {
  steps: readonly {
    learningOutcomeKeys: readonly string[];
    contentKey?: string;
    exerciseKey?: string;
    assessmentKey?: string;
  }[];
  skillIdsByOutcomeKey: ReadonlyMap<string, readonly string[]>;
  exerciseContentKeyByKey: ReadonlyMap<string, string>;
  assessmentContentKeyByKey: ReadonlyMap<string, string>;
}): Map<string, string[]> {
  const skillIdsByContentKey = new Map<string, Set<string>>();
  for (const step of input.steps) {
    const contentKey =
      step.contentKey ??
      (step.exerciseKey ? input.exerciseContentKeyByKey.get(step.exerciseKey) : undefined) ??
      (step.assessmentKey ? input.assessmentContentKeyByKey.get(step.assessmentKey) : undefined);
    if (!contentKey) throw new Error("Öğrenme adımının kazanımları içerik kaynağına bağlanamıyor.");
    const outcomeSkillIds = step.learningOutcomeKeys.flatMap((key) => {
      const ids = input.skillIdsByOutcomeKey.get(key);
      if (!ids) throw new Error(`Öğrenme kazanımının beceri eşlemesi bulunamadı: ${key}`);
      return ids;
    });
    const skillIds = skillIdsByContentKey.get(contentKey) ?? new Set<string>();
    for (const id of outcomeSkillIds) skillIds.add(id);
    skillIdsByContentKey.set(contentKey, skillIds);
  }
  return new Map([...skillIdsByContentKey].map(([key, ids]) => [key, [...ids]]));
}

export function buildSeedLearningSkillContext(input: {
  outcomes: readonly { key: string; targetSkillCodes: readonly string[] }[];
  steps: readonly {
    key: string;
    learningOutcomeKeys: readonly string[];
    contentKey?: string;
    exerciseKey?: string;
    assessmentKey?: string;
  }[];
  skillIdByCode: ReadonlyMap<string, string>;
  exerciseContentKeyByKey: ReadonlyMap<string, string>;
  assessmentExerciseKeyByKey: ReadonlyMap<string, string>;
}): {
  skillIdsByOutcomeKey: Map<string, readonly string[]>;
  skillIdsByContentKey: Map<string, string[]>;
} {
  const outcomes = mapLearningOutcomeSkillIds(input.outcomes, input.skillIdByCode);
  if (outcomes.unmappedSkillCodes.length > 0)
    throw new Error(
      `Kazanım becerileri uygulama kataloğuna eşlenemiyor: ${outcomes.unmappedSkillCodes.join(", ")}`,
    );
  const assessmentContentKeyByKey = new Map<string, string>();
  for (const [assessmentKey, exerciseKey] of input.assessmentExerciseKeyByKey) {
    const contentKey = input.exerciseContentKeyByKey.get(exerciseKey);
    if (!contentKey)
      throw new Error(`Değerlendirme alıştırmasının içeriği bulunamadı: ${assessmentKey}`);
    assessmentContentKeyByKey.set(assessmentKey, contentKey);
  }
  const skillIdsByContentKey = mapLearningOutcomeSkillsToContent({
    steps: input.steps,
    skillIdsByOutcomeKey: outcomes.skillIdsByOutcomeKey,
    exerciseContentKeyByKey: input.exerciseContentKeyByKey,
    assessmentContentKeyByKey,
  });
  return { skillIdsByOutcomeKey: outcomes.skillIdsByOutcomeKey, skillIdsByContentKey };
}

/** A scalar step relation is used only when source targets map to one stored skill. */
export function singleStoredSkillCodeForOutcome(codes: readonly string[]): string | null {
  const mapped = mapCurriculumSkillCodesToStoredSkillCodes(codes);
  if (mapped.unmappedSkillCodes.length > 0 || mapped.storedSkillCodes.length !== 1) return null;
  return mapped.storedSkillCodes[0] ?? null;
}
