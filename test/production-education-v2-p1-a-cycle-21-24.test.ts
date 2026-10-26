import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessOptionLengthQuality } from "../src/curriculum/option-length-quality.js";
import {
  EDUCATION_V2_P1_A_CYCLE_21_24,
  EDUCATION_V2_P1_A_CYCLE_21_24_SEQUENCES,
  getEducationV2P1ACycle,
  p1ACycle5To8AssessmentId,
  p1ACycle5To8ContentVersionId,
  p1ACycle5To8QuestionVersionId,
  p1ACycle5To8TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_DECISIONS,
  EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_FINGERPRINT,
  EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_ID,
  educationV2P1ACycle21To24ProductionApproval,
  isEducationV2P1ACycle21To24ProductionAssignmentEnabled,
} from "../src/curriculum/education-v2-p1-a-cycle-21-24-release.js";
import { educationV2P1ACycle5To8ScopeSequences } from "../src/curriculum/education-v2-p1-a-cycle-5-8-release.js";
import { isEducationV2P1ACycle5To8SeedRequestAuthorized } from "../src/curriculum/education-v2-p1-a-cycle-5-8-seed-policy.js";
import {
  CYCLE4_PITR_EXPECTED_RETENTION_SECONDS,
  CYCLE4_PITR_PROJECT_ID,
  CYCLE4_PITR_REQUIRED_TABLES,
  CYCLE4_PITR_SOURCE_BRANCH_ID,
  cycle4PitrCompareSchemaEndpoint,
  isCycle21To24PitrEvidenceValid,
} from "../scripts/production-cycle4-pitr-restore-evidence.js";
import { validateCycle21To24ReadOnlyPlanReport } from "../scripts/verify-cycle21-24-plan-report.js";
import {
  LEARNING_ROUTE_CYCLES,
  learningRouteCycle,
  matchesLearningRouteGraph,
  nextLearningRouteCycle,
} from "../src/curriculum/learning-route-catalog.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-21-24.yml", import.meta.url),
  "utf8",
);

const evidenceByQuestion: Record<string, { answer: string; evidence: string }> = {
  "a21-bionic-1": {
    answer: "Işık enerjisini besindeki kimyasal enerjiye çevirmek",
    evidence: "Kloroplastlar ışık enerjisini besinde depolanan kimyasal enerjiye dönüştürür",
  },
  "a21-bionic-2": {
    answer: "Fotosentez etkinliğinde artış gözlendi",
    evidence: "nanotüp eklenen kloroplastlarda fotosentez etkinliği arttı",
  },
  "a21-bionic-3": {
    answer: "Etkinlik artışının besin miktarına yansımasını",
    evidence: "besin miktarına nasıl yansıdığı henüz bilinmiyor",
  },
  "a21-eclipse-1": {
    answer: "Güneş ile Ay'ın arasındadır",
    evidence: "Dünya, Güneş ile Ay arasına girer",
  },
  "a21-eclipse-2": {
    answer: "Yörünge düzlemleri çoğu zaman tam hizalanmadığı için",
    evidence: "çoğu dolunayda aynı doğrultuda hizalanmaz",
  },
  "a21-eclipse-3": {
    answer: "Atmosferde yönü değişen ışığın Ay'a ulaşması",
    evidence: "atmosferinde yönü değişen ışıkların Ay'a ulaşması",
  },
  "a21-climate-1": {
    answer: "Işık kirliliğini ve atmosferik ışık dağılmasını",
    evidence: "ışık kirliliğinden daha az etkilenir",
  },
  "a21-climate-2": {
    answer: "Gözlem süresi ve görüntü kalitesi düşebilir",
    evidence: "gözlem süresini azaltabilir ve görüntü kalitesini düşürebilir",
  },
  "a21-climate-3": {
    answer: "Teleskoplar uzun süre kullanılacağı için",
    evidence: "Teleskoplar onlarca yıl kullanıldığı için",
  },
  "a21-exoplanet-1": {
    answer: "TESS uzay teleskobunun topladığı verileri",
    evidence: "TESS uzay teleskobunun topladığı verileri inceledi",
  },
  "a21-exoplanet-2": {
    answer: "Dört",
    evidence: "çevresinde dört ötegezegen tespit edildi",
  },
  "a21-exoplanet-3": {
    answer: "Öğrenciler araştırmaya katılıp bulguları analiz edebilir",
    evidence: "öğrencilerin araştırma sürecine doğrudan katılabileceğini gösterir",
  },
  "a21-wind-1": {
    answer: "Dönme hareketini dinamoya aktarmak",
    evidence: "şaft dönme hareketini dinamoya aktarır",
  },
  "a21-wind-2": {
    answer: "Mekanik enerjiyi elektrik enerjisine",
    evidence: "mekanik enerjiyi elektrik enerjisine dönüştürür",
  },
  "a21-wind-3": {
    answer: "Ölçülen rüzgâr ve hesaplanan üretime",
    evidence: "rüzgâr koşulları ölçülür ve beklenen üretim hesaplanır",
  },
  "a22-richter-1": {
    answer: "Sismik dalga titreşimlerini",
    evidence: "sismik dalgaların oluşturduğu titreşimleri kaydeder",
  },
  "a22-richter-2": {
    answer: "Sismografın kaydettiği dalga genliği",
    evidence: "dalga genliğini ve ölçüm noktasının merkez üssüne uzaklığını hesaba katan",
  },
  "a22-richter-3": {
    answer: "Yaklaşık 31,6 kat",
    evidence: "açığa çıkan enerjinin ise yaklaşık 31,6 katına karşılık gelir",
  },
  "a22-robot-1": {
    answer: "Dar alanlarda ilerleyen robotlara",
    evidence: "yılanın esnek gövdesi ise boru ve enkaz aralarında ilerleyen bir robot",
  },
  "a22-robot-2": {
    answer: "Hareket ilkesini göreve uyarlar",
    evidence: "mühendisler hareket ilkesini belirli bir göreve uyarlar",
  },
  "a22-robot-3": {
    answer: "Afet bölgelerinde arama-kurtarma",
    evidence: "arama-kurtarma, çevre gözlemi ve araştırma",
  },
  "a22-surface-1": {
    answer: "Yüzeye yayılmadan damla hâlinde yuvarlanır",
    evidence: "yüzeye yayılmak yerine damlacıklar hâlinde yuvarlanır",
  },
  "a22-surface-2": {
    answer: "Damlalar bazı kirleri taşıyabilir",
    evidence: "kir parçacıklarını da beraberinde taşıyabilir",
  },
  "a22-surface-3": {
    answer: "Sonuç, yüzey ve kir türüne göre değişir",
    evidence: "sonuç, yüzeyin yapısına ve kirin türüne bağlıdır",
  },
  "a22-food-1": {
    answer: "Tarladan sofraya tüm aşamaları",
    evidence: "üretim, taşıma, depolama ve hazırlama aşamaları birbirine bağlıdır",
  },
  "a22-food-2": {
    answer: "Mikrop çoğalmasını yavaşlatmaya",
    evidence: "mikroorganizmaların çoğalmasını yavaşlatmaya yardımcı olur",
  },
  "a22-food-3": {
    answer: "Güvenlik zincirin tüm aşamalarına bağlıdır",
    evidence: "Bir aşamadaki dikkat, zincirin diğer basamaklarını gereksiz kılmaz",
  },
  "a22-snow-1": {
    answer: "Su molekülleri",
    evidence: "su moleküllerinin havadaki küçük parçacıkların çevresinde birikmesiyle",
  },
  "a22-snow-2": {
    answer: "Biyolojik süreçlerin oluşturduğu bileşikler",
    evidence: "biyolojik süreçlerden kaynaklanan bazı bileşiklerin yoğunlaşma çekirdeği",
  },
  "a22-snow-3": {
    answer: "Birden fazla açıklamanın araştırıldığını belirtiyor",
    evidence: "tek bir kesin mekanizmaya indirgemez",
  },
  "a23-eink-1": {
    answer: "Artı yüklü beyaz pigmentleri",
    evidence: "elektrot eksi yüklendiğinde kapsüllerdeki artı yüklü beyaz pigmentler üste",
  },
  "a23-eink-2": {
    answer: "Çevredeki ışığı geri yansıtarak",
    evidence: "çevredeki ışığı yansıtır",
  },
  "a23-eink-3": {
    answer: "Görüntü enerji kullanmadan kalabilir",
    evidence: "Görüntü değiştirilmese bile sayfada kalabildiğinden enerji tüketimi düşüktür",
  },
  "a23-computer-1": {
    answer: "Aritmetik ve mantıksal işlemler yapabilir",
    evidence: "aritmetik ve mantıksal işlemler yapar",
  },
  "a23-computer-2": {
    answer: "Donanım",
    evidence: "fiziksel parçalar donanım olarak adlandırılır",
  },
  "a23-computer-3": {
    answer: "Donanım ve yazılım birlikte çalışır",
    evidence: "fiziksel bileşenler ile onları yönlendiren programlar birlikte çalışır",
  },
  "a23-rainbow-1": {
    answer: "Farklı dalga boylarındaki ışınlardan",
    evidence: "farklı dalga boylarındaki ışınların bileşimidir",
  },
  "a23-rainbow-2": {
    answer: "Işığın farklı açılarla kırılması",
    evidence: "renklerin farklı yönlere ayrılmasına yardım eder",
  },
  "a23-rainbow-3": {
    answer: "Renklerin kırılma açıları farklıdır",
    evidence: "her rengin kırılma açısı aynı değildir",
  },
  "a23-elevator-1": {
    answer: "Dönme hareketini veren elektrik motorudur",
    evidence: "motor makarayı döndürür",
  },
  "a23-elevator-2": {
    answer: "Kabin yükünü dengeleyip gereken kuvveti azaltması",
    evidence: "karşı ağırlık kabinin yükünü dengeler ve motorun gereken kuvvetini azaltır",
  },
  "a23-elevator-3": {
    answer: "Kabin ile karşı ağırlığın yana doğru salınımını",
    evidence: "yana doğru sallanma sınırlandırılır",
  },
  "a23-search-1": {
    answer: "Evet ya da hayır biçiminde yanıt vererek",
    evidence: "öğretmen evet ya da hayır diye yanıt verir",
  },
  "a23-search-2": {
    answer: "Notu bulmak için olasılıkları adım adım daraltır",
    evidence:
      "aldıkları notu tahmin etmek için soru sorar ve öğretmen evet ya da hayır diye yanıt verir",
  },
  "a23-search-3": {
    answer: "Gerekli en az soru sayısını hesaplamayı",
    evidence: "en az kaç soru sorabileceğini ele alır",
  },
  "a24-spectrum-1": {
    answer: "Dalga boyu ya da frekansa göre",
    evidence: "dalga boyuna ya da frekansına göre sıralanmasıyla oluşur",
  },
  "a24-spectrum-2": {
    answer: "400–800 nanometre",
    evidence: "dalga boyları yaklaşık 400 ile 800 nanometre arasındadır",
  },
  "a24-spectrum-3": {
    answer: "Daha uzun dalga boylu ve daha düşük enerjili",
    evidence: "daha uzun dalga boyuna ve daha düşük enerjiye sahiptir",
  },
  "a24-battery-1": {
    answer: "Metal temasında kurbağa bacaklarının hareket etmesi",
    evidence: "iki farklı metalle temas eden kurbağa bacaklarının hareket ettiğini gözlemledi",
  },
  "a24-battery-2": {
    answer: "Farklı metallerle",
    evidence: "etkinin kurbağadan değil metallerden kaynaklandığını savundu",
  },
  "a24-battery-3": {
    answer: "1800",
    evidence: "bu buluş 1800'de kayda geçti",
  },
  "a24-parasite-1": {
    answer: "Konak bitkinin köklerine uzanan özel yapılarla",
    evidence:
      "üzerinde yaşadığı bitkinin köklerine uzanan özel yapılarla karbonhidratları ve başka besinleri alır",
  },
  "a24-parasite-2": {
    answer: "Konak bitki → mantar → parazit bitki",
    evidence: "besin önce konak bitkinin köklerindeki mantara, sonra parazit bitkiye geçer",
  },
  "a24-parasite-3": {
    answer: "Beslenme biçimleri farklılık gösterebilir",
    evidence:
      "bazıları bütünüyle başka kaynaklara bağımlıyken bazıları fotosentez yapmayı sürdürüp",
  },
  "a24-music-1": {
    answer: "Sonuçlar birbirinden farklı olabiliyor",
    evidence: "çalışmalar aynı sonucu vermiyor",
  },
  "a24-music-2": {
    answer: "Pop müzik",
    evidence: "pop müzik dinlerken",
  },
  "a24-music-3": {
    answer: "Bilgiyi hatırlama ve okuduğunu anlama",
    evidence: "öğrenilen bilgiyi hatırlama ile okuduğunu anlama karşılaştırıldı",
  },
  "a24-organs-1": {
    answer: "Daha simetrik",
    evidence: "erken dönemde daha simetrik bir yapıdadır",
  },
  "a24-organs-2": {
    answer: "Hücreler arası sıvının belirli yöne akmasına",
    evidence: "hücreler arası sıvının belirli bir yöne akmasına katkı verir",
  },
  "a24-organs-3": {
    answer: "Erken gelişimdeki yönlü işaretler organ yerleşimiyle bağlantılıdır",
    evidence:
      "erken gelişimdeki yönlü işaretlerin organların yerleşmesiyle bağlantılı olduğunu düşündürür",
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

describe("P1-A Cycles 21–24 (stations 133–152)", () => {
  it("validates all 20 source-backed stations and 60 text-evidenced questions", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_21_24_SEQUENCES).toEqual([21, 22, 23, 24]);
    expect(EDUCATION_V2_P1_A_CYCLE_21_24).toHaveLength(4);
    expect(Object.keys(evidenceByQuestion)).toHaveLength(60);
    const sourceUrls = new Set<string>();
    const questionKeys = new Set<string>();
    const versionIds: string[] = [];
    const answerPositions = [0, 0, 0, 0];

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_21_24) {
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
        expect(station.sourceEvidence?.url).toMatch(/^https:\/\/bilimgenc\.tubitak\.gov\.tr\//u);
        expect(station.sourceEvidence?.verifiedFacts.length).toBeGreaterThan(0);
        expect(station.sourceEvidence?.checkedOn).toMatch(/^2026-10-\d{2}$/u);
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
          const evidence = evidenceByQuestion[sourceQuestion.key];
          expect(evidence, sourceQuestion.key).toBeDefined();
          const question = exercise.questions.find(
            (candidate) => candidate.key === sourceQuestion.key,
          );
          expect(question, sourceQuestion.key).toBeDefined();
          const correct = question!.options.find(
            (option) => option.id === question!.correctOptionId,
          );
          expect(correct?.text, sourceQuestion.key).toBe(evidence!.answer);
          expect(station.text.toLocaleLowerCase("tr-TR"), sourceQuestion.key).toContain(
            evidence!.evidence.toLocaleLowerCase("tr-TR"),
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
    expect(answerPositions.every((count) => count >= 14 && count <= 16)).toBe(true);
  });

  it("links cycles 21–24 to the exact 133–152 route graph and leaves Cycle 25 locked", () => {
    const prior = learningRouteCycle("EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_20_G8_12");
    expect(prior).toBeDefined();
    expect(nextLearningRouteCycle(prior!.pathCode)?.sequence).toBe(21);

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_21_24) {
      const route = learningRouteCycle(cycle.program.path.code);
      expect(route?.programId).toBe(cycle.program.programId);
      expect(route?.manifest).toBe(cycle.manifest);
      expect(route?.publicationApproved()).toBe(true);
      expect(route?.authoringStatus).toBe("OWNER_RELEASE_APPROVED");
      expect(matchesLearningRouteGraph(graphFor(cycle.sequence))).toBe(true);
      expect(nextLearningRouteCycle(cycle.program.path.code)?.sequence).toBe(cycle.sequence + 1);
    }
    const cycle25 = LEARNING_ROUTE_CYCLES.find(
      (route) => route.routeFamily === "A" && route.sequence === 25,
    );
    expect(cycle25).toBeDefined();
    expect(cycle25!.publicationApproved()).toBe(false);
  });

  it("uses a distinct immutable release identity and explicit owner decision for only Cycles 21–24", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_DECISIONS).toEqual(
      [21, 22, 23, 24].map((sequence) => ({
        sequence,
        status: "OWNER_RELEASE_APPROVED",
        explicitPublicationApproved: true,
      })),
    );
    expect(EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/u);
    expect(EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_ID).toContain(
      EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_FINGERPRINT,
    );
    for (const sequence of [21, 22, 23, 24]) {
      expect(isEducationV2P1ACycle21To24ProductionAssignmentEnabled(sequence)).toBe(true);
    }
    for (const sequence of [20, 25]) {
      expect(isEducationV2P1ACycle21To24ProductionAssignmentEnabled(sequence)).toBe(false);
    }
    expect(educationV2P1ACycle21To24ProductionApproval("a".repeat(40))).toContain(
      EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_FINGERPRINT.toUpperCase(),
    );
    expect(educationV2P1ACycle5To8ScopeSequences("CYCLES_21_TO_24")).toEqual([21, 22, 23, 24]);
    const request = {
      dryRun: true,
      operation: "PLAN_ONLY",
      confirmation: "PLAN_EDUCATION_V2_P1_A_CYCLES_21_TO_24",
      graphScope: "CYCLES_21_TO_24" as const,
      productionApproval: undefined,
      expectedProductionApproval: educationV2P1ACycle21To24ProductionApproval("a".repeat(40)),
      protectedProductionWorkflow: true,
    };
    expect(isEducationV2P1ACycle5To8SeedRequestAuthorized(request)).toBe(true);
    expect(isEducationV2P1ACycle5To8SeedRequestAuthorized({ ...request, dryRun: false })).toBe(
      false,
    );
    expect(
      isEducationV2P1ACycle5To8SeedRequestAuthorized({ ...request, graphScope: "CYCLES_17_TO_20" }),
    ).toBe(false);
  });

  it("accepts only a read-only plan for the exact sequence, release, commit and resource counts", () => {
    const expected = {
      sequence: 21 as const,
      releaseId: EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_ID,
      commit: "a".repeat(40),
      graphScope: "CYCLES_21_TO_24" as const,
    };
    const report = {
      status: "PASS",
      mode: "DRY_RUN",
      immutableReleaseId: expected.releaseId,
      productionReleaseId: expected.releaseId,
      expectedSourceCommit: expected.commit,
      productionReleaseCommit: expected.commit,
      graphScope: expected.graphScope,
      sequence: 21,
      state: "MISSING",
      dbChanged: false,
      stepCount: 5,
      contentCount: 5,
      exerciseCount: 5,
      questionCount: 15,
      assessmentCount: 1,
    };
    expect(validateCycle21To24ReadOnlyPlanReport(report, expected)).toEqual({
      valid: true,
      state: "MISSING",
    });
    expect(validateCycle21To24ReadOnlyPlanReport({ ...report, dbChanged: true }, expected)).toEqual(
      {
        valid: false,
        reason: "PLAN_REPORTED_WRITE",
      },
    );
    expect(validateCycle21To24ReadOnlyPlanReport({ ...report, sequence: 22 }, expected)).toEqual({
      valid: false,
      reason: "SEQUENCE_MISMATCH",
    });
    expect(
      validateCycle21To24ReadOnlyPlanReport({ ...report, questionCount: 14 }, expected),
    ).toEqual({
      valid: false,
      reason: "RESOURCE_COUNTS_MISMATCH",
    });
  });

  it("requires same-run, read-only Cycle 21–24 PITR evidence before APPLY", () => {
    const nowMs = Date.now();
    const parentTimestamp = new Date(nowMs - 120_000).toISOString();
    const targetBranchId = "br-cycle21-24-test-restore";
    const expected = {
      runId: "12345",
      runAttempt: "1",
      sha: "a".repeat(40),
      database: "approved-db",
      role: "approved-role",
      port: "5432",
      scope: "cycle21-24" as const,
      graphScope: "CYCLES_21_TO_24" as const,
      nowMs,
    };
    const evidence = {
      status: "PASS",
      schemaVersion: 8,
      pitrScope: "cycle21-24",
      graphScope: "CYCLES_21_TO_24",
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
    expect(isCycle21To24PitrEvidenceValid(evidence, expected)).toBe(true);
    expect(
      isCycle21To24PitrEvidenceValid({ ...evidence, graphScope: "CYCLES_17_TO_20" }, expected),
    ).toBe(false);
    expect(isCycle21To24PitrEvidenceValid({ ...evidence, workflowRunAttempt: "2" }, expected)).toBe(
      false,
    );
  });

  it("keeps the workflow manual, target-checked, graph-only and PITR-gated before APPLY", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("default: PLAN_ONLY");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("CYCLE2124_GRAPH_SCOPE: CYCLES_21_TO_24");
    expect(workflow).toContain("scripts/verify-cycle21-24-pitr-evidence.ts");
    expect(workflow.indexOf("Enforce same-run Cycle 21–24 PITR evidence")).toBeLessThan(
      workflow.indexOf("Apply only missing Cycle 21–24 graphs"),
    );
    expect(workflow).toContain("scripts/verify-cycle21-24-plan-report.ts");
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("seed-education-v2-p1-a-cycle-5-8.ts --apply --all");
  });
});
