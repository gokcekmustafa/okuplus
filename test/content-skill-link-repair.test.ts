import { describe, expect, it } from "vitest";
import {
  compareContentSkillLinks,
  ensureContentSkillLinks,
  expectedContentSkillLinks,
  inspectContentSkillLinks,
} from "../src/curriculum/content-skill-link-repair.js";
import { buildSeedLearningSkillContext } from "../src/curriculum/learning-step-skill-link.js";
import {
  EDUCATION_V2_P1_A_LEARNING_OUTCOMES,
  EDUCATION_V2_P1_A_PROGRAM,
} from "../src/curriculum/education-v2-p1-a-program.js";
import {
  CYCLE_V2_LEARNING_OUTCOMES,
  EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
} from "../src/curriculum/education-v2-p1-a-cycle-v2-program.js";
import {
  CYCLE_3_LEARNING_OUTCOMES,
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
} from "../src/curriculum/education-v2-p1-a-cycle-3-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE,
} from "../src/curriculum/education-v2-p1-a-cycle-4-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_5_8,
  EDUCATION_V2_P1_A_CYCLE_9_12,
  EDUCATION_V2_P1_A_CYCLE_13_16,
  EDUCATION_V2_P1_A_CYCLE_17_20,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import { EDUCATION_V2_P1_BCD_RELEASED_PROGRAMS } from "../src/curriculum/education-v2-p1-bcd-program.js";
import { mapCurriculumSkillCodesToStoredSkillCodes } from "../src/curriculum/learning-step-skill-link.js";
import { readFile } from "node:fs/promises";

describe("source-authorized content-skill relation repair", () => {
  const expected = [
    { contentId: "content-a", skillId: "skill-main" },
    { contentId: "content-a", skillId: "skill-detail" },
    { contentId: "content-b", skillId: "skill-inference" },
  ];

  it("recognizes complete relation sets independent of row order", () => {
    expect(compareContentSkillLinks(expected, [expected[2]!, expected[0]!, expected[1]!])).toEqual({
      state: "COMPLETE",
      missingLinks: [],
      unexpectedLinks: [],
    });
  });

  it("returns only missing source relations for an additive repair", () => {
    expect(compareContentSkillLinks(expected, [expected[0]!])).toEqual({
      state: "MISSING",
      missingLinks: [expected[1]!, expected[2]!],
      unexpectedLinks: [],
    });
  });

  it("fails closed when an existing relation is not in the source plan", () => {
    expect(
      compareContentSkillLinks(expected, [
        expected[0]!,
        { contentId: "content-a", skillId: "wrong" },
      ]),
    ).toEqual({
      state: "CONFLICT",
      missingLinks: [expected[1]!, expected[2]!],
      unexpectedLinks: [{ contentId: "content-a", skillId: "wrong" }],
    });
  });

  it("deduplicates shared source links when several steps use the same content", () => {
    expect(
      expectedContentSkillLinks([
        { contentId: "shared", curriculumSkills: [{ id: "detail" }, { id: "inference" }] },
        { contentId: "shared", curriculumSkills: [{ id: "detail" }] },
      ]),
    ).toEqual([
      { contentId: "shared", skillId: "detail" },
      { contentId: "shared", skillId: "inference" },
    ]);
  });

  it("reports the exact unique missing content-skill pairs without writing", async () => {
    let reads = 0;
    const store = {
      async findMany() {
        reads += 1;
        return [expected[0]!];
      },
    };
    const comparison = await inspectContentSkillLinks(store, expected);
    expect(comparison.state).toBe("MISSING");
    expect(comparison.missingLinks).toEqual([expected[1]!, expected[2]!]);
    expect(comparison.missingLinks).toHaveLength(2);
    expect(reads).toBe(1);
  });

  it("maps the authored P1-A and P1-B/C/D outcomes to their source content", () => {
    const skillIdByCode = new Map(
      [
        "FAST_ATTENTION",
        "FAST_RECOGNITION",
        "FAST_CHUNKING",
        "RC_MAIN_IDEA",
        "RC_DETAIL",
        "RC_INFERENCE",
      ].map((code) => [code, `stored-${code}`]),
    );
    const assertProgram = (
      program: {
        content: readonly { key: string }[];
        exercises: readonly { key: string; contentKey: string }[];
        assessments: readonly { key: string; templateExerciseKey: string }[];
        path: { units: readonly { steps: readonly object[] }[] };
      },
      outcomes: readonly { key: string; targetSkillCodes: readonly string[] }[],
    ) => {
      const steps = program.path.units.flatMap((unit) => unit.steps) as Array<{
        key: string;
        learningOutcomeKeys: string[];
        contentKey?: string;
        exerciseKey?: string;
        assessmentKey?: string;
      }>;
      const exerciseContentKeyByKey = new Map(
        program.exercises.map((exercise) => [exercise.key, exercise.contentKey]),
      );
      const assessmentExerciseKeyByKey = new Map(
        program.assessments.map((assessment) => [assessment.key, assessment.templateExerciseKey]),
      );
      const context = buildSeedLearningSkillContext({
        outcomes,
        steps,
        skillIdByCode,
        exerciseContentKeyByKey,
        assessmentExerciseKeyByKey,
      });
      for (const step of steps) {
        const contentKey =
          step.contentKey ??
          (step.exerciseKey ? exerciseContentKeyByKey.get(step.exerciseKey) : undefined) ??
          (step.assessmentKey
            ? exerciseContentKeyByKey.get(assessmentExerciseKeyByKey.get(step.assessmentKey) ?? "")
            : undefined);
        expect(contentKey, step.key).toBeTruthy();
        const linked = new Set(context.skillIdsByContentKey.get(contentKey!) ?? []);
        for (const outcomeKey of step.learningOutcomeKeys) {
          for (const skillId of context.skillIdsByOutcomeKey.get(outcomeKey) ?? [])
            expect(linked, `${step.key}:${outcomeKey}:${skillId}`).toContain(skillId);
        }
      }
    };

    assertProgram(EDUCATION_V2_P1_A_PROGRAM, EDUCATION_V2_P1_A_LEARNING_OUTCOMES);
    assertProgram(EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM, CYCLE_V2_LEARNING_OUTCOMES);
    assertProgram(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM, CYCLE_3_LEARNING_OUTCOMES);
    assertProgram(
      EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
      EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sourceStations.map((station) => ({
        key: station.key,
        targetSkillCodes: station.skillCodes,
      })),
    );
    for (const program of EDUCATION_V2_P1_BCD_RELEASED_PROGRAMS)
      assertProgram(program, [program.learningOutcome]);
  });

  it("maps every Cycle 5–20 station skill target without inventing unknown codes", () => {
    const cycles = [
      ...EDUCATION_V2_P1_A_CYCLE_5_8,
      ...EDUCATION_V2_P1_A_CYCLE_9_12,
      ...EDUCATION_V2_P1_A_CYCLE_13_16,
      ...EDUCATION_V2_P1_A_CYCLE_17_20,
    ];
    const stations = cycles.flatMap((cycle) => cycle.sourceCycle.sourceStations);
    expect(stations).toHaveLength(80);
    for (const station of stations) {
      const mapped = mapCurriculumSkillCodesToStoredSkillCodes(station.skillCodes);
      expect(mapped.unmappedSkillCodes, station.key).toEqual([]);
      expect(mapped.storedSkillCodes.length, station.key).toBeGreaterThan(0);
    }
  });

  it("inserts only missing pairs with duplicate protection and becomes a no-op on retry", async () => {
    const rows = new Map([
      [JSON.stringify([expected[0]!.contentId, expected[0]!.skillId]), expected[0]!],
    ]);
    let createCalls = 0;
    const store = {
      async findMany() {
        return [...rows.values()];
      },
      async createMany({ data, skipDuplicates }: { data: typeof expected; skipDuplicates: true }) {
        expect(skipDuplicates).toBe(true);
        createCalls += 1;
        let count = 0;
        for (const link of data) {
          const key = JSON.stringify([link.contentId, link.skillId]);
          if (!rows.has(key)) {
            rows.set(key, link);
            count += 1;
          }
        }
        return { count };
      },
    };

    expect(await ensureContentSkillLinks(store, expected)).toEqual({
      state: "COMPLETE",
      insertedCount: 2,
    });
    expect(await ensureContentSkillLinks(store, expected)).toEqual({
      state: "COMPLETE",
      insertedCount: 0,
    });
    expect(createCalls).toBe(1);
  });

  it("does not write when existing relations conflict with the source plan", async () => {
    let createCalls = 0;
    const store = {
      async findMany() {
        return [{ contentId: "content-a", skillId: "unexpected" }];
      },
      async createMany() {
        createCalls += 1;
        return { count: 0 };
      },
    };

    expect(await ensureContentSkillLinks(store, expected)).toEqual({
      state: "CONFLICT",
      insertedCount: 0,
    });
    expect(createCalls).toBe(0);
  });

  it("is used by every published P1 seed family without broad updates or deletes", async () => {
    const seedFiles = [
      "seed-education-v2-p1-a.ts",
      "seed-education-v2-p1-bcd.ts",
      "seed-education-v2-p1-a-cycle-v2.ts",
      "seed-education-v2-p1-a-cycle-3.ts",
      "seed-education-v2-p1-a-cycle-4.ts",
      "seed-education-v2-p1-a-cycle-5-8.ts",
    ];

    for (const file of seedFiles) {
      const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), "utf8");
      expect(source, file).toContain("ensureContentSkillLinks");
      expect(source, file).toContain("expectedContentSkillLinks(plans)");
      expect(source, file).toContain("inspectContentSkillLinks");
      expect(source, file).toContain("missingSkillLinkCount");
      expect(source, file).toContain(
        file.endsWith("cycle-5-8.ts")
          ? 'verifiedAction === "REPAIR_SKILL_LINKS"'
          : 'state === "SKILL_LINKS_MISSING"',
      );
      expect(source, file).toContain('state: "SKILL_LINKS_REPAIRED"');
      expect(source, file).not.toMatch(/contentSkill\.deleteMany|contentSkill\.updateMany/u);
    }
  });
});
