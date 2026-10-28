import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessOptionLengthQuality } from "../src/curriculum/option-length-quality.js";
import {
  EDUCATION_V2_P1_A_CYCLE_29_32,
  EDUCATION_V2_P1_A_CYCLE_29_32_SEQUENCES,
  getEducationV2P1ACycle,
  p1ACycle5To8AssessmentId,
  p1ACycle5To8ContentVersionId,
  p1ACycle5To8QuestionVersionId,
  p1ACycle5To8TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_DECISIONS,
  EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_FINGERPRINT,
  EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_ID,
  educationV2P1ACycle29To32ProductionApproval,
  isEducationV2P1ACycle29To32ProductionAssignmentEnabled,
} from "../src/curriculum/education-v2-p1-a-cycle-29-32-release.js";
import { educationV2P1ACycle5To8ScopeSequences } from "../src/curriculum/education-v2-p1-a-cycle-5-8-release.js";
import { isEducationV2P1ACycle5To8SeedRequestAuthorized } from "../src/curriculum/education-v2-p1-a-cycle-5-8-seed-policy.js";
import {
  CYCLE4_PITR_EXPECTED_RETENTION_SECONDS,
  CYCLE4_PITR_PROJECT_ID,
  CYCLE4_PITR_REQUIRED_TABLES,
  CYCLE4_PITR_SOURCE_BRANCH_ID,
  cycle4PitrCompareSchemaEndpoint,
  isCycle29To32PitrEvidenceValid,
} from "../scripts/production-cycle4-pitr-restore-evidence.js";
import { validateCycle29To32ReadOnlyPlanReport } from "../scripts/verify-cycle29-32-plan-report.js";
import { buildEducationV2P0LearningCycleManifest } from "../src/curriculum/learning-cycle-manifest.js";
import {
  LEARNING_ROUTE_CYCLES,
  learningRouteCycle,
  matchesLearningRouteGraph,
  nextLearningRouteCycle,
} from "../src/curriculum/learning-route-catalog.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-29-32.yml", import.meta.url),
  "utf8",
);

const evidenceRows: readonly (readonly [string, string, string])[] = [
  ["a29-screen-1", "8–12 yaş", "8–12 yaşındaki çocuklarla"],
  [
    "a29-screen-2",
    "Dinlenme sırasında",
    "dinlenme sırasında beyin bölgeleri arasındaki bağlantıları",
  ],
  [
    "a29-screen-3",
    "Tek başına neden-sonuç göstermez",
    "tek başına ekranın bu farklılığa neden olduğunu kanıtlamaz",
  ],
  ["a29-gage-1", "1848'de", "1848'de geçirdiği ağır kazadan"],
  [
    "a29-gage-2",
    "Bazı beyin bölgeleri davranışla ilişkilidir",
    "beynin farklı bölgelerinin davranışla ilişkili olabileceğine dair erken kanıtlardan biri",
  ],
  [
    "a29-gage-3",
    "Beynin tüm işlevlerini açıklayamaz",
    "Tek bir kişinin yaşadıkları beynin bütün işlevlerini açıklayamaz",
  ],
  ["a29-listen-1", "Aynı hikâyeleri dinledi ve okudu", "aynı hikâyeleri önce dinledi, sonra okudu"],
  [
    "a29-listen-2",
    "Büyük ölçüde benzerdi",
    "beyin haritaları iki durumda da büyük ölçüde benzerdi",
  ],
  [
    "a29-listen-3",
    "Herkes iki yolla aynı biçimde öğrenir",
    "her kişinin her metni iki yolla aynı hızda anlayacağını ya da aynı biçimde hatırlayacağını kanıtlamaz",
  ],
  ["a29-exercise-1", "Öğrenme ve hafızayla", "öğrenme ve hafızayla ilişkili hipokampus"],
  [
    "a29-exercise-2",
    "Destekleyebilen bir süreç olarak",
    "sinir hücreleri ve bağlantılarının oluşumunu destekleyebilen",
  ],
  [
    "a29-exercise-3",
    "Her bireyde aynı değişimi kanıtlamaz",
    "her bireyde aynı değişimin kesinlikle oluşacağını tek başına göstermez",
  ],
  [
    "a29-glass-1",
    "Geçişi yüzeyde daha kademeli yapar",
    "ışığı kırma özelliği yüzey boyunca daha kademeli değişir",
  ],
  ["a29-glass-2", "Yansımanın azalması", "Bu geçiş yansımayı azaltabilir"],
  [
    "a29-glass-3",
    "Tam görünmezlik anlamına gelmez",
    "her koşulda bütünüyle görünmez bir cam bulunduğu anlamına gelmez",
  ],
  ["a30-stars-1", "Çekirdekteki hidrojen", "Yıldızlar önce çekirdeklerindeki hidrojeni"],
  [
    "a30-stars-2",
    "Hacminde büyük değişimler",
    "yıldızların hacminde büyük değişiklikler başlayabilir",
  ],
  ["a30-stars-3", "Hidrojen tüketiyor", "Güneş bugün hidrojen tüketiyor"],
  [
    "a30-climate-1",
    "Buzul ve deniz tabanı örneklerinden",
    "buzulları, deniz tabanı tortullarını, fosilleri ve kayaçları inceler",
  ],
  [
    "a30-climate-2",
    "Eski koşulları yorumlama ipucu",
    "eski sıcaklık ve yağış hakkında ipucu taşır",
  ],
  [
    "a30-climate-3",
    "Buharlaşma ve yoğunlaşmayla",
    "izotopların buharlaşma ve yoğunlaşma davranışını etkiler",
  ],
  ["a30-vision-1", "Kornea", "ışık önce korneaya ulaşır"],
  [
    "a30-vision-2",
    "İris",
    "iris, göz bebeğinin genişliğini değiştirerek içeri giren ışık miktarını düzenler",
  ],
  [
    "a30-vision-3",
    "Optik sinir aracılığıyla",
    "optik sinir bu bilgiyi beynin görsel işlem bölgelerine taşır",
  ],
  [
    "a30-clock-1",
    "Atomların geçişlerinde yaydığı frekansı",
    "atomların yaydığı ışığın frekansını zaman ölçümünde standart olarak kullanır",
  ],
  [
    "a30-clock-2",
    "Sezyum-133",
    "Sezyum-133 atomlarının belirli iki enerji düzeyi arasındaki geçiş",
  ],
  ["a30-clock-3", "Güvenilir zaman bilgisi", "sistem için güvenilir zaman sağlamaktır"],
  ["a30-sun-1", "Yüzde 99,86", "yaklaşık yüzde 99,86'sını oluşturur"],
  ["a30-sun-2", "Merkez çok daha sıcaktır", "merkez sıcaklığı 15 milyon °C'yi aşar"],
  [
    "a30-sun-3",
    "Daha kısa sürede tamamlar",
    "ekvator bir turu yaklaşık 25 günde, kutuplar 36 günde tamamlar",
  ],
  ["a31-robot-1", "1,5 volt", "1,5 voltluk motor ve pil"],
  [
    "a31-robot-2",
    "Motor ucundaki küçük ataş",
    "Motorun dönen ucuna takılan küçük ataş dönünce gövde titreşerek hareket eder",
  ],
  ["a31-robot-3", "Dönerek çevreye fırlayabilir", "gevşek kalırsa dönme sırasında fırlayabilir"],
  [
    "a31-polymer-1",
    "Zincirler kısalabilir",
    "tekrarlar zincirleri kısaltıp malzeme kalitesini düşürebilir",
  ],
  ["a31-polymer-2", "Yüzde 92’sini", "başlangıç ham maddesinin yüzde 92’sini geri elde etti"],
  [
    "a31-polymer-3",
    "Yaygın plastikler ve sanayi ölçeği için hazır olduğu gösterilmemiş",
    "yöntemin endüstriyel ölçekte hazır olduğunu göstermez",
  ],
  ["a31-sun-1", "Daha soğuk ve karanlık", "Güneş lekeleri çevresinden daha soğuk ve karanlıktır"],
  ["a31-sun-2", "Faküla", "Lekelerin yakınındaki fakülalar daha parlak bölgelerdir"],
  [
    "a31-sun-3",
    "Enlemler farklı hızlarda döner",
    "Güneş’in her yerde aynı hızla dönmediğini anlamaya yardım eder",
  ],
  [
    "a31-fault-1",
    "Azaldı",
    "fay üzerindeki sıkışma geriliminin 20–55 kilopaskal azaldığı hesaplandı",
  ],
  [
    "a31-fault-2",
    "Belirli koşullarda olası bir bağ",
    "Bulgular belirli jeolojik koşullara dayanır",
  ],
  [
    "a31-fault-3",
    "Buz yükünün erimeyle azalması",
    "Buz yükü azalınca fay üzerindeki sıkışma geriliminin",
  ],
  ["a31-mirror-1", "Çatalhöyük’te", "Çatalhöyük’te bulunmuş"],
  ["a31-mirror-2", "Obsidiyenden", "aynanın obsidiyenden"],
  [
    "a31-mirror-3",
    "Hayır, yalnızca erken kullanım kanıtıdır",
    "aynayı kimin icat ettiğini tek başına göstermez",
  ],
  ["a32-solar-1", "Sekiz", "sekiz gezegen"],
  ["a32-solar-2", "Beş", "resmen adlandırılmış beş cüce gezegen"],
  ["a32-solar-3", "Orion Kolu'nda", "Orion Kolu adı verilen bölümünde"],
  ["a32-acid-1", "Yüzde 30'unu", "karbondioksitin yaklaşık yüzde 30'unu emer"],
  [
    "a32-acid-2",
    "Kabuk ve mercan iskeletini",
    "kabuk ve mercan iskeleti yapımında kullanılan karbonat iyonları",
  ],
  ["a32-acid-3", "Deniz suyunun pH değeri", "deniz suyunun pH değerinin uzun süre içinde düşmesi"],
  ["a32-telemetry-1", "Hayvanın kalp atımını", "sıcaklık, kalp atımı, ses veya suyun tuzluluğu"],
  [
    "a32-telemetry-2",
    "Deniz \u015famand\u0131ras\u0131",
    "ara\u015ft\u0131rma gemilerine, \u015famand\u0131ralara ya da uydulara",
  ],
  [
    "a32-telemetry-3",
    "Canlıların çevresel değişime tepkisini",
    "çevresel değişimlere nasıl karşılık verdiğini",
  ],
  ["a32-fault-1", "650 mili", "San Andreas Fayı'nın uzunluğu 650 mili aşar"],
  ["a32-fault-2", "Kuzeybatıya", "kuzeybatıya doğru yılda yaklaşık iki inç"],
  ["a32-fault-3", "Gerilmenin sürtünmeyi aşması", "Gerilim sürtünmeyi aştığında kayma gerçekleşir"],
  ["a32-tide-1", "Deniz çekilince kıyı çukurunda", "deniz çekildiğinde kıyıdaki çukurlarda kalan"],
  ["a32-tide-2", "Plankton", "besin ve plankton havuza ulaşır"],
  ["a32-tide-3", "Düşük oksijen", "düşük oksijene ve kuş gibi avcılara maruz kalabilir"],
];
const evidenceByQuestion = Object.fromEntries(
  evidenceRows.map(([key, answer, evidence]) => [key, { answer, evidence }]),
) as Record<string, { answer: string; evidence: string }>;
const approvedSourceHosts = new Set([
  "bilimgenc.tubitak.gov.tr",
  "science.nasa.gov",
  "oceanservice.noaa.gov",
  "www.usgs.gov",
]);
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
        id: `cycle-${sequence}:${step.key}`,
        stableKey: `${program.programId}:${step.key}`,
        position: index + 1,
        type: step.type,
        status: "PUBLISHED",
        isActive: true,
        prerequisiteStepId: step.prerequisiteStepKeys?.[0]
          ? `cycle-${sequence}:${step.prerequisiteStepKeys[0]}`
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

describe("P1-A Cycles 29–32 (stations 173–192)", () => {
  it("checks all 20 source-backed stations and all 60 answers against their reading text", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_29_32_SEQUENCES).toEqual([29, 30, 31, 32]);
    expect(EDUCATION_V2_P1_A_CYCLE_29_32).toHaveLength(4);
    expect(Object.keys(evidenceByQuestion)).toHaveLength(60);

    const sourceUrls = new Set<string>();
    const questionKeys = new Set<string>();
    const versionIds: string[] = [];
    const answerPositions = [0, 0, 0, 0];

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_29_32) {
      const { sequence, sourceCycle, program, manifest } = cycle;
      const steps = program.path.units.flatMap((unit) => unit.steps);
      expect(sourceCycle.sourceVerifiedStationCount).toBe(5);
      expect(sourceCycle.sourceStations).toHaveLength(5);
      expect(sourceCycle.sourceStations.map((station) => station.category)).toEqual([
        "FAST_READING",
        "READING_COMPREHENSION",
        "COMMON_STRATEGIES",
        "INTEGRATED_PRACTICE",
        "MULTI_SKILL_ASSESSMENT",
      ]);
      expect(sourceCycle.sourceStations.map((station) => station.difficulty)).toEqual([
        "FOUNDATION",
        "INTERMEDIATE",
        "INTERMEDIATE",
        "ADVANCED",
        "ADVANCED",
      ]);
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
        expect(station.contentOrigin).toBe("SOURCE_ADAPTED");
        expect(station.sourceEvidence?.url).toBeDefined();
        expect(approvedSourceHosts.has(new URL(station.sourceEvidence!.url).hostname)).toBe(true);
        expect(station.sourceEvidence?.verifiedFacts.length).toBeGreaterThan(0);
        expect(station.sourceEvidence?.checkedOn).toBe("2026-10-18");
        expect(sourceUrls.has(station.sourceEvidence!.url)).toBe(false);
        sourceUrls.add(station.sourceEvidence!.url);

        const content = program.content[index]!;
        const exercise = program.exercises[index]!;
        expect(content.body).toBe(station.text);
        expect(content.title).toBe(station.textTitle);
        expect(content.key).toBe(station.key);
        expect(exercise.contentKey).toBe(station.key);
        expect(exercise.questions).toHaveLength(3);
        versionIds.push(p1ACycle5To8ContentVersionId(sequence, content.key));
        versionIds.push(p1ACycle5To8TemplateVersionId(sequence, exercise.key));

        for (const sourceQuestion of station.questions) {
          const expected = evidenceByQuestion[sourceQuestion.key];
          expect(expected, sourceQuestion.key).toBeDefined();
          const question = exercise.questions.find(
            (candidate) => candidate.key === sourceQuestion.key,
          );
          expect(question, sourceQuestion.key).toBeDefined();
          const correct = question!.options.find(
            (option) => option.id === question!.correctOptionId,
          );
          expect(correct?.text, sourceQuestion.key).toBe(expected!.answer);
          expect(station.text.toLocaleLowerCase("tr-TR"), sourceQuestion.key).toContain(
            expected!.evidence.toLocaleLowerCase("tr-TR"),
          );
          expect(question!.prompt.trim(), sourceQuestion.key).not.toBe("");
          expect(question!.explanation.trim(), sourceQuestion.key).not.toBe("");
          expect(question!.hint.trim(), sourceQuestion.key).not.toBe("");
          expect(question!.options, sourceQuestion.key).toHaveLength(4);
          expect(new Set(question!.options.map((option) => option.id)).size).toBe(4);
          expect(new Set(question!.options.map((option) => option.text)).size).toBe(4);
          expect(question!.options.map((option) => option.id)).toContain(question!.correctOptionId);
          expect(assessOptionLengthQuality(question!)?.clearOutlier, sourceQuestion.key).toBe(
            false,
          );
          questionKeys.add(sourceQuestion.key);
          answerPositions[
            question!.options.findIndex((option) => option.id === question!.correctOptionId)
          ]! += 1;
          versionIds.push(
            p1ACycle5To8QuestionVersionId(sequence, `${exercise.key}-${question!.key}`),
          );
        }
      }

      const assessment = program.assessments[0]!;
      expect(assessment.templateExerciseKey).toBe(program.exercises.at(-1)?.key);
      expect(assessment.questionKeys).toEqual(
        program.exercises.at(-1)?.questions.map((question) => question.key),
      );
      expect(assessment.config).toMatchObject({
        questionCount: 3,
        minimumScorableCount: 3,
        minimumAnsweredCount: 3,
        completionMinimumScore: 0.75,
      });
      versionIds.push(p1ACycle5To8AssessmentId(sequence, assessment.key));
    }

    expect(questionKeys.size).toBe(60);
    expect(sourceUrls.size).toBe(20);
    expect(new Set(versionIds).size).toBe(versionIds.length);
    expect(versionIds).toHaveLength(104);
    expect(answerPositions.every((count) => count >= 13 && count <= 17)).toBe(true);
  });

  it("links the exact 173–192 graph after Cycle 28 and keeps Cycle 33 unreleased", () => {
    const prior = learningRouteCycle("EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_28_G8_12");
    expect(prior).toBeDefined();
    expect(nextLearningRouteCycle(prior!.pathCode)?.sequence).toBe(29);
    const routes = LEARNING_ROUTE_CYCLES.filter((route) => route.routeFamily === "A");
    const p0StepCount = buildEducationV2P0LearningCycleManifest().steps.length;
    const stepsBefore29 = routes
      .filter((route) => route.sequence < 29)
      .reduce((count, route) => count + route.manifest.steps.length, p0StepCount);
    expect(stepsBefore29).toBe(172);

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_29_32) {
      const route = learningRouteCycle(cycle.program.path.code);
      expect(route?.programId).toBe(cycle.program.programId);
      expect(route?.manifest).toBe(cycle.manifest);
      expect(route?.publicationApproved()).toBe(true);
      expect(route?.authoringStatus).toBe("OWNER_RELEASE_APPROVED");
      expect(matchesLearningRouteGraph(graphFor(cycle.sequence))).toBe(true);
      expect(nextLearningRouteCycle(cycle.program.path.code)?.sequence).toBe(cycle.sequence + 1);
    }
    const cycle33 = LEARNING_ROUTE_CYCLES.find(
      (route) => route.routeFamily === "A" && route.sequence === 33,
    );
    expect(cycle33?.publicationApproved()).toBe(false);
  });

  it("uses a separate content-addressed release and enables only Cycles 29–32", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_DECISIONS).toEqual(
      [29, 30, 31, 32].map((sequence) => ({
        sequence,
        status: "OWNER_RELEASE_APPROVED",
        explicitPublicationApproved: true,
      })),
    );
    expect(EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/u);
    expect(EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_ID).toContain(
      EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_FINGERPRINT,
    );
    for (const sequence of [29, 30, 31, 32]) {
      expect(isEducationV2P1ACycle29To32ProductionAssignmentEnabled(sequence)).toBe(true);
    }
    for (const sequence of [28, 33]) {
      expect(isEducationV2P1ACycle29To32ProductionAssignmentEnabled(sequence)).toBe(false);
    }
    expect(educationV2P1ACycle29To32ProductionApproval("a".repeat(40))).toContain(
      EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_FINGERPRINT.toUpperCase(),
    );
  });

  it("authorizes only the exact read-only and protected graph scope", () => {
    expect(educationV2P1ACycle5To8ScopeSequences("CYCLES_29_TO_32")).toEqual([29, 30, 31, 32]);
    const request = {
      dryRun: true,
      operation: "PLAN_ONLY",
      confirmation: "PLAN_EDUCATION_V2_P1_A_CYCLES_29_TO_32",
      graphScope: "CYCLES_29_TO_32" as const,
      productionApproval: undefined,
      expectedProductionApproval: educationV2P1ACycle29To32ProductionApproval("a".repeat(40)),
      protectedProductionWorkflow: true,
    };
    expect(isEducationV2P1ACycle5To8SeedRequestAuthorized(request)).toBe(true);
    expect(isEducationV2P1ACycle5To8SeedRequestAuthorized({ ...request, dryRun: false })).toBe(
      false,
    );
    expect(
      isEducationV2P1ACycle5To8SeedRequestAuthorized({ ...request, graphScope: "CYCLES_21_TO_24" }),
    ).toBe(false);
    const applyRequest = {
      ...request,
      dryRun: false,
      operation: "APPLY",
      confirmation: "APPLY_EDUCATION_V2_P1_A_CYCLES_29_TO_32",
      productionApproval: request.expectedProductionApproval,
    };
    expect(isEducationV2P1ACycle5To8SeedRequestAuthorized(applyRequest)).toBe(true);
    expect(
      isEducationV2P1ACycle5To8SeedRequestAuthorized({
        ...applyRequest,
        protectedProductionWorkflow: false,
      }),
    ).toBe(false);
  });

  it("accepts only a no-write plan for the exact sequence, release, commit and graph counts", () => {
    const expected = {
      sequence: 29 as const,
      releaseId: EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_ID,
      commit: "a".repeat(40),
      graphScope: "CYCLES_29_TO_32" as const,
    };
    const report = {
      status: "PASS",
      mode: "DRY_RUN",
      immutableReleaseId: expected.releaseId,
      productionReleaseId: expected.releaseId,
      expectedSourceCommit: expected.commit,
      productionReleaseCommit: expected.commit,
      graphScope: expected.graphScope,
      sequence: 29,
      state: "MISSING",
      dbChanged: false,
      stepCount: 5,
      contentCount: 5,
      exerciseCount: 5,
      questionCount: 15,
      assessmentCount: 1,
    };
    expect(validateCycle29To32ReadOnlyPlanReport(report, expected)).toEqual({
      valid: true,
      state: "MISSING",
    });
    expect(validateCycle29To32ReadOnlyPlanReport({ ...report, dbChanged: true }, expected)).toEqual(
      { valid: false, reason: "PLAN_REPORTED_WRITE" },
    );
    expect(validateCycle29To32ReadOnlyPlanReport({ ...report, sequence: 30 }, expected)).toEqual({
      valid: false,
      reason: "SEQUENCE_MISMATCH",
    });
    expect(
      validateCycle29To32ReadOnlyPlanReport({ ...report, questionCount: 14 }, expected),
    ).toEqual({ valid: false, reason: "RESOURCE_COUNTS_MISMATCH" });
  });

  it("requires same-run, read-only Cycle 29–32 PITR evidence before APPLY", () => {
    const nowMs = Date.now();
    const parentTimestamp = new Date(nowMs - 120_000).toISOString();
    const targetBranchId = "br-cycle29-32-test-restore";
    const expected = {
      runId: "12345",
      runAttempt: "1",
      sha: "a".repeat(40),
      database: "approved-db",
      role: "approved-role",
      port: "5432",
      scope: "cycle29-32" as const,
      graphScope: "CYCLES_29_TO_32" as const,
      nowMs,
    };
    const evidence = {
      status: "PASS",
      schemaVersion: 10,
      pitrScope: "cycle29-32",
      graphScope: "CYCLES_29_TO_32",
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
    expect(isCycle29To32PitrEvidenceValid(evidence, expected)).toBe(true);
    expect(
      isCycle29To32PitrEvidenceValid({ ...evidence, graphScope: "CYCLES_21_TO_24" }, expected),
    ).toBe(false);
    expect(isCycle29To32PitrEvidenceValid({ ...evidence, workflowRunAttempt: "2" }, expected)).toBe(
      false,
    );
  });

  it("keeps the protected workflow graph-only and verifies PITR before any APPLY step", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("default: PLAN_ONLY");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("CYCLE2932_GRAPH_SCOPE: CYCLES_29_TO_32");
    expect(workflow).toContain("scripts/verify-cycle29-32-pitr-evidence.ts");
    expect(workflow.indexOf("Enforce same-run Cycle 29–32 PITR evidence")).toBeLessThan(
      workflow.indexOf("Apply only missing Cycle 29–32 graphs"),
    );
    expect(workflow).toContain("scripts/verify-cycle29-32-plan-report.ts");
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("seed-education-v2-p1-a-cycle-5-8.ts --apply --all");
    expect(workflow).toContain("cycle29-*.json");
    expect(workflow).toContain("cycle30-*.json");
    expect(workflow).toContain("cycle31-*.json");
    expect(workflow).toContain("cycle32-*.json");
  });
});
