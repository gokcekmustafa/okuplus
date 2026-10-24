import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessOptionLengthQuality } from "../src/curriculum/option-length-quality.js";
import {
  EDUCATION_V2_P1_A_CYCLE_5_8,
  EDUCATION_V2_P1_A_CYCLE_5_8_SEQUENCES,
  educationV2P1ACycle5To8AnswerKey,
  isCompleteEducationV2P1ACycle5To8Source,
  p1ACycle5To8AssessmentId,
  p1ACycle5To8ContentVersionId,
  p1ACycle5To8QuestionVersionId,
  p1ACycle5To8TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_DECISIONS,
  EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_FINGERPRINT,
  EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_ID,
  educationV2P1ACycle5To8ProductionApproval,
  educationV2P1ACycle5To8ScopeSequences,
  isEducationV2P1ACycle5To8ProductionAssignmentEnabled,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-release.js";
import { educationV2P1ACycle5To8SeedAction } from "../src/curriculum/education-v2-p1-a-cycle-5-8-seed-policy.js";
import { parseTrainingExerciseVersionConfig } from "../src/modules/training/exercise-contract.js";
import { isCycle5To8PitrEvidenceValid } from "../scripts/production-cycle4-pitr-restore-evidence.js";
import {
  buildPlannedLearningRouteNodes,
  matchesLearningRouteGraph,
  nextLearningRouteCycle,
  learningRouteCycle,
} from "../src/curriculum/learning-route-catalog.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-5-8.yml", import.meta.url),
  "utf8",
);
const seeder = readFileSync(
  new URL("../scripts/seed-education-v2-p1-a-cycle-5-8.ts", import.meta.url),
  "utf8",
);

function graphFor(sequence: (typeof EDUCATION_V2_P1_A_CYCLE_5_8_SEQUENCES)[number]) {
  const cycle = EDUCATION_V2_P1_A_CYCLE_5_8.find((item) => item.sequence === sequence)!;
  const { program } = cycle;
  const stepIds = new Map(
    program.path.units.flatMap((unit) =>
      unit.steps.map((step) => [step.key, `test-cycle-${sequence}:${step.key}`] as const),
    ),
  );
  return {
    code: program.path.code,
    version: cycle.manifest.cycleVersion,
    units: program.path.units.map((unit) => ({
      code: unit.code,
      status: "PUBLISHED",
      steps: unit.steps.map((step, index) => ({
        id: stepIds.get(step.key)!,
        stableKey: `${program.programId}:${step.key}`,
        position: index + 1,
        type: step.type,
        status: "PUBLISHED",
        isActive: true,
        prerequisiteStepId: step.prerequisiteStepKeys?.[0]
          ? stepIds.get(step.prerequisiteStepKeys[0])!
          : null,
        completionRule: {},
        contentVersionId: step.contentKey
          ? p1ACycle5To8ContentVersionId(sequence, step.contentKey)
          : null,
        exerciseTemplateVersionId: step.exerciseKey
          ? p1ACycle5To8TemplateVersionId(sequence, step.exerciseKey)
          : null,
        assessmentId: step.assessmentKey
          ? p1ACycle5To8AssessmentId(sequence, step.assessmentKey)
          : null,
      })),
    })),
  };
}

describe("P1-A Cycles 5–8 versioned curriculum", () => {
  it("creates four complete five-step programs with 20 contents, exercises, 60 questions and four assessments", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_5_8).toHaveLength(4);
    const resourceIds: string[] = [];
    let totalContent = 0;
    let totalExercises = 0;
    let totalQuestions = 0;
    let totalAssessments = 0;

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_5_8) {
      const { sequence, sourceCycle, program, manifest } = cycle;
      const steps = program.path.units.flatMap((unit) => unit.steps);
      expect(sequence).toBeGreaterThanOrEqual(5);
      expect(sequence).toBeLessThanOrEqual(8);
      expect(sourceCycle.sourceStations).toHaveLength(5);
      expect(steps).toHaveLength(5);
      expect(program.content).toHaveLength(5);
      expect(program.exercises).toHaveLength(5);
      expect(program.assessments).toHaveLength(1);
      expect(
        program.exercises.reduce((count, exercise) => count + exercise.questions.length, 0),
      ).toBe(15);
      expect(manifest.steps.map((step) => step.order)).toEqual([1, 2, 3, 4, 5]);
      expect(manifest.steps.map((step) => step.prerequisiteKeys)).toEqual([
        [],
        [steps[0]!.key],
        [steps[1]!.key],
        [steps[2]!.key],
        [steps[3]!.key],
      ]);
      expect(manifest.resourceCatalog.contentVersions).toHaveLength(5);
      expect(manifest.resourceCatalog.exerciseVersions).toHaveLength(5);
      expect(manifest.resourceCatalog.assessmentVersions).toHaveLength(1);
      expect(manifest.resourceCatalog.questionVersionIds).toHaveLength(15);

      for (const [index, station] of sourceCycle.sourceStations.entries()) {
        const content = program.content[index]!;
        const exercise = program.exercises[index]!;
        expect(content.key).toBe(station.key);
        expect(content.body).toBe(station.text);
        expect(exercise.contentKey).toBe(station.key);
        expect(exercise.questions).toHaveLength(3);
        for (const question of station.questions) {
          const mapped = exercise.questions.find((item) => item.key === question.key);
          expect(mapped).toBeDefined();
          expect(mapped?.correctOptionId).toBe(question.correctOptionId);
          expect(mapped?.options).toEqual(question.options);
          expect(mapped?.options.map((option) => option.id)).toContain(mapped?.correctOptionId);
          expect(educationV2P1ACycle5To8AnswerKey(question).correctOptionIds).toEqual([
            question.correctOptionId,
          ]);
          const lengthQuality = assessOptionLengthQuality({
            options: question.options,
            correctOptionId: question.correctOptionId,
          });
          expect(lengthQuality?.clearOutlier, `${sequence}/${question.key}`).toBe(false);
          resourceIds.push(
            p1ACycle5To8QuestionVersionId(sequence, `${exercise.key}-${question.key}`),
          );
          totalQuestions += 1;
        }
        expect(parseTrainingExerciseVersionConfig(exercise.contract).scoring.mode).toBe(
          "DETERMINISTIC",
        );
        expect(exercise.contract.eligibility.requiresPublishedContent).toBe(true);
        expect(exercise.contract.eligibility.requiresPublishedQuestions).toBe(true);
        resourceIds.push(p1ACycle5To8ContentVersionId(sequence, content.key));
        resourceIds.push(p1ACycle5To8TemplateVersionId(sequence, exercise.key));
        totalContent += 1;
        totalExercises += 1;
      }
      const assessment = program.assessments[0]!;
      expect(assessment.templateExerciseKey).toBe(program.exercises.at(-1)?.key);
      expect(assessment.questionKeys).toEqual(
        program.exercises.at(-1)?.questions.map((item) => item.key),
      );
      resourceIds.push(p1ACycle5To8AssessmentId(sequence, assessment.key));
      totalAssessments += 1;
      expect(matchesLearningRouteGraph(graphFor(sequence))).toBe(true);
    }

    expect(new Set(resourceIds).size).toBe(resourceIds.length);
    expect({ totalContent, totalExercises, totalQuestions, totalAssessments }).toEqual({
      totalContent: 20,
      totalExercises: 20,
      totalQuestions: 60,
      totalAssessments: 4,
    });
  });

  it("approves only Cycle 5 and keeps later cycles locked pending separate owner release", () => {
    for (let sequence = 4; sequence < 8; sequence += 1) {
      const from =
        [...EDUCATION_V2_P1_A_CYCLE_5_8].find((cycle) => cycle.sequence === sequence)?.program.path
          .code ?? "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_4_G8_12";
      const to = learningRouteCycle(from);
      const next = nextLearningRouteCycle(from);
      expect(to).toBeTruthy();
      expect(next?.sequence).toBe(sequence + 1);
      expect(next?.manifest.steps).toHaveLength(5);
      expect(next?.publicationApproved()).toBe(sequence === 4);
    }
    expect(EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_DECISIONS).toEqual(
      [5, 6, 7, 8].map((sequence) => ({
        sequence,
        status: sequence === 5 ? "OWNER_RELEASE_APPROVED" : "OWNER_RELEASE_REQUIRED",
        explicitPublicationApproved: sequence === 5,
      })),
    );
    for (const sequence of [5, 6, 7, 8])
      expect(isEducationV2P1ACycle5To8ProductionAssignmentEnabled(sequence)).toBe(sequence === 5);
    expect(educationV2P1ACycle5To8ScopeSequences("CYCLE_5_ONLY")).toEqual([5]);
    expect(educationV2P1ACycle5To8ScopeSequences("CYCLES_5_TO_8")).toEqual([5, 6, 7, 8]);
    expect(educationV2P1ACycle5To8ProductionApproval("CYCLE_5_ONLY", "a".repeat(40))).toContain(
      "CYCLE_5_PRODUCTION_RELEASE_",
    );
    expect(educationV2P1ACycle5To8ProductionApproval("CYCLES_5_TO_8", "a".repeat(40))).toContain(
      "CYCLE_5_8_PRODUCTION_RELEASE_",
    );
    expect(typeof EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_FINGERPRINT).toBe("string");
    expect(EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/u);
    expect(EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_ID).toContain(
      EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_FINGERPRINT,
    );

    const planned = buildPlannedLearningRouteNodes({
      currentPathCode: "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_4_G8_12",
      visibleStationCount: 52,
      targetStationCount: 72,
    });
    const plannedCycle5To8 = planned.filter(
      ({ cycleSequence }) => cycleSequence !== null && cycleSequence >= 5 && cycleSequence <= 8,
    );
    expect(plannedCycle5To8).toHaveLength(20);
    expect(
      plannedCycle5To8.map(({ cycleSequence, stepOrder }) => [cycleSequence, stepOrder]),
    ).toEqual(
      Array.from({ length: 20 }, (_, index) => [5 + Math.floor(index / 5), (index % 5) + 1]),
    );
    expect(
      plannedCycle5To8.every(
        (node) => node.status === "locked" && node.availability === "UNAVAILABLE",
      ),
    ).toBe(true);
    expect(plannedCycle5To8.filter((node) => node.cycleSequence === 5)).toHaveLength(5);
    expect(
      plannedCycle5To8
        .filter((node) => node.cycleSequence === 5)
        .every((node) => node.planningStatus === "GRAPH_NOT_AVAILABLE"),
    ).toBe(true);
    expect(
      plannedCycle5To8
        .filter((node) => node.cycleSequence !== 5)
        .every((node) => node.planningStatus === "AUTHORED_UNRELEASED"),
    ).toBe(true);
    expect(
      plannedCycle5To8.every(
        (node) =>
          node.templateVersionId === null &&
          node.contentVersionId === null &&
          node.assessmentId === null,
      ),
    ).toBe(true);
  });

  it("keeps source provenance truthful: original Cycle 5 remains review-required", () => {
    const cycle5 = EDUCATION_V2_P1_A_CYCLE_5_8.find((cycle) => cycle.sequence === 5)!;
    expect(cycle5.sourceCycle.sourceVerifiedStationCount).toBe(0);
    expect(
      cycle5.sourceCycle.sourceStations.every(
        (station) =>
          station.contentOrigin === "ORIGINAL_AUTHORING" &&
          station.provenanceStatus === "REVIEW_REQUIRED",
      ),
    ).toBe(true);
    for (const cycle of EDUCATION_V2_P1_A_CYCLE_5_8.filter((item) => item.sequence >= 6)) {
      expect(cycle.sourceCycle.sourceVerifiedStationCount).toBe(5);
      expect(cycle.sourceCycle.sourceStations.every((station) => station.sourceEvidence?.url)).toBe(
        true,
      );
    }
  });

  it("keeps the Cycle 5 route question within the passage's stated evidence", () => {
    const cycle5 = EDUCATION_V2_P1_A_CYCLE_5_8.find((cycle) => cycle.sequence === 5)!;
    const station = cycle5.sourceCycle.sourceStations.find(
      (item) => item.category === "COMMON_STRATEGIES",
    )!;
    const question = station.questions.find((item) => item.key === "a5-strategy-3")!;

    expect(question.prompt).toBe("Ziyaretçiler metne göre nereden güvenle geçebildi?");
    expect(question.correct).toBe("Güzergâhın açık bölümünden");
    expect(station.text).toContain("ziyaretçiler açık bölümden güvenle geçebildi");
    expect(question.explanation).not.toContain("onarım alanının dışı");
  });

  it("editorially verifies all 15 original Cycle 5 answers against explicit passage evidence", () => {
    const cycle5 = EDUCATION_V2_P1_A_CYCLE_5_8.find((cycle) => cycle.sequence === 5)!;
    const stations = cycle5.sourceCycle.sourceStations;
    const expectedStations = [
      {
        category: "FAST_READING",
        difficulty: "FOUNDATION",
        skills: ["FAST_ATTENTION", "RC_DETAIL"],
      },
      {
        category: "READING_COMPREHENSION",
        difficulty: "INTERMEDIATE",
        skills: ["RC_MAIN_IDEA", "RC_DETAIL"],
      },
      {
        category: "COMMON_STRATEGIES",
        difficulty: "INTERMEDIATE",
        skills: ["RC_RELATION", "RC_CONNECTOR"],
      },
      {
        category: "INTEGRATED_PRACTICE",
        difficulty: "ADVANCED",
        skills: ["RC_DETAIL", "RC_INFERENCE", "RC_RELATION"],
      },
      {
        category: "MULTI_SKILL_ASSESSMENT",
        difficulty: "ADVANCED",
        skills: ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"],
      },
    ];
    const answerEvidence: Record<string, { answer: string; evidence: string }> = {
      "a5-fast-1": { answer: "Cuma 19.00'da", evidence: "cuma günü 19.00'da başlayacak" },
      "a5-fast-2": {
        answer: "Batı bahçesindeki danışma noktasında",
        evidence: "batı bahçesindeki danışma noktasında buluşacak",
      },
      "a5-fast-3": {
        answer: "Salon sunumuna dönüşecek",
        evidence: "Hava kapalı olursa gözlem salon sunumuna dönüşecek",
      },
      "a5-comp-1": {
        answer: "Eşyaları onarıp bakım yöntemlerini gösteriyor",
        evidence:
          "bozulan küçük ev eşyalarını onarıyor ve sahiplerine basit bakım yöntemlerini gösteriyor",
      },
      "a5-comp-2": {
        answer: "Eşyaların onarılarak yeniden kullanılması",
        evidence: "kullanılabilir eşyalar atılmak yerine yeniden değerlendiriliyor",
      },
      "a5-comp-3": {
        answer: "Eşyaların onarılması ve bakımın öğrenilmesi",
        evidence: "onarıyor ve sahiplerine basit bakım yöntemlerini gösteriyor",
      },
      "a5-strategy-1": {
        answer: "Onarıma rağmen güzergâhın değişmediğini",
        evidence: "ancak yürüyüş güzergâhı bu hafta değişmedi",
      },
      "a5-strategy-2": {
        answer: "Çalışma alanına uyarı levhaları konması",
        evidence: "Çalışma alanının çevresine uyarı levhaları kondu",
      },
      "a5-strategy-3": {
        answer: "Güzergâhın açık bölümünden",
        evidence: "ziyaretçiler açık bölümden güvenle geçebildi",
      },
      "a5-integrated-1": {
        answer: "Pazartesi ve çarşamba",
        evidence: "pazartesi ve çarşamba günleri ölçüm yapıyor",
      },
      "a5-integrated-2": {
        answer: "Toprak kuruduğunda",
        evidence: "Bitkiler yalnızca toprak kuruduğunda sulanıyor",
      },
      "a5-integrated-3": {
        answer: "Pano kayıtlarını kullanarak",
        evidence: "gözlemlerini panodaki kayıtlarla paylaşacak",
      },
      "a5-assess-1": {
        answer: "Ses kayıtları ve tarihli fotoğraflar",
        evidence: "ses kayıtlarını ve tarihli fotoğrafları birlikte sergiliyor",
      },
      "a5-assess-2": {
        answer: "Tezgâh düzeninin zamanla değiştiğini",
        evidence: "tezgâh düzeninin yıllar içinde değiştiğini görebiliyor",
      },
      "a5-assess-3": {
        answer: "Değişikliğin hangi kararla yapıldığı",
        evidence: "değişikliğin hangi kararla yapıldığını belirtmiyor",
      },
    };

    expect(stations).toHaveLength(5);
    expect(Object.keys(answerEvidence)).toHaveLength(15);
    for (const [index, station] of stations.entries()) {
      const expected = expectedStations[index]!;
      expect(station.category).toBe(expected.category);
      expect(station.difficulty).toBe(expected.difficulty);
      expect(station.skillCodes).toEqual(expected.skills);
      expect(station.prerequisiteKey).toBe(index === 0 ? null : stations[index - 1]!.key);
      expect(station.contentOrigin).toBe("ORIGINAL_AUTHORING");
      expect(station.provenanceStatus).toBe("REVIEW_REQUIRED");
      expect(station.questions).toHaveLength(3);

      for (const question of station.questions) {
        const expectedAnswer = answerEvidence[question.key];
        expect(expectedAnswer, question.key).toBeDefined();
        expect(question.correct, question.key).toBe(expectedAnswer!.answer);
        expect(station.text.toLocaleLowerCase("tr-TR"), question.key).toContain(
          expectedAnswer!.evidence.toLocaleLowerCase("tr-TR"),
        );
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options.map((option) => option.text)).size).toBe(4);
        expect(question.options.map((option) => option.id)).toContain(question.correctOptionId);
        expect(question.explanation.trim().length, question.key).toBeGreaterThan(0);
        expect(question.hint.trim().length, question.key).toBeGreaterThan(0);
      }
    }
    expect(cycle5.program.assessments[0]?.questionKeys).toEqual(
      stations[4]?.questions.map((question) => question.key),
    );
    expect(cycle5.program.assessments[0]?.config.completionMinimumScore).toBe(0.75);
    expect(
      cycle5.program.path.units[0]?.steps.map((step) => step.prerequisiteStepKeys ?? []),
    ).toEqual([[], [stations[0]!.key], [stations[1]!.key], [stations[2]!.key], [stations[3]!.key]]);
  });

  it("rejects missing/incomplete source and makes plan, repeat, create, and conflict actions explicit", () => {
    const cycle5 = EDUCATION_V2_P1_A_CYCLE_5_8[0]!;
    expect(isCompleteEducationV2P1ACycle5To8Source(undefined, 5)).toBe(false);
    expect(
      isCompleteEducationV2P1ACycle5To8Source(
        { ...cycle5.sourceCycle, sourceStations: cycle5.sourceCycle.sourceStations.slice(0, 4) },
        5,
      ),
    ).toBe(false);
    expect(educationV2P1ACycle5To8SeedAction("MISSING", true)).toBe("PLAN_ONLY");
    expect(educationV2P1ACycle5To8SeedAction("MISSING", false)).toBe("CREATE_MISSING");
    expect(educationV2P1ACycle5To8SeedAction("EXISTING", false)).toBe("REUSE_EXISTING");
    expect(educationV2P1ACycle5To8SeedAction("EXISTING", true)).toBe("PLAN_ONLY");
    expect(educationV2P1ACycle5To8SeedAction("CONFLICT", false)).toBe("STOP_CONFLICT");
  });

  it("requires protected dispatch, live target/PITR evidence, explicit APPLY approval and only seeds cycle graphs", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("default: PLAN_ONLY");
    expect(workflow).toContain("production-migration");
    expect(workflow).toContain("scripts/verify-cycle5-8-production-migration-gate.ts");
    expect(workflow).toContain("CYCLE58_OPERATION: ${{ inputs.operation }}");
    expect(workflow).toContain('CYCLE58_SEQUENCES="5"');
    expect(workflow).toContain('CYCLE58_SEQUENCES="5 6 7 8"');
    expect(workflow.indexOf("Revalidate production target and migration policy")).toBeLessThan(
      workflow.indexOf("Run read-only plan for selected Cycle 5–8 graph scope"),
    );
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).toContain("secrets.NEON_API_KEY");
    expect(workflow).toContain("production_editorial_approval");
    expect(workflow).toContain("graph_scope:");
    expect(workflow).toContain("default: CYCLE_5_ONLY");
    expect(workflow).toContain("production-cycle4-pitr-restore-evidence.ts");
    expect(workflow).toContain("CYCLE_PITR_SCOPE: cycle5-8");
    expect(workflow.indexOf("Enforce Cycle 5–8 PITR evidence")).toBeLessThan(
      workflow.indexOf("Apply only selected Cycle 5–8 graph scope"),
    );
    expect(workflow).toContain("refs/heads/master");
    expect(workflow).toContain("CYCLE58_SEQUENCE");
    expect(workflow).toContain("MIGRATIONS=NOT_RUN");
    expect(workflow).toContain("CYCLE58_GRAPH_SCOPE");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(seeder).toContain("isCycle5To8PitrEvidenceValid");
    expect(seeder).toContain('action === "STOP_CONFLICT"');
    expect(seeder.indexOf("if (!dryRun) assertPitrRestoreEvidence();")).toBeLessThan(
      seeder.indexOf("const prisma = new PrismaClient("),
    );
    expect(
      isCycle5To8PitrEvidenceValid(undefined, {
        runId: "123456",
        runAttempt: "1",
        sha: "1".repeat(40),
        database: "oku_plus",
        role: "oku_app",
        port: "5432",
        scope: "cycle5-8",
        graphScope: "CYCLE_5_ONLY",
      }),
    ).toBe(false);
    expect(seeder).not.toMatch(
      /tx\.(?:student|learningPathAssignment|studentLearningProgress)\.(?:create|createMany|update|updateMany|delete|deleteMany)/u,
    );
    expect(seeder).not.toMatch(
      /prisma\.(?:student|learningPathAssignment|studentLearningProgress)\.(?:create|createMany|update|updateMany|delete|deleteMany)/u,
    );
  });
});
