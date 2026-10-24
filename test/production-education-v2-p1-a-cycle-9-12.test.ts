import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessOptionLengthQuality } from "../src/curriculum/option-length-quality.js";
import {
  EDUCATION_V2_P1_A_CYCLE_9_12,
  EDUCATION_V2_P1_A_CYCLE_9_12_SEQUENCES,
  getEducationV2P1ACycle,
  p1ACycle5To8AssessmentId,
  p1ACycle5To8ContentVersionId,
  p1ACycle5To8QuestionVersionId,
  p1ACycle5To8TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_9_12_RELEASE_DECISIONS,
  EDUCATION_V2_P1_A_CYCLE_9_12_RELEASE_FINGERPRINT,
  EDUCATION_V2_P1_A_CYCLE_9_12_RELEASE_ID,
  educationV2P1ACycle9To12ProductionApproval,
  isEducationV2P1ACycle9To12ProductionAssignmentEnabled,
} from "../src/curriculum/education-v2-p1-a-cycle-9-12-release.js";
import { isEducationV2P1ACycle5To8SeedRequestAuthorized } from "../src/curriculum/education-v2-p1-a-cycle-5-8-seed-policy.js";
import { educationV2P1ACycle5To8ScopeSequences } from "../src/curriculum/education-v2-p1-a-cycle-5-8-release.js";
import { EDUCATION_V2_P1_800_DRAFT_CYCLES } from "../src/curriculum/education-v2-p1-800-draft-cycles.js";
import { isCycle9To12PitrEvidenceValid } from "../scripts/production-cycle4-pitr-restore-evidence.js";
import {
  LEARNING_ROUTE_CYCLES,
  buildPlannedLearningRouteNodes,
  matchesLearningRouteGraph,
  nextLearningRouteCycle,
} from "../src/curriculum/learning-route-catalog.js";
import { parseTrainingExerciseVersionConfig } from "../src/modules/training/exercise-contract.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-9-12.yml", import.meta.url),
  "utf8",
);

const evidenceByQuestion: Record<string, { correct: string; evidence: readonly string[] }> = {
  "a9-cloud-1": {
    correct: "Toz, polen ve tuz parçacıkları",
    evidence: ["toz, polen veya tuz gibi küçük parçacıkların çevresinde yoğunlaşır"],
  },
  "a9-cloud-2": {
    correct: "Taşınamayacak kadar büyüdüklerinde",
    evidence: ["Bulutun taşıyamayacağı büyüklüğe ulaşan su damlaları yağış"],
  },
  "a9-cloud-3": {
    correct: "Buhar yükselir, yoğunlaşır, damla büyür",
    evidence: [
      "Yükselen su buharı soğuk hava katmanlarında",
      "Damlacıklar çarpışıp birleşerek büyüyebilir",
    ],
  },
  "a9-snow-1": {
    correct: "Su buharı parçacık çevresinde donar",
    evidence: [
      "su buharının donma noktasının altındaki bulutlarda küçük parçacıkların çevresinde kristalleşmesi",
    ],
  },
  "a9-snow-2": {
    correct: "Kristaller ışığı saçar ve geri yansıtır",
    evidence: ["çok sayıdaki kristal, ışığı farklı yönlere saçar", "geri yansıtır"],
  },
  "a9-snow-3": {
    correct: "Karın donmuş yağmur olduğu düşüncesini",
    evidence: ["donmuş yağmur damlaları değildir"],
  },
  "a9-sunset-1": {
    correct: "Mavi ışık daha belirgin saçılır",
    evidence: ["yandan bakınca mavi ışık daha belirgin saçılır"],
  },
  "a9-sunset-2": {
    correct: "Işığın atmosferde daha uzun yol alması",
    evidence: [
      "güneş ışığı atmosferde daha uzun yol alır",
      "Kısa dalga boyları daha çok saçıldığından",
    ],
  },
  "a9-sunset-3": {
    correct: "Saçılmayı gösteren sınırlı bir modeldir",
    evidence: [
      "Bu model atmosferin tamamını kopyalamaz",
      "ışığın ortamda ilerlerken değişmesini gösterir",
    ],
  },
  "a9-stars-1": {
    correct: "Kütle çekimi maddeyi toplar",
    evidence: ["maddenin kütle çekimiyle bir araya gelmesiyle"],
  },
  "a9-stars-2": {
    correct: "Maddenin kütle çekimiyle sıkışmasına",
    evidence: ["Madde sıkıştıkça merkezdeki basınç ve sıcaklık yükselir"],
  },
  "a9-stars-3": {
    correct: "Farklı yaşlardaki yıldızları karşılaştırır",
    evidence: ["farklı yaşlardaki yıldızları karşılaştırır"],
  },
  "a9-space-1": {
    correct: "Sıcak havanın belirgin biçimde yükselmemesi",
    evidence: ["Mikro yerçekiminde bu hareket belirgin olmadığından"],
  },
  "a9-space-2": {
    correct: "Yerçekiminin hava akımına etkisi",
    evidence: ["yerçekiminin yanma çevresindeki hava akımına etkisini"],
  },
  "a9-space-3": {
    correct: "Mikro yerçekimi bazı süreçleri değiştirebilir",
    evidence: [
      "bazı süreçlerin Dünya'dakinden farklı işleyebildiğini",
      "tek başına bütün uzay deneylerinin sonucunu açıklamaz",
    ],
  },
  "a10-insect-1": {
    correct: "Fotoreseptör hücreler",
    evidence: ["farklı dalga boylarını algılayabilen fotoreseptör hücreler"],
  },
  "a10-insect-2": {
    correct: "Işık ipuçlarının yön bulmaya yardımcı olması",
    evidence: ["yön bulurken", "ışık ipuçlarından yararlanmasını sağlar"],
  },
  "a10-insect-3": {
    correct: "Davranışın tek kesin nedeni henüz açıklanmış değildir",
    evidence: [
      "farklı açıklamalar öne sürülmüştür",
      "tek ve kesin nedeni henüz açıklanmış değildir",
    ],
  },
  "a10-diatom-1": {
    correct: "Fotosentez yapabilen algler",
    evidence: ["fotosentez yapabilen tek hücreli alglerdir"],
  },
  "a10-diatom-2": {
    correct: "Işıkla kabuğun etkileşimini değiştirebilir",
    evidence: ["Gözeneklerin boyutu, ışıkla etkileşimi değiştirebilir"],
  },
  "a10-diatom-3": {
    correct: "Işığı toplayıp hücre içine dağıtması",
    evidence: ["ışığın toplanmasına ve hücrenin içine dağıtılmasına yardım ettiğini"],
  },
  "a10-ocean-1": {
    correct: "Jeolojik oşinografi",
    evidence: ["Jeolojik oşinografi ise deniz tabanındaki kanyon, dağ ve yer kabuğu yapılarına"],
  },
  "a10-ocean-2": {
    correct: "Fiziksel oşinografiyle",
    evidence: ["fiziksel oşinografi sıcaklık, dalga ve akıntıları araştırır"],
  },
  "a10-ocean-3": {
    correct: "Bir olay birden fazla araştırma alanına konu olabilir",
    evidence: [
      "Aynı okyanus olayı, farklı sorular soran uzmanların çalışmalarını bir araya getirebilir",
    ],
  },
  "a10-sound-1": {
    correct: "Titreşim komşu moleküllere aktarılır",
    evidence: ["Bu titreşim komşu moleküllere aktarılır ve ses dalgası ilerler"],
  },
  "a10-sound-2": {
    correct: "Sesin oluşturduğu titreşimi",
    evidence: ["sesin oluşturduğu titreşim aynanın yansıttığı ışığı hareket ettirebilir"],
  },
  "a10-sound-3": {
    correct: "Uzaklık arttıkça enerji miktarı azalabilir",
    evidence: ["Ses uzaklaştıkça aktarılan enerji azalır"],
  },
  "a10-oceanwarm-1": {
    correct: "Sudaki miktarı azalabilir",
    evidence: ["oksijenin suda çözünürlüğü azalabilir"],
  },
  "a10-oceanwarm-2": {
    correct: "Metabolizmaları hızlandığında",
    evidence: ["soğukkanlı deniz canlılarının metabolizması hızlanırsa"],
  },
  "a10-oceanwarm-3": {
    correct: "Her türün her bölgede aynı biçimde etkileneceğini",
    evidence: ["Etkinin bütün türlerde ve bölgelerde aynı olacağı sonucu çıkarılamaz"],
  },
  "a11-gold-1": {
    correct: "Kırmızı maske",
    evidence: ["yüzünde kırmızı bir maske"],
  },
  "a11-gold-2": {
    correct: "Sarı şerit",
    evidence: ["kanatlarında sarı bir şerit"],
  },
  "a11-gold-3": {
    correct: "Tek özellik benzerliği açıklamayabilir",
    evidence: [
      "Tek bir özelliği incelemek yerine birkaç ipucunu birlikte değerlendirmek daha güvenlidir",
    ],
  },
  "a11-leaf-1": {
    correct: "Köklerden yapraklara doğru",
    evidence: ["ksilem adı verilen iletim dokusu suyu gövde boyunca yapraklara taşır"],
  },
  "a11-leaf-2": {
    correct: "Sisli bulut ormanları",
    evidence: ["bulut ormanlarında ağaçlar sık sık sis içinde kalır"],
  },
  "a11-leaf-3": {
    correct: "Bütün ağaçların her koşulda yapraktan su aldığı iddiasını",
    evidence: ["bütün ağaçların her koşulda yapraklarından yeterli su aldığı anlamına gelmez"],
  },
  "a11-const-1": {
    correct: "Dünya’dan görülen yıldız konumlarını",
    evidence: ["Dünya’dan bakıldığında yıldızların gökyüzündeki görünür konumlarını birleştirir"],
  },
  "a11-const-2": {
    correct: "Birbirlerinden farklı uzaklıklarda olabilirler",
    evidence: ["aralarındaki gerçek uzaklık farklı olabilir"],
  },
  "a11-const-3": {
    correct: "Yıldızları tanıyıp konumlarını izlemekte",
    evidence: ["yıldızları tanımasına ve gökyüzündeki konumlarını izlemesine yardımcı olur"],
  },
  "a11-mig-1": {
    correct: "Verimli otlaklarda beslenmek için",
    evidence: ["yaz aylarında daha verimli otlaklara yönelir"],
  },
  "a11-mig-2": {
    correct: "Güneye, yaşadıkları bölgeye doğru",
    evidence: ["İlk kar başladığında güneye dönerek yaşadıkları bölgeye yaklaşırlar"],
  },
  "a11-mig-3": {
    correct: "Yolculuk sırasında enerji sağlamaya",
    evidence: ["yola çıkmadan önce çok besin tüketip enerji depolar"],
  },
  "a11-cloud-1": {
    correct: "Damlacık ve kristallerin ışığı saçması",
    evidence: ["su damlacıkları ve buz kristalleri güneş ışığının farklı dalga boylarını saçar"],
  },
  "a11-cloud-2": {
    correct: "Işığın bir bölümü yansıtılıp soğurulduğu için",
    evidence: [
      "ışığın önemli bir bölümü yansır veya soğurulur",
      "alt bölümlere daha az ışık ulaşabilir",
    ],
  },
  "a11-cloud-3": {
    correct: "Her nokta aynı miktarda ışık almayabilir",
    evidence: ["her noktanın aynı miktarda ışık aldığı anlamına gelmez"],
  },
  "a12-fossil-1": {
    correct: "Kalıntının hızla örtülmesi",
    evidence: ["kalıntının üzeri kum ya da çamurla hızla örtülebilir"],
  },
  "a12-fossil-2": {
    correct: "Tortul birikimi",
    evidence: ["deniz tabanında tortulların birikmesi bu ortamı sağlayabilir"],
  },
  "a12-fossil-3": {
    correct: "Her kalıntının mutlaka fosilleşeceğini",
    evidence: ["her canlının ve her kalıntının fosile dönüşmesi beklenmez"],
  },
  "a12-c14-1": {
    correct: "Karbon-14 oranının azalması",
    evidence: ["dokularındaki karbon-14 zamanla azalır"],
  },
  "a12-c14-2": {
    correct: "Atmosferin C-14 oranını değiştirebilir",
    evidence: ["atmosferdeki izotop oranını değiştirebilir"],
  },
  "a12-c14-3": {
    correct: "Atmosfer değişimini hesaba katmak",
    evidence: ["atmosferde zamanla oluşan değişimleri de hesaba katan kalibrasyonlardan"],
  },
  "a12-wind-1": {
    correct: "Rüzgâr enerjisi",
    evidence: ["Rüzgârın hareketi türbin kanatlarını döndürür"],
  },
  "a12-wind-2": {
    correct: "Mekanikten elektriğe",
    evidence: ["Jeneratör mekanik enerjiyi elektrik enerjisine dönüştürür"],
  },
  "a12-wind-3": {
    correct: "Şebekeye iletme veya depolama",
    evidence: ["şebekeye aktarılabilir ya da bataryalarda depolanabilir"],
  },
  "a12-tax-1": {
    correct: "Hücre ve DNA kanıtları farklılık gösterdiği için",
    evidence: ["hücre yapısı ve DNA dizilimi farklılık gösteriyor"],
  },
  "a12-tax-2": {
    correct: "Gelişim ve amino asit kanıtları",
    evidence: ["gelişim özellikleri ve amino asit dizilimiyle"],
  },
  "a12-tax-3": {
    correct: "Biyolojik özellikleri birlikte incelemek",
    evidence: ["görünüş, hücre, gelişim ve genetik gibi farklı özellikler birlikte incelenebilir"],
  },
  "a12-marssoil-1": {
    correct: "Domates, buğday ve tere",
    evidence: ["domates, buğday ve tere yetiştirdi"],
  },
  "a12-marssoil-2": {
    correct: "Karışım Mars toprağını tam yansıtmayabilirdi",
    evidence: [
      "örneğin Mars toprağının bileşimini ve fiziksel yapısını tam olarak yansıtıp yansıtmadığından emin değildi",
    ],
  },
  "a12-marssoil-3": {
    correct: "Benzer karışımda bitkiler yetişebilir",
    evidence: [
      "benzer bir karışımda yetişme olasılığını gösterir",
      "Mars yüzeyinde tarımın hazır ve sorunsuz olduğunu kanıtlamaz",
    ],
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

describe("P1-A source-verified Cycles 9–12 package", () => {
  it("binds all 20 authored stations and 60 answers to distinct source evidence", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_9_12_SEQUENCES).toEqual([9, 10, 11, 12]);
    expect(EDUCATION_V2_P1_A_CYCLE_9_12).toHaveLength(4);

    const versionIds: string[] = [];
    const sourceUrls = new Set<string>();
    const answerKeys = new Set<string>();
    const positionCounts = [0, 0, 0, 0];

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_9_12) {
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
          const expected = evidenceByQuestion[question.key];
          expect(expected, question.key).toBeDefined();
          expect(question.correct, question.key).toBe(expected!.correct);
          expect(answerKeys.has(question.key)).toBe(false);
          answerKeys.add(question.key);
          for (const snippet of expected!.evidence) {
            expect(station.text.toLocaleLowerCase("tr-TR"), question.key).toContain(
              snippet.toLocaleLowerCase("tr-TR"),
            );
          }
          const mapped = exercise.questions.find((item) => item.key === question.key);
          expect(mapped?.correctOptionId).toBe(question.correctOptionId);
          expect(mapped?.options).toEqual(question.options);
          expect(question.options).toHaveLength(4);
          expect(new Set(question.options.map((option) => option.id)).size).toBe(4);
          expect(question.options.map((option) => option.id)).toContain(question.correctOptionId);
          expect(question.explanation.trim()).not.toBe("");
          expect(question.hint.trim()).not.toBe("");
          const quality = assessOptionLengthQuality({
            options: question.options,
            correctOptionId: question.correctOptionId,
          });
          expect(quality?.clearOutlier, question.key).toBe(false);
          positionCounts[
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

    expect(answerKeys.size).toBe(60);
    expect(Object.keys(evidenceByQuestion)).toHaveLength(60);
    expect(sourceUrls.size).toBe(20);
    expect(new Set(versionIds).size).toBe(versionIds.length);
    expect(positionCounts.every((count) => count >= 12 && count <= 18)).toBe(true);
  });

  it("records owner approval but keeps Cycle 9–12 locked until their production graphs exist", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_9_12_RELEASE_DECISIONS).toEqual(
      [9, 10, 11, 12].map((sequence) => ({
        sequence,
        status: "OWNER_RELEASE_APPROVED",
        explicitPublicationApproved: true,
      })),
    );
    for (const sequence of [9, 10, 11, 12]) {
      expect(isEducationV2P1ACycle9To12ProductionAssignmentEnabled(sequence)).toBe(true);
      const cycle = EDUCATION_V2_P1_A_CYCLE_9_12.find((item) => item.sequence === sequence)!;
      const catalog = LEARNING_ROUTE_CYCLES.find(
        (item) => item.pathCode === cycle.program.path.code,
      );
      expect(catalog?.publicationApproved()).toBe(true);
      expect(catalog?.authoringStatus).toBe("OWNER_RELEASE_APPROVED");
    }
    expect(EDUCATION_V2_P1_A_CYCLE_9_12_RELEASE_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/u);
    expect(EDUCATION_V2_P1_A_CYCLE_9_12_RELEASE_ID).toContain(
      EDUCATION_V2_P1_A_CYCLE_9_12_RELEASE_FINGERPRINT,
    );
    expect(educationV2P1ACycle9To12ProductionApproval("b".repeat(40))).toContain(
      EDUCATION_V2_P1_A_CYCLE_9_12_RELEASE_FINGERPRINT.toUpperCase(),
    );

    const cycle8 = LEARNING_ROUTE_CYCLES.find(
      (cycle) => cycle.routeFamily === "A" && cycle.sequence === 8,
    )!;
    const next = nextLearningRouteCycle(cycle8.pathCode);
    expect(next?.sequence).toBe(9);
    expect(next?.pathCode).toBe("EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_9_G8_12");
    expect(next?.publicationApproved()).toBe(true);

    const planned = buildPlannedLearningRouteNodes({
      currentPathCode: cycle8.pathCode,
      visibleStationCount: 72,
      targetStationCount: 92,
    }).filter(
      (node) => node.cycleSequence !== null && node.cycleSequence >= 9 && node.cycleSequence <= 12,
    );
    expect(planned).toHaveLength(20);
    expect(planned[0]?.cycleSequence).toBe(9);
    expect(planned[0]?.stepOrder).toBe(1);
    expect(
      planned.every(
        (node) =>
          node.status === "locked" &&
          node.availability === "UNAVAILABLE" &&
          node.planningStatus === "GRAPH_NOT_AVAILABLE" &&
          node.templateVersionId === null &&
          node.contentVersionId === null &&
          node.assessmentId === null &&
          node.learningPathId === null,
      ),
    ).toBe(true);
  });

  it("does not duplicate any Cycle 9–12 source URL used elsewhere in the draft catalog", () => {
    const catalogUrls = EDUCATION_V2_P1_800_DRAFT_CYCLES.flatMap((cycle) =>
      cycle.sourceStations
        .map((station) => station.sourceEvidence?.url)
        .filter((url): url is string => Boolean(url)),
    );
    const counts = new Map<string, number>();
    for (const url of catalogUrls) counts.set(url, (counts.get(url) ?? 0) + 1);
    for (const cycle of EDUCATION_V2_P1_A_CYCLE_9_12) {
      for (const station of cycle.sourceCycle.sourceStations) {
        expect(counts.get(station.sourceEvidence!.url)).toBe(1);
      }
    }
  });

  it("requires the separate exact scope, release approval, protected workflow and same-run PITR before APPLY", () => {
    expect(educationV2P1ACycle5To8ScopeSequences("CYCLES_9_TO_12")).toEqual([9, 10, 11, 12]);
    const request = {
      dryRun: false,
      operation: "APPLY",
      confirmation: "APPLY_EDUCATION_V2_P1_A_CYCLES_9_TO_12",
      graphScope: "CYCLES_9_TO_12" as const,
      productionApproval: "owner-release-token",
      expectedProductionApproval: "owner-release-token",
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
      isEducationV2P1ACycle5To8SeedRequestAuthorized({ ...request, confirmation: "PLAN_ONLY" }),
    ).toBe(false);
    expect(
      isEducationV2P1ACycle5To8SeedRequestAuthorized({
        ...request,
        productionApproval: "different-release",
      }),
    ).toBe(false);

    expect(workflow).toContain("environment:");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("CYCLE912_GRAPH_SCOPE: CYCLES_9_TO_12");
    expect(workflow).toContain("scripts/verify-cycle9-12-pitr-evidence.ts");
    expect(workflow).toContain("source fingerprint");
    expect(workflow).toContain("graph state is CONFLICT");
    expect(workflow).toContain("expected five learning steps");
    expect(workflow).toContain("expected fifteen questions");
    expect(workflow.indexOf("Enforce same-run Cycle 9–12 PITR evidence")).toBeLessThan(
      workflow.indexOf("Apply only missing Cycle 9–12 graphs"),
    );
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(
      isCycle9To12PitrEvidenceValid(undefined, {
        runId: "12345",
        runAttempt: "1",
        sha: "a".repeat(40),
        database: "database",
        role: "role",
        port: "5432",
        scope: "cycle9-12",
        graphScope: "CYCLES_9_TO_12",
      }),
    ).toBe(false);
  });
});
