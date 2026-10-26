import { describe, expect, it } from "vitest";
import {
  EDUCATION_V2_P1_A_CYCLE_5_8,
  EDUCATION_V2_P1_A_CYCLE_9_12,
  EDUCATION_V2_P1_A_CYCLE_13_16,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import {
  buildSeedLearningSkillContext,
  mapCurriculumSkillCodeToStoredSkillCode,
  mapCurriculumSkillCodesToStoredSkillCodes,
  mapLearningOutcomeSkillsToContent,
  resolveSeedLearningStepSkillId,
  singleStoredSkillCodeForOutcome,
} from "../src/curriculum/learning-step-skill-link.js";

describe("learning-step skill links", () => {
  const outcomeSkillIdsByKey = new Map<string, readonly string[]>([
    ["outcome-detail", ["skill-detail"]],
    ["outcome-multi", ["skill-inference", "skill-detail"]],
  ]);

  it("resolves a single-outcome step and does not collapse multi-skill outcomes", () => {
    expect(
      resolveSeedLearningStepSkillId({
        learningOutcomeKeys: ["outcome-detail"],
        skillIdsByOutcomeKey: outcomeSkillIdsByKey,
      }),
    ).toBe("skill-detail");
    expect(
      resolveSeedLearningStepSkillId({
        learningOutcomeKeys: ["outcome-detail", "outcome-detail"],
        skillIdsByOutcomeKey: outcomeSkillIdsByKey,
      }),
    ).toBe("skill-detail");
    expect(
      resolveSeedLearningStepSkillId({
        learningOutcomeKeys: ["outcome-multi"],
        skillIdsByOutcomeKey: outcomeSkillIdsByKey,
      }),
    ).toBeNull();
  });

  it("requires source outcomes and fails closed when their mapping is incomplete", () => {
    expect(() =>
      resolveSeedLearningStepSkillId({
        learningOutcomeKeys: [],
        skillIdsByOutcomeKey: outcomeSkillIdsByKey,
      }),
    ).toThrow("kaynak kazanım bağlantısı bulunamadı");
    expect(() =>
      resolveSeedLearningStepSkillId({
        learningOutcomeKeys: ["missing-outcome"],
        skillIdsByOutcomeKey: outcomeSkillIdsByKey,
      }),
    ).toThrow("beceri eşlemesi bulunamadı");
    expect(singleStoredSkillCodeForOutcome(["RC_RELATION", "RC_CONNECTOR"])).toBeNull();
    expect(singleStoredSkillCodeForOutcome(["RC_CLASSIFY", "RC_CONTEXT_CLUES"])).toBe("RC_DETAIL");
  });

  it("associates mapped outcomes with their actual content, exercise, and assessment source", () => {
    const context = buildSeedLearningSkillContext({
      outcomes: [
        { key: "outcome-detail", targetSkillCodes: ["RC_DETAIL"] },
        { key: "outcome-multi", targetSkillCodes: ["RC_RELATION", "RC_CONNECTOR"] },
      ],
      steps: [
        { key: "teach", learningOutcomeKeys: ["outcome-detail"], contentKey: "passage" },
        { key: "practice", learningOutcomeKeys: ["outcome-multi"], exerciseKey: "exercise" },
        { key: "assessment", learningOutcomeKeys: ["outcome-multi"], assessmentKey: "assessment" },
      ],
      skillIdByCode: new Map([
        ["RC_DETAIL", "skill-detail"],
        ["RC_INFERENCE", "skill-inference"],
      ]),
      exerciseContentKeyByKey: new Map([
        ["exercise", "practice-passage"],
        ["assessment-exercise", "assessment-passage"],
      ]),
      assessmentExerciseKeyByKey: new Map([["assessment", "assessment-exercise"]]),
    });
    expect(context.skillIdsByOutcomeKey.get("outcome-multi")).toEqual([
      "skill-inference",
      "skill-detail",
    ]);
    expect(context.skillIdsByContentKey).toEqual(
      new Map([
        ["passage", ["skill-detail"]],
        ["practice-passage", ["skill-inference", "skill-detail"]],
        ["assessment-passage", ["skill-inference", "skill-detail"]],
      ]),
    );
  });

  it("fails closed for missing content and unknown mappings", () => {
    expect(() =>
      mapLearningOutcomeSkillsToContent({
        steps: [{ key: "step", learningOutcomeKeys: ["missing"] }],
        skillIdsByOutcomeKey: outcomeSkillIdsByKey,
        exerciseContentKeyByKey: new Map(),
        assessmentContentKeyByKey: new Map(),
      }),
    ).toThrow("içerik kaynağına bağlanamıyor");
    expect(() =>
      buildSeedLearningSkillContext({
        outcomes: [{ key: "unknown", targetSkillCodes: ["RC_UNREVIEWED_TARGET"] }],
        steps: [{ key: "step", learningOutcomeKeys: ["unknown"], contentKey: "content" }],
        skillIdByCode: new Map(),
        exerciseContentKeyByKey: new Map(),
        assessmentExerciseKeyByKey: new Map(),
      }),
    ).toThrow("kataloğuna eşlenemiyor");
  });

  it("maps reviewed granular outcome codes to existing stored skills and leaves unknowns unresolved", () => {
    expect(mapCurriculumSkillCodeToStoredSkillCode("RC_RELATION")).toBe("RC_INFERENCE");
    expect(mapCurriculumSkillCodeToStoredSkillCode("RC_SYSTEMS")).toBe("RC_INFERENCE");
    expect(mapCurriculumSkillCodeToStoredSkillCode("FAST_SCANNING")).toBe("FAST_ATTENTION");
    expect(mapCurriculumSkillCodeToStoredSkillCode("RC_CONNECTOR")).toBe("RC_DETAIL");
    expect(mapCurriculumSkillCodeToStoredSkillCode("RC_SYNTHESIS")).toBe("RC_INFERENCE");
    expect(mapCurriculumSkillCodeToStoredSkillCode("RC_DATA_INTERPRETATION")).toBe("RC_DETAIL");
    expect(
      mapCurriculumSkillCodesToStoredSkillCodes(["RC_RELATION", "RC_CONNECTOR", "RC_RELATION"]),
    ).toEqual({ storedSkillCodes: ["RC_INFERENCE", "RC_DETAIL"], unmappedSkillCodes: [] });
    expect(mapCurriculumSkillCodeToStoredSkillCode("RC_UNREVIEWED_TARGET")).toBeNull();
    expect(mapCurriculumSkillCodeToStoredSkillCode("RC_CLAIM_EVIDENCE")).toBeNull();
    expect(mapCurriculumSkillCodesToStoredSkillCodes(["RC_CLAIM_EVIDENCE"])).toEqual({
      storedSkillCodes: ["RC_DETAIL", "RC_INFERENCE"],
      unmappedSkillCodes: [],
    });
    expect(singleStoredSkillCodeForOutcome(["RC_CLAIM_EVIDENCE"])).toBeNull();
  });

  it("covers the authored A-route skill vocabulary through Cycle 16 without inventing mappings", () => {
    const cycles = [
      ...EDUCATION_V2_P1_A_CYCLE_5_8,
      ...EDUCATION_V2_P1_A_CYCLE_9_12,
      ...EDUCATION_V2_P1_A_CYCLE_13_16,
    ];
    const sourceSkillCodes = [
      ...new Set(
        cycles.flatMap((cycle) =>
          cycle.sourceCycle.sourceStations.flatMap((station) => station.skillCodes),
        ),
      ),
    ];
    expect(mapCurriculumSkillCodesToStoredSkillCodes(sourceSkillCodes).unmappedSkillCodes).toEqual(
      [],
    );
  });
});
