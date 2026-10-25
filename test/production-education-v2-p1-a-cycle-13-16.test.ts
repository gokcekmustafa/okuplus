import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessOptionLengthQuality } from "../src/curriculum/option-length-quality.js";
import {
  EDUCATION_V2_P1_A_CYCLE_13_16,
  EDUCATION_V2_P1_A_CYCLE_13_16_SEQUENCES,
  getEducationV2P1ACycle,
  p1ACycle5To8AssessmentId,
  p1ACycle5To8ContentVersionId,
  p1ACycle5To8QuestionVersionId,
  p1ACycle5To8TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_DECISIONS,
  EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_FINGERPRINT,
  EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_ID,
  educationV2P1ACycle13To16ProductionApproval,
  isEducationV2P1ACycle13To16ProductionAssignmentEnabled,
} from "../src/curriculum/education-v2-p1-a-cycle-13-16-release.js";
import { isEducationV2P1ACycle5To8SeedRequestAuthorized } from "../src/curriculum/education-v2-p1-a-cycle-5-8-seed-policy.js";
import { educationV2P1ACycle5To8ScopeSequences } from "../src/curriculum/education-v2-p1-a-cycle-5-8-release.js";
import { EDUCATION_V2_P1_800_DRAFT_CYCLES } from "../src/curriculum/education-v2-p1-800-draft-cycles.js";
import {
  CYCLE4_PITR_EXPECTED_RETENTION_SECONDS,
  CYCLE4_PITR_PROJECT_ID,
  CYCLE4_PITR_SOURCE_BRANCH_ID,
  CYCLE4_PITR_REQUIRED_TABLES,
  cycle4PitrCompareSchemaEndpoint,
  isCycle13To16PitrEvidenceValid,
} from "../scripts/production-cycle4-pitr-restore-evidence.js";
import {
  LEARNING_ROUTE_CYCLES,
  buildPlannedLearningRouteNodes,
  matchesLearningRouteGraph,
  nextLearningRouteCycle,
} from "../src/curriculum/learning-route-catalog.js";
import { parseTrainingExerciseVersionConfig } from "../src/modules/training/exercise-contract.js";
import { validateCycle13To16ReadOnlyPlanReport } from "../scripts/verify-cycle13-16-plan-report.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-13-16.yml", import.meta.url),
  "utf8",
);

const evidenceByQuestion: Record<string, { answer: string; evidence: string }> = {
  "a13-climate-1": {
    answer: "Deniz seviyesi ve buzullar",
    evidence: "deniz seviyesi değişimi ve buzulların küçülmesi",
  },
  "a13-climate-2": {
    answer: "Uzun dönemli ölçümün yerini tutmaz",
    evidence: "İklim eğilimleri uzun yıllara yayılan ölçümler",
  },
  "a13-climate-3": {
    answer: "Kanıtları birlikte değerlendirmek",
    evidence: "Araştırmacılar bu kanıtları birlikte değerlendirir",
  },
  "a13-eclipse-1": {
    answer: "Dünya ile Güneş arasına",
    evidence: "Ay, Dünya ile Güneş arasına girdiğinde",
  },
  "a13-eclipse-2": { answer: "Ay'ın üzerine", evidence: "Dünya'nın gölgesi Ay'a ulaşır" },
  "a13-eclipse-3": {
    answer: "Yörüngelerin her zaman hizalanmamasına",
    evidence: "yörüngelerin her zaman aynı düzlemde hizalanmamasıdır",
  },
  "a13-season-1": {
    answer: "Eksen eğikliği ve dolanımla",
    evidence: "eksen eğikliğiyle birlikte dolanmasıdır",
  },
  "a13-season-2": {
    answer: "Daha az doğrudan ışık alır",
    evidence: "Güney Yarım Küre daha az doğrudan ışık alır",
  },
  "a13-season-3": {
    answer: "Yarım kürelerdeki durum tersine döner",
    evidence: "Altı ay sonra durum tersine döner",
  },
  "a13-balloon-1": {
    answer: "Sensörlerle",
    evidence: "Sensörler sıcaklık, basınç ve nem değerlerini kaydeder",
  },
  "a13-balloon-2": {
    answer: "Cihazın konumu izlenerek",
    evidence: "cihazın konumunun izlenmesiyle hesaplanabilir",
  },
  "a13-balloon-3": {
    answer: "Uydu gözlemleriyle birleştirilir",
    evidence: "uydu gözlemleriyle birleştirilerek hava tahminlerinde",
  },
  "a13-planet-1": {
    answer: "Genç yıldızların çevresindeki disklerde",
    evidence: "Genç yıldızların çevresinde gaz ve tozdan oluşan diskler",
  },
  "a13-planet-2": {
    answer: "Kaya parçalarının birleşmesini kolaylaştırması",
    evidence: "parçaların bir araya toplanmasını kolaylaştırabileceğini",
  },
  "a13-planet-3": {
    answer: "Her diskte aynı koşullar garanti değildir",
    evidence: "her diskte aynı koşulların bulunduğunu",
  },
  "a14-moon-1": { answer: "27,3 gün", evidence: "yaklaşık 27,3 günde tamamlar" },
  "a14-moon-2": { answer: "29,5 gün", evidence: "aynı evrede yeniden görülmesi yaklaşık 29,5 gün" },
  "a14-moon-3": {
    answer: "Aydınlık bölümün görünen payı değişir",
    evidence: "aydınlık bölümün farklı miktarlarını görürüz",
  },
  "a14-earth-1": { answer: "Manto", evidence: "kabuk, manto, dış çekirdek ve iç çekirdek" },
  "a14-earth-2": { answer: "Dış çekirdek", evidence: "dış çekirdek sıvı metallerden" },
  "a14-earth-3": {
    answer: "Dünya'nın manyetik alanıyla",
    evidence: "Dış çekirdekteki hareketlerin Dünya'nın manyetik alanına katkı verdiği",
  },
  "a14-rock-1": { answer: "Meteor", evidence: "gökyüzünde görülen bu olay meteor diye anılır" },
  "a14-rock-2": {
    answer: "Atmosferde görülen ışık olayını",
    evidence: "gökyüzünde görülen bu olay meteor diye anılır",
  },
  "a14-rock-3": {
    answer: "Meteorit",
    evidence: "yeryüzüne ulaşırsa geriye kalan gök taşı meteorit",
  },
  "a14-sun-1": {
    answer: "Nükleer füzyon",
    evidence: "bu nükleer füzyon sırasında enerji açığa çıkar",
  },
  "a14-sun-2": {
    answer: "Işığı elektrik enerjisine dönüştürür",
    evidence: "güneş hücreleriyle elektrik enerjisine dönüştürülebilir",
  },
  "a14-sun-3": {
    answer: "Kaynak, taşınma biçimi ve dönüştürücü",
    evidence: "kaynağını, taşındığı biçimi ve onu başka biçime çeviren aracı",
  },
  "a14-activity-1": {
    answer: "Bir bölümünü yönlendirebilir",
    evidence: "manyetik alanı bu parçacıkların bir bölümünü yönlendirir",
  },
  "a14-activity-2": {
    answer: "Sokak aydınlatması",
    evidence: "uydu sistemlerini, radyo iletişimini veya elektrik altyapısını",
  },
  "a14-activity-3": {
    answer: "Etki olay ve koruma koşullarına bağlıdır",
    evidence: "etkinin büyüklüğü olayın gücüne, yönüne ve sistemlerin korunma düzeyine bağlıdır",
  },
  "a15-tardigrade-1": { answer: "Nemli yosundan", evidence: "nemli yosun örneği toplamayı seçti" },
  "a15-tardigrade-2": { answer: "İnce bir su tabakası", evidence: "ince bir su tabakası gerekir" },
  "a15-tardigrade-3": {
    answer: "Bölgede su ayısı olmadığını",
    evidence: "çevrede hiç su ayısı olmadığına tek başına kanıt sayılmaz",
  },
  "a15-plant-1": {
    answer: "Uzay istasyonunda",
    evidence: "Uluslararası Uzay İstasyonu'nda yetiştirilen",
  },
  "a15-plant-2": {
    answer: "30 bin genin",
    evidence: "yaklaşık 30 bin genin etkinliği ölçülecekti",
  },
  "a15-plant-3": {
    answer: "Genlerin ne ölçüde etkin olduğunu",
    evidence: "hangi genlerin ne ölçüde etkin olduğunu araştırır",
  },
  "a15-plan-1": { answer: "Ocak 2024'te", evidence: "Ocak 2024'te yayımlanan bir yazı" },
  "a15-plan-2": {
    answer: "Bitkilerin tuz stresine yanıtını",
    evidence: "bitkilerin zayıf yer çekimi koşullarında tuz stresine nasıl yanıt verdiğini",
  },
  "a15-plan-3": {
    answer: "Deneylerin o sırada planlandığını",
    evidence: "bunların o aşamada deney hedefleri olduğunu gösterir",
  },
  "a15-night-1": {
    answer: "Daha sıcak olabilir",
    evidence: "yüzeye yakın hava, üst katmanlardan daha sıcak olabilir",
  },
  "a15-night-2": {
    answer: "Yüzey havası üstten daha soğukken",
    evidence: "yüzeye yakın hava üst katmanlardan daha soğuk olduğunda",
  },
  "a15-night-3": {
    answer: "Sesin yere doğru bükülmesiyle",
    evidence:
      "ses yere doğru bükülebilir. Böylece uzaktaki bir kaynaktan gelen ses daha iyi duyulabilir",
  },
  "a15-water-1": {
    answer: "Küçük canlı ışığı kısmen engelleyebilir",
    evidence: "küçük bir canlı, ışığın bir bölümünü engelleyerek görüntüde gölge oluşturabilir",
  },
  "a15-water-2": {
    answer: "Örnekte küçük canlılar bulunabileceğine",
    evidence: "örnekte mikroskobik canlı ya da parçacık bulunabileceğine dair ipucu verir",
  },
  "a15-water-3": {
    answer: "Suyun güvenle içilebileceği kararını",
    evidence: "suyun içilebilir ve sağlıklı olduğuna karar verilemez",
  },
  "a16-migration-1": {
    answer: "Bulunduğu yöne",
    evidence: "Gölge, Güneş’in bulunduğu yönün tersini gösterir",
  },
  "a16-migration-2": {
    answer: "Doğuyu",
    evidence: "daha sonra alınan ikinci işaret doğuyu belirlemeye yardım eder",
  },
  "a16-migration-3": {
    answer: "Doğrultular tam çakışmayabilir",
    evidence: "manyetik pusulanın gösterdiği doğrultuyla tam olarak çakışmayabilir",
  },
  "a16-flight-1": {
    answer: "Bir engele çarptığında",
    evidence: "Dalga bir engele çarpınca yankı olarak geri döner",
  },
  "a16-flight-2": {
    answer: "Alt çeneden",
    evidence: "titreşimleri alt çeneleriyle algılayıp iç kulağa iletir",
  },
  "a16-flight-3": {
    answer: "Nesnenin varlığı ve uzaklığı",
    evidence: "nesnenin varlığı ve uzaklığı hakkında bilgi verir",
  },
  "a16-soil-1": {
    answer: "Canlı kalıntıları ayrışınca",
    evidence:
      "ölü bitki ve diğer canlı kalıntılarını daha basit maddelere dönüştürür; bu karışım humusu oluşturur",
  },
  "a16-soil-2": {
    answer: "Humusun daha fazla bulunması",
    evidence: "Humus üst katmanlarda daha fazla bulunduğunda toprak koyu kahverengi",
  },
  "a16-soil-3": {
    answer: "Humus miktarının azalmasıyla",
    evidence: "Derinlerde humus azalınca minerallerin renkleri daha belirgin",
  },
  "a16-ecosystem-1": {
    answer: "Daha fazla karbondioksit aldığı",
    evidence: "bitkilerin fotosentezle daha fazla karbondioksit aldığı",
  },
  "a16-ecosystem-2": {
    answer: "Eğilimin süresi bilinmiyor",
    evidence: "eğilimin ne kadar süreceğinin bilinmediğini",
  },
  "a16-ecosystem-3": {
    answer: "Bitkilerin iklim sorununu çözdüğünü",
    evidence: "iklim değişikliğini çözdüğünü göstermez",
  },
  "a16-sleep-1": {
    answer: "Bazı hücre grupları yeniden etkinleşince",
    evidence: "anılar, bazı grupların yeniden etkinleşmesiyle oluşur",
  },
  "a16-sleep-2": {
    answer: "Hipokampus hacmi ve bellek becerileri arttı",
    evidence: "hipokampus hacminin artabildiğini ve hafızaya dayalı becerilerin geliştiğini",
  },
  "a16-sleep-3": {
    answer: "Olası açıklama olarak, kesin neden değil",
    evidence: "kaynak bunu kesinleşmiş bir neden olarak sunmaz",
  },
};

function graphFor(sequence: number) {
  const cycle = getEducationV2P1ACycle(sequence)!;
  const { program, manifest } = cycle;
  return {
    code: program.path.code,
    version: manifest.cycleVersion,
    units: program.path.units.map((unit) => ({
      code: unit.code,
      status: "PUBLISHED",
      steps: unit.steps.map((step, index) => ({
        id: `test-cycle-${sequence}:${step.key}`,
        stableKey: `${program.programId}:${step.key}`,
        position: index + 1,
        type: step.type,
        status: "PUBLISHED",
        isActive: true,
        prerequisiteStepId: step.prerequisiteStepKeys?.[0]
          ? `test-cycle-${sequence}:${step.prerequisiteStepKeys[0]}`
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

describe("P1-A source-verified Cycles 13–16 package", () => {
  it("accepts a read-only plan that identifies only missing source skill relations", () => {
    const report = {
      status: "PASS",
      mode: "DRY_RUN",
      immutableReleaseId: "release-13",
      productionReleaseId: "release-13",
      expectedSourceCommit: "a".repeat(40),
      productionReleaseCommit: "a".repeat(40),
      sequence: 13,
      state: "SKILL_LINKS_MISSING",
      dbChanged: false,
      stepCount: 5,
      contentCount: 5,
      exerciseCount: 5,
      questionCount: 15,
      assessmentCount: 1,
    };
    const expected = { sequence: 13 as const, releaseId: "release-13", commit: "a".repeat(40) };

    expect(validateCycle13To16ReadOnlyPlanReport(report, expected)).toEqual({
      valid: true,
      state: "SKILL_LINKS_MISSING",
    });
    expect(validateCycle13To16ReadOnlyPlanReport({ ...report, dbChanged: true }, expected)).toEqual(
      { valid: false, reason: "PLAN_REPORTED_WRITE" },
    );
    expect(
      validateCycle13To16ReadOnlyPlanReport({ ...report, state: "CONFLICT" }, expected),
    ).toEqual({ valid: false, reason: "GRAPH_STATE_INVALID" });
  });

  it("binds 20 evidence-backed stations and 60 distinct questions to their versioned programs", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_13_16_SEQUENCES).toEqual([13, 14, 15, 16]);
    expect(EDUCATION_V2_P1_A_CYCLE_13_16).toHaveLength(4);
    const versionIds: string[] = [];
    const sourceUrls = new Set<string>();
    const questionKeys = new Set<string>();
    const answerPositions = [0, 0, 0, 0];

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_13_16) {
      const { sequence, sourceCycle, program, manifest } = cycle;
      const steps = program.path.units.flatMap((unit) => unit.steps);
      expect(sourceCycle.sourceVerifiedStationCount).toBe(5);
      expect(sourceCycle.sourceStations).toHaveLength(5);
      expect(steps).toHaveLength(5);
      expect(program.content).toHaveLength(5);
      expect(program.exercises).toHaveLength(5);
      expect(program.assessments).toHaveLength(1);
      expect(manifest.steps.map((step) => step.order)).toEqual([1, 2, 3, 4, 5]);
      expect(manifest.steps.map((step) => step.prerequisiteKeys)).toEqual([
        [],
        [steps[0]!.key],
        [steps[1]!.key],
        [steps[2]!.key],
        [steps[3]!.key],
      ]);
      expect(manifest.resourceCatalog.questionVersionIds).toHaveLength(15);
      expect(matchesLearningRouteGraph(graphFor(sequence))).toBe(true);

      for (const [index, station] of sourceCycle.sourceStations.entries()) {
        expect(station.provenanceStatus).toBe("SOURCE_VERIFIED");
        expect(station.sourceEvidence?.url).toMatch(/^https:\/\//u);
        expect(sourceUrls.has(station.sourceEvidence!.url)).toBe(false);
        sourceUrls.add(station.sourceEvidence!.url);
        const content = program.content[index]!;
        const exercise = program.exercises[index]!;
        expect(content.body).toBe(station.text);
        expect(content.key).toBe(station.key);
        expect(exercise.contentKey).toBe(station.key);
        expect(exercise.questions).toHaveLength(3);
        expect(parseTrainingExerciseVersionConfig(exercise.contract).scoring.mode).toBe(
          "DETERMINISTIC",
        );
        expect(exercise.contract.eligibility.requiresPublishedContent).toBe(true);
        expect(exercise.contract.eligibility.requiresPublishedQuestions).toBe(true);
        versionIds.push(p1ACycle5To8ContentVersionId(sequence, content.key));
        versionIds.push(p1ACycle5To8TemplateVersionId(sequence, exercise.key));

        for (const question of station.questions) {
          const evidence = evidenceByQuestion[question.key];
          expect(evidence, question.key).toBeDefined();
          expect(
            question.options.find((option) => option.id === question.correctOptionId)?.text,
          ).toBe(evidence!.answer);
          expect(station.text.toLocaleLowerCase("tr-TR"), question.key).toContain(
            evidence!.evidence.toLocaleLowerCase("tr-TR"),
          );
          expect(questionKeys.has(question.key)).toBe(false);
          questionKeys.add(question.key);
          expect(question.options).toHaveLength(4);
          expect(new Set(question.options.map((option) => option.id)).size).toBe(4);
          expect(question.options.map((option) => option.id)).toContain(question.correctOptionId);
          expect(question.explanation.trim()).not.toBe("");
          expect(question.hint.trim()).not.toBe("");
          expect(
            assessOptionLengthQuality({
              options: question.options,
              correctOptionId: question.correctOptionId,
            })?.clearOutlier,
          ).toBe(false);
          answerPositions[
            question.options.findIndex((option) => option.id === question.correctOptionId)
          ]! += 1;
          versionIds.push(
            p1ACycle5To8QuestionVersionId(sequence, `${exercise.key}-${question.key}`),
          );
        }
      }
      const assessment = program.assessments[0]!;
      expect(assessment.templateExerciseKey).toBe(program.exercises.at(-1)?.key);
      expect(assessment.questionKeys).toEqual(
        program.exercises.at(-1)?.questions.map((question) => question.key),
      );
      expect(assessment.config.completionMinimumScore).toBe(0.75);
      versionIds.push(p1ACycle5To8AssessmentId(sequence, assessment.key));
    }
    expect(questionKeys.size).toBe(60);
    expect(Object.keys(evidenceByQuestion)).toHaveLength(60);
    expect(sourceUrls.size).toBe(20);
    expect(new Set(versionIds).size).toBe(versionIds.length);
    expect(answerPositions.every((count) => count >= 12 && count <= 18)).toBe(true);
  });

  it("uses the real Cycle 13 graph identities and holds future student steps until the graph is ready", () => {
    const cycle12 = LEARNING_ROUTE_CYCLES.find(
      (cycle) => cycle.routeFamily === "A" && cycle.sequence === 12,
    )!;
    const cycle13 = getEducationV2P1ACycle(13)!;
    const catalog13 = LEARNING_ROUTE_CYCLES.find(
      (cycle) => cycle.sequence === 13 && cycle.routeFamily === "A",
    )!;
    expect(catalog13.pathCode).toBe(cycle13.program.path.code);
    expect(catalog13.programId).toBe(cycle13.program.programId);
    expect(catalog13.manifest).toBe(cycle13.manifest);
    expect(matchesLearningRouteGraph(graphFor(13))).toBe(true);
    const mismatch = graphFor(13);
    mismatch.code = `${mismatch.code}-wrong`;
    expect(matchesLearningRouteGraph(mismatch)).toBe(false);

    const next = nextLearningRouteCycle(cycle12.pathCode);
    expect(next?.sequence).toBe(13);
    expect(next?.pathCode).toBe(cycle13.program.path.code);
    expect(next?.publicationApproved()).toBe(true);
    const planned = buildPlannedLearningRouteNodes({
      currentPathCode: cycle12.pathCode,
      visibleStationCount: 92,
      targetStationCount: 112,
    }).filter(
      (node) => node.cycleSequence !== null && node.cycleSequence >= 13 && node.cycleSequence <= 16,
    );
    expect(planned).toHaveLength(20);
    expect(planned.map((node) => [node.cycleSequence, node.stepOrder]).slice(0, 5)).toEqual(
      [1, 2, 3, 4, 5].map((step) => [13, step]),
    );
    expect(
      planned.every(
        (node) =>
          node.planningStatus === "GRAPH_NOT_AVAILABLE" &&
          node.status === "locked" &&
          node.availability === "UNAVAILABLE",
      ),
    ).toBe(true);
  });

  it("requires the exact release, owner approval, protected scope and same-run PITR evidence", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_DECISIONS).toEqual(
      [13, 14, 15, 16].map((sequence) => ({
        sequence,
        status: "OWNER_RELEASE_APPROVED",
        explicitPublicationApproved: true,
      })),
    );
    for (const sequence of [13, 14, 15, 16]) {
      expect(isEducationV2P1ACycle13To16ProductionAssignmentEnabled(sequence)).toBe(true);
    }
    expect(EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/u);
    expect(EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_ID).toContain(
      EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_FINGERPRINT,
    );
    const approval = educationV2P1ACycle13To16ProductionApproval("a".repeat(40));
    expect(approval).toContain(EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_FINGERPRINT.toUpperCase());
    expect(educationV2P1ACycle5To8ScopeSequences("CYCLES_13_TO_16")).toEqual([13, 14, 15, 16]);

    const request = {
      dryRun: false,
      operation: "APPLY",
      confirmation: "APPLY_EDUCATION_V2_P1_A_CYCLES_13_TO_16",
      graphScope: "CYCLES_13_TO_16" as const,
      productionApproval: approval,
      expectedProductionApproval: approval,
      protectedProductionWorkflow: true,
    };
    expect(isEducationV2P1ACycle5To8SeedRequestAuthorized(request)).toBe(true);
    expect(
      isEducationV2P1ACycle5To8SeedRequestAuthorized({
        ...request,
        protectedProductionWorkflow: false,
      }),
    ).toBe(false);
    expect(
      isEducationV2P1ACycle5To8SeedRequestAuthorized({ ...request, graphScope: "CYCLES_9_TO_12" }),
    ).toBe(false);
    expect(
      isEducationV2P1ACycle5To8SeedRequestAuthorized({ ...request, productionApproval: "" }),
    ).toBe(false);
    const nowMs = Date.now();
    const parentTimestamp = new Date(nowMs - 120_000).toISOString();
    const targetBranchId = "br-cycle13-16-test-restore";
    const expected = {
      runId: "12345",
      runAttempt: "1",
      sha: "a".repeat(40),
      database: "approved-db",
      role: "approved-role",
      port: "5432",
      scope: "cycle13-16" as const,
      graphScope: "CYCLES_13_TO_16" as const,
      nowMs,
    };
    const evidence = {
      status: "PASS",
      schemaVersion: 6,
      pitrScope: "cycle13-16",
      graphScope: "CYCLES_13_TO_16",
      projectId: CYCLE4_PITR_PROJECT_ID,
      sourceBranchId: CYCLE4_PITR_SOURCE_BRANCH_ID,
      historyRetentionSeconds: CYCLE4_PITR_EXPECTED_RETENTION_SECONDS,
      productionTargetIdentity: "PASS",
      workflowRunId: expected.runId,
      workflowRunAttempt: expected.runAttempt,
      sourceCommit: expected.sha,
      productionDatabaseWrites: false,
      productionBranchMutated: false,
      studentDataQueried: false,
      studentProgressChanged: false,
      parentTimestamp,
      requestedParentTimestamp: parentTimestamp,
      sourceBranch: {
        id: CYCLE4_PITR_SOURCE_BRANCH_ID,
        name: "production-source",
        projectId: CYCLE4_PITR_PROJECT_ID,
        default: true,
      },
      targetBranch: {
        id: targetBranchId,
        projectId: CYCLE4_PITR_PROJECT_ID,
        parentId: CYCLE4_PITR_SOURCE_BRANCH_ID,
        parentTimestamp,
        default: false,
        state: "ready",
        annotationMatchesRun: true,
        endpointBranchId: targetBranchId,
        endpointId: "ep-isolated-test",
        endpointType: "read_write",
        endpointState: "active",
      },
      schemaComparison: {
        result: "PASS",
        method: "NEON_COMPARE_SCHEMA_API",
        endpoint: cycle4PitrCompareSchemaEndpoint(CYCLE4_PITR_PROJECT_ID, targetBranchId),
        httpStatus: 200,
        baseBranchId: CYCLE4_PITR_SOURCE_BRANCH_ID,
        targetBranchId,
        database: expected.database,
        baseTimestamp: parentTimestamp,
        diffIsEmpty: true,
        matches: true,
      },
      dataChecks: {
        result: "PASS",
        queryMode: "READ_ONLY",
        studentRecordsQueried: false,
        questionTextOrAnswerKeysQueried: false,
        requiredTables: [...CYCLE4_PITR_REQUIRED_TABLES],
        missingTables: [],
        aggregateCounts: {
          learningPaths: 1,
          learningUnits: 1,
          learningSteps: 1,
          content: 1,
          contentVersions: 1,
          exerciseTemplates: 1,
          exerciseTemplateVersions: 1,
          questions: 1,
          questionVersions: 1,
          assessments: 1,
          successfulMigrations: 1,
        },
      },
      restoredDatabaseIdentity: {
        result: "PASS",
        transactionReadOnly: true,
        database: expected.database,
        role: expected.role,
        port: expected.port,
        schema: "public",
        targetEndpointHostMatchedNeonApi: true,
      },
      productionSourceUnchanged: {
        result: "PASS",
        id: CYCLE4_PITR_SOURCE_BRANCH_ID,
        name: "production-source",
        default: true,
      },
    };
    expect(isCycle13To16PitrEvidenceValid(evidence, expected)).toBe(true);
    expect(isCycle13To16PitrEvidenceValid({ ...evidence, schemaVersion: 5 }, expected)).toBe(false);
    expect(isCycle13To16PitrEvidenceValid({ ...evidence, pitrScope: "cycle9-12" }, expected)).toBe(
      false,
    );

    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("CYCLE1316_GRAPH_SCOPE: CYCLES_13_TO_16");
    expect(workflow).toContain("scripts/verify-cycle13-16-pitr-evidence.ts");
    expect(workflow.indexOf("Enforce same-run Cycle 13–16 PITR evidence")).toBeLessThan(
      workflow.indexOf("Apply only missing Cycle 13–16 graphs"),
    );
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("prisma migrate deploy");
  });

  it("keeps source URLs unique and the previous 92 stations out of this release scope", () => {
    const counts = new Map<string, number>();
    for (const cycle of EDUCATION_V2_P1_800_DRAFT_CYCLES) {
      if (cycle.routeFamily !== "A") continue;
      for (const station of cycle.sourceStations) {
        if (station.sourceEvidence?.url) {
          counts.set(station.sourceEvidence.url, (counts.get(station.sourceEvidence.url) ?? 0) + 1);
        }
      }
    }
    for (const cycle of EDUCATION_V2_P1_A_CYCLE_13_16) {
      for (const station of cycle.sourceCycle.sourceStations) {
        expect(counts.get(station.sourceEvidence!.url)).toBe(1);
      }
    }
    expect(EDUCATION_V2_P1_A_CYCLE_13_16.flatMap((cycle) => cycle.manifest.steps)).toHaveLength(20);
    expect(
      EDUCATION_V2_P1_A_CYCLE_13_16.some((cycle) => cycle.sequence < 13 || cycle.sequence > 16),
    ).toBe(false);
  });
});
