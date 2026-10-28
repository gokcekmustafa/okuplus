import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessOptionLengthQuality } from "../src/curriculum/option-length-quality.js";
import {
  EDUCATION_V2_P1_A_CYCLE_25_28,
  EDUCATION_V2_P1_A_CYCLE_25_28_SEQUENCES,
  getEducationV2P1ACycle,
  p1ACycle5To8AssessmentId,
  p1ACycle5To8ContentVersionId,
  p1ACycle5To8QuestionVersionId,
  p1ACycle5To8TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_DECISIONS,
  EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_FINGERPRINT,
  EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_ID,
  educationV2P1ACycle25To28ProductionApproval,
  isEducationV2P1ACycle25To28ProductionAssignmentEnabled,
} from "../src/curriculum/education-v2-p1-a-cycle-25-28-release.js";
import { educationV2P1ACycle5To8ScopeSequences } from "../src/curriculum/education-v2-p1-a-cycle-5-8-release.js";
import { isEducationV2P1ACycle5To8SeedRequestAuthorized } from "../src/curriculum/education-v2-p1-a-cycle-5-8-seed-policy.js";
import {
  CYCLE4_PITR_EXPECTED_RETENTION_SECONDS,
  CYCLE4_PITR_PROJECT_ID,
  CYCLE4_PITR_REQUIRED_TABLES,
  CYCLE4_PITR_SOURCE_BRANCH_ID,
  cycle4PitrCompareSchemaEndpoint,
  isCycle25To28PitrEvidenceValid,
} from "../scripts/production-cycle4-pitr-restore-evidence.js";
import { validateCycle25To28ReadOnlyPlanReport } from "../scripts/verify-cycle25-28-plan-report.js";
import { buildEducationV2P0LearningCycleManifest } from "../src/curriculum/learning-cycle-manifest.js";
import {
  LEARNING_ROUTE_CYCLES,
  learningRouteCycle,
  matchesLearningRouteGraph,
  nextLearningRouteCycle,
} from "../src/curriculum/learning-route-catalog.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-25-28.yml", import.meta.url),
  "utf8",
);

const evidenceByQuestion: Record<string, { answer: string; evidence: string }> = {
  "a25-dark-1": {
    answer: "Çubuk hücreleri",
    evidence: "Retinadaki çubuk hücreleri loş ışığa duyarlıdır",
  },
  "a25-dark-2": {
    answer: "Büyüyerek daha çok ışık alır",
    evidence: "göz bebeği büyüyerek göze daha çok ışık girmesine izin verir",
  },
  "a25-dark-3": {
    answer: "En az 30 dakika",
    evidence: "çubuk hücrelerinin alışması en az 30 dakika sürer",
  },
  "a25-learning-1": {
    answer: "Deneyimle sinir yollarının değişmesiyle",
    evidence: "Deneyimlere yanıt olarak ortaya çıkan bu değişme kapasitesine beyin esnekliği denir",
  },
  "a25-learning-2": {
    answer: "Bilgi ve beceriyi daha kalıcı kılmaya yardım eder",
    evidence: "Tekrar, öğrenilen bilgiyi veya beceriyi daha kalıcı hâle getirmeye yardım eder",
  },
  "a25-learning-3": {
    answer: "Beyindeki kan akışı değişimini",
    evidence:
      "kan akışındaki değişiklikleri izleyerek hangi bölgelerin etkin olduğuna dair bilgi sağlar",
  },
  "a25-phone-1": {
    answer: "Telefon başka odadayken",
    evidence:
      "telefonu başka odada bulunan grubun performansı, telefonu masada duran grubunkinden daha yüksekti",
  },
  "a25-phone-2": {
    answer: "Telefonlar sessiz moda alınmıştı",
    evidence: "sessize alınmış telefonları masada",
  },
  "a25-phone-3": {
    answer: "Yakınlık bazı koşullarda dikkati etkileyebilir",
    evidence: "tek araştırma her kişinin aynı tepkiyi vereceğini kanıtlamaz",
  },
  "a25-fabric-1": {
    answer: "Lif, iplik, kumaş",
    evidence:
      "Lifler temizlenip işlenir, inceltilip bükülerek iplik hâline getirilir; iplikler daha sonra dokuma veya örme ile yüzeye dönüşür",
  },
  "a25-fabric-2": {
    answer: "İpliklerin ilmekler hâlinde bağlanmasıyla",
    evidence: "Örmede iplikler ilmekler hâlinde bağlanır; bu yapı kumaşı esnek kılar",
  },
  "a25-fabric-3": {
    answer: "Dayanıklı, çabuk kurur; az hava geçirir",
    evidence:
      "Sentetik polyester ise dayanıklı ve hızlı kuruyan bir seçenek olabilir, ancak doğal liflere göre hava geçirgenliği daha düşük olabilir",
  },
  "a25-pharma-1": {
    answer: "İlacı işleyen enzimlerin hızını etkileyerek",
    evidence: "Genetik farklılıklar bazı enzimlerin çalışma hızını değiştirebilir",
  },
  "a25-pharma-2": {
    answer: "Genetik özelliklerle ilaç yanıtı arasındaki ilişkiyi",
    evidence: "Farmakogenetik, genetik özelliklerin ilaç yanıtını nasıl etkilediğini araştırır",
  },
  "a25-pharma-3": {
    answer: "Genetik yapı tek başına yeterli değildir",
    evidence:
      "Genetik yapı tek etken değildir; ilaç kararı hastalık, doz, zaman ve sağlık uzmanının değerlendirmesiyle birlikte ele alınır",
  },
  "a26-cloud-1": {
    answer: "10–15 mikrometre",
    evidence: "Damlacıkların çapı yaklaşık 10–15 mikrometredir",
  },
  "a26-cloud-2": {
    answer: "300 ton",
    evidence: "bir kilometre kenarlı kübik bir kümülüs yaklaşık 300 ton kütleye ulaşabilir",
  },
  "a26-cloud-3": {
    answer: "Geniş bir alana dağıldıkları için",
    evidence:
      "Damlacıklar çok küçük ve geniş bir alana dağılmış olduğundan bulutlar havada asılı kalabilir",
  },
  "a26-ai-1": {
    answer: "Verilerdeki örüntülerden yararlanarak",
    evidence: "algoritmalar, mevcut verilerdeki örüntülerden yararlanır",
  },
  "a26-ai-2": {
    answer: "Görseli öğrendiği sınıflardan biriyle eşleştirmesi",
    evidence: "yeni bir görseli elma, armut ya da muz olarak sınıflandırabilir",
  },
  "a26-ai-3": {
    answer: "Örneklerin özellikleri ve karşılık gelen etiketler",
    evidence:
      "Öğreticiyle öğrenmede örneklerin özellikleri ve bu özelliklere karşılık gelen etiketler modele verilir",
  },
  "a26-oil-1": {
    answer: "Sudan daha düşük yoğunlukta olduğu için",
    evidence:
      "Petrol içerikli maddeler sudan daha düşük yoğunlukta oldukları için yüzeyde ince bir film oluşturabilir",
  },
  "a26-oil-2": {
    answer: "Film ve su sınırında yansıyan ışık",
    evidence: "Işığın bir bölümü filmin üstünden, bir bölümü ise petrol-su sınırından yansır",
  },
  "a26-oil-3": {
    answer: "İki yüzeyden yansıyan ışığın girişimiyle",
    evidence:
      "Bu yansımalar farklı yollar izlediğinde dalgalar bazı renklerde birbirini güçlendirip bazılarında sönümleyebilir",
  },
  "a26-moon-1": {
    answer: "Yörüngesinin elips biçiminde olması",
    evidence: "Ay’ın yörüngesi elips biçiminde olduğundan Dünya’ya uzaklığı zamanla değişir",
  },
  "a26-moon-2": {
    answer: "Hayır; olası kuramlardan biri olarak anlatıyor",
    evidence: "Bir kuram, ön plandaki cisimlerin boyut karşılaştırmasını etkilediğini öne sürer",
  },
  "a26-moon-3": {
    answer: "Henüz kesinleşmemiş kuramlar olarak",
    evidence: "Kaynak bu açıklamaları kesin sonuç değil, kuram olarak sunar",
  },
  "a26-carbon-1": {
    answer: "Organik madde içeren örneklerin",
    evidence:
      "Radyokarbon ya da karbon-14 tarihlendirme, organik madde içeren nesnelerin yaşını belirlemeye yardımcı olur",
  },
  "a26-carbon-2": {
    answer: "Zamanla azalır",
    evidence:
      "Canlı öldükten ve çevresiyle karbon alışverişi durduktan sonra dokudaki karbon-14 miktarı azalmaya başlar",
  },
  "a26-carbon-3": {
    answer: "5730 yılda",
    evidence: "Karbon-14 miktarı her 5730 yılda bir yarıya iner",
  },
  "a27-tree-1": {
    answer: "Ağaçların yetişebildiği en yüksek kuşağı",
    evidence: "Ağaç sınırı, ağaçların yetişebildiği en yüksek kuşağın adıdır",
  },
  "a27-tree-2": {
    answer: "Köklerin su almasını azaltarak",
    evidence: "toprağın suyunu dondurarak köklerin su almasını zorlaştırabilir",
  },
  "a27-tree-3": {
    answer: "Sınırın enleme göre değiştiğini",
    evidence:
      "Ekvator çevresinde ağaç sınırı daha yüksek, kutuplara yakın enlemlerde daha alçak olabilir",
  },
  "a27-plant-1": {
    answer: "Doymamış yağ asitlerinin miktarı artar",
    evidence: "doymamış yağ asitlerinin miktarı artar",
  },
  "a27-plant-2": {
    answer: "Daha düşük olur",
    evidence: "Çözünen madde arttığında sıvının donma noktası düşer",
  },
  "a27-plant-3": {
    answer: "Bütün bitkilerin aynı ölçüde dayanıklı olduğunu",
    evidence: "her bitkinin aynı ölçüde dayanıklı olduğu anlamına gelmez",
  },
  "a27-illusion-1": {
    answer: "Fizyolojik yanılsama",
    evidence:
      "Işık ve rengin aşırı uyarımıyla ortaya çıkan örüntüler fizyolojik yanılsama olarak açıklanır",
  },
  "a27-illusion-2": {
    answer: "Değişmez yanılsama",
    evidence:
      "Küçük resimlerin bir araya gelerek daha büyük, farklı bir görüntü oluşturması değişmez yanılsamaya örnektir",
  },
  "a27-illusion-3": {
    answer: "Bakış açısına bağlı ve bilinçsiz",
    evidence: "kişi, bakış açısına bağlı olarak farkında olmadan çıkarım yapar",
  },
  "a27-daymoon-1": {
    answer: "Güneş'ten aldığı ışığı yansıtarak",
    evidence: "Ay kendi ışığını üretmez; Güneş’ten aldığı ışığın bir bölümünü Dünya’ya yansıtır",
  },
  "a27-daymoon-2": {
    answer: "Ay’dan gelen ışık daha güçlü olduğu için",
    evidence: "Ay’dan gelen ışık yıldız ışığından çok daha güçlü olduğundan Ay",
  },
  "a27-daymoon-3": {
    answer: "Uygun konum ve ışık koşullarına bağlıdır",
    evidence: "görünürlük konum ve ışık koşullarına bağlıdır",
  },
  "a27-shape-1": {
    answer: "Kütleçekiminin etkisi",
    evidence: "kütleçekim, maddeyi zamanla merkeze doğru çekerek biçimi küreselleştirir",
  },
  "a27-shape-2": {
    answer: "Kütleçekiminin yetersiz kalması",
    evidence: "Küçük asteroitlerin kütleçekimi bu etkiyi oluşturacak kadar güçlü olmayabilir",
  },
  "a27-shape-3": {
    answer: "Kendi çevresindeki dönüşüyle",
    evidence: "Dünya'nın dönüşü ekvator çevresindeki yarıçapı kutuplardakinden biraz büyük yapar",
  },
  "a28-memory-1": {
    answer: "Yaklaşık 20–30 saniye",
    evidence: "genellikle yaklaşık 20–30 saniye tutulur",
  },
  "a28-memory-2": {
    answer: "Numarayı zihinde tekrarlamak",
    evidence:
      "Telefon numarasını içinden tekrarlamak bu bilgiyi biraz daha tutmaya yardım edebilir",
  },
  "a28-memory-3": {
    answer: "Yeni bağlantıların kurulmasına",
    evidence: "hatırlamayla yeni bağlantılar kurulduğunda uzun süreli anı oluşabilir",
  },
  "a28-recall-1": {
    answer: "Anıyı kurma biçimini",
    evidence: "zaman, çevre veya ruh hâli geçmişi canlandırma biçimimizi etkileyebilir",
  },
  "a28-recall-2": {
    answer: "Hatırlamayı etkileyebilir",
    evidence: "Olayın daha önce hatırlanmış biçimi de sonraki hatırlamayı etkileyebilir",
  },
  "a28-recall-3": {
    answer: "Her hatırlamanın mutlaka yanlış olduğu",
    evidence: "bu açıklama her hatırlamanın mutlaka yanlış olduğu anlamına gelmez",
  },
  "a28-nets-1": {
    answer: "Canlıların ağa takılması ve plastiklerin yayılması",
    evidence:
      "Hayalet ağlara takılan canlılar zarar görebilir; ağlar parçalandıkça küçük plastikler çevreye yayılabilir",
  },
  "a28-nets-2": {
    answer: "Denizde kaybolan ağların çevreye verdiği zarar",
    evidence:
      "Araştırmacılar bu sorunu azaltmaya yardımcı olabilecek mikroorganizmalarca parçalanan ağlar üzerinde çalışıyor",
  },
  "a28-nets-3": {
    answer: "Çözünmenin yaklaşık 24 ayda başlayabileceği",
    evidence: "çözünmenin yaklaşık 24 ayda başlayabildiği ve sıcak suda hızlanabildiği bildirilir",
  },
  "a28-telescope-1": {
    answer: "Işık toplama yeteneği",
    evidence: "Ayna ya da mercek alanı büyüdükçe daha fazla ışık toplanabilir",
  },
  "a28-telescope-2": {
    answer: "Şehir ışığı ve kirli hava gözlemi zorlaştırdığı için",
    evidence: "Şehir ışığı ve hava kirliliği gözlemi zorlaştırabilir",
  },
  "a28-telescope-3": {
    answer: "Atmosfer bazı ışınları soğurup saçabilir",
    evidence: "atmosfer kimi ışınları soğurur veya saçar",
  },
  "a28-debris-1": {
    answer: "Görev süresi biten bir uydu",
    evidence:
      "Görev süresi biten uydular, çarpışmada kopan parçalar ve fırlatma sırasında ayrılan bileşenler Dünya yörüngesinde kalabilir",
  },
  "a28-debris-2": {
    answer: "Yörüngedeki atık kirliliğini",
    evidence: "Bu nesnelerin oluşturduğu kirliliğe uzay çöpü denir",
  },
  "a28-debris-3": {
    answer: "Alternatif çözüm önerilerini",
    evidence: "uzay çöplerinin temizlenmesine yönelik alternatif çözüm önerilerini ele alır",
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

describe("P1-A Cycles 25–28 (stations 153–172)", () => {
  it("checks all 20 source-backed stations and all 60 answers against their reading text", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_25_28_SEQUENCES).toEqual([25, 26, 27, 28]);
    expect(EDUCATION_V2_P1_A_CYCLE_25_28).toHaveLength(4);
    expect(Object.keys(evidenceByQuestion)).toHaveLength(60);

    const sourceUrls = new Set<string>();
    const questionKeys = new Set<string>();
    const versionIds: string[] = [];
    const answerPositions = [0, 0, 0, 0];

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_25_28) {
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
        expect(station.sourceEvidence?.checkedOn).toBe(
          sequence === 28 ? "2026-10-18" : "2026-10-17",
        );
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

  it("links the exact 153–172 graph after Cycle 24 and keeps Cycle 33 unreleased", () => {
    const prior = learningRouteCycle("EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_24_G8_12");
    expect(prior).toBeDefined();
    expect(nextLearningRouteCycle(prior!.pathCode)?.sequence).toBe(25);
    const routes = LEARNING_ROUTE_CYCLES.filter((route) => route.routeFamily === "A");
    const p0StepCount = buildEducationV2P0LearningCycleManifest().steps.length;
    const stepsBefore25 = routes
      .filter((route) => route.sequence < 25)
      .reduce((count, route) => count + route.manifest.steps.length, p0StepCount);
    expect(stepsBefore25).toBe(152);

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_25_28) {
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

  it("uses a separate content-addressed release and enables only Cycles 25–28", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_DECISIONS).toEqual(
      [25, 26, 27, 28].map((sequence) => ({
        sequence,
        status: "OWNER_RELEASE_APPROVED",
        explicitPublicationApproved: true,
      })),
    );
    expect(EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/u);
    expect(EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_ID).toContain(
      EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_FINGERPRINT,
    );
    for (const sequence of [25, 26, 27, 28]) {
      expect(isEducationV2P1ACycle25To28ProductionAssignmentEnabled(sequence)).toBe(true);
    }
    for (const sequence of [24, 29]) {
      expect(isEducationV2P1ACycle25To28ProductionAssignmentEnabled(sequence)).toBe(false);
    }
    expect(educationV2P1ACycle25To28ProductionApproval("a".repeat(40))).toContain(
      EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_FINGERPRINT.toUpperCase(),
    );
  });

  it("authorizes only the exact read-only and protected graph scope", () => {
    expect(educationV2P1ACycle5To8ScopeSequences("CYCLES_25_TO_28")).toEqual([25, 26, 27, 28]);
    const request = {
      dryRun: true,
      operation: "PLAN_ONLY",
      confirmation: "PLAN_EDUCATION_V2_P1_A_CYCLES_25_TO_28",
      graphScope: "CYCLES_25_TO_28" as const,
      productionApproval: undefined,
      expectedProductionApproval: educationV2P1ACycle25To28ProductionApproval("a".repeat(40)),
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
      confirmation: "APPLY_EDUCATION_V2_P1_A_CYCLES_25_TO_28",
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
      sequence: 25 as const,
      releaseId: EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_ID,
      commit: "a".repeat(40),
      graphScope: "CYCLES_25_TO_28" as const,
    };
    const report = {
      status: "PASS",
      mode: "DRY_RUN",
      immutableReleaseId: expected.releaseId,
      productionReleaseId: expected.releaseId,
      expectedSourceCommit: expected.commit,
      productionReleaseCommit: expected.commit,
      graphScope: expected.graphScope,
      sequence: 25,
      state: "MISSING",
      dbChanged: false,
      stepCount: 5,
      contentCount: 5,
      exerciseCount: 5,
      questionCount: 15,
      assessmentCount: 1,
    };
    expect(validateCycle25To28ReadOnlyPlanReport(report, expected)).toEqual({
      valid: true,
      state: "MISSING",
    });
    expect(validateCycle25To28ReadOnlyPlanReport({ ...report, dbChanged: true }, expected)).toEqual(
      { valid: false, reason: "PLAN_REPORTED_WRITE" },
    );
    expect(validateCycle25To28ReadOnlyPlanReport({ ...report, sequence: 26 }, expected)).toEqual({
      valid: false,
      reason: "SEQUENCE_MISMATCH",
    });
    expect(
      validateCycle25To28ReadOnlyPlanReport({ ...report, questionCount: 14 }, expected),
    ).toEqual({ valid: false, reason: "RESOURCE_COUNTS_MISMATCH" });
  });

  it("requires same-run, read-only Cycle 25–28 PITR evidence before APPLY", () => {
    const nowMs = Date.now();
    const parentTimestamp = new Date(nowMs - 120_000).toISOString();
    const targetBranchId = "br-cycle25-28-test-restore";
    const expected = {
      runId: "12345",
      runAttempt: "1",
      sha: "a".repeat(40),
      database: "approved-db",
      role: "approved-role",
      port: "5432",
      scope: "cycle25-28" as const,
      graphScope: "CYCLES_25_TO_28" as const,
      nowMs,
    };
    const evidence = {
      status: "PASS",
      schemaVersion: 10,
      pitrScope: "cycle25-28",
      graphScope: "CYCLES_25_TO_28",
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
        name: "okupratik-cycle25-28-pitr-12345-attempt-1",
        projectId: CYCLE4_PITR_PROJECT_ID,
        parentId: CYCLE4_PITR_SOURCE_BRANCH_ID,
        parentTimestamp,
        default: false,
        state: "ready",
        annotationMatchesRun: true,
        annotationMatchesRunAttempt: true,
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
    expect(isCycle25To28PitrEvidenceValid(evidence, expected)).toBe(true);
    expect(
      isCycle25To28PitrEvidenceValid({ ...evidence, graphScope: "CYCLES_21_TO_24" }, expected),
    ).toBe(false);
    expect(isCycle25To28PitrEvidenceValid({ ...evidence, workflowRunAttempt: "2" }, expected)).toBe(
      false,
    );
  });

  it("keeps the protected workflow graph-only and verifies PITR before any APPLY step", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("default: PLAN_ONLY");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("CYCLE2528_GRAPH_SCOPE: CYCLES_25_TO_28");
    expect(workflow).toContain("scripts/verify-cycle25-28-pitr-evidence.ts");
    expect(workflow.indexOf("Enforce same-run Cycle 25–28 PITR evidence")).toBeLessThan(
      workflow.indexOf("Apply only missing Cycle 25–28 graphs"),
    );
    expect(workflow).toContain("scripts/verify-cycle25-28-plan-report.ts");
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("seed-education-v2-p1-a-cycle-5-8.ts --apply --all");
    expect(workflow).toContain("cycle25-*.json");
    expect(workflow).toContain("cycle26-*.json");
    expect(workflow).toContain("cycle27-*.json");
    expect(workflow).toContain("cycle28-*.json");
  });
});
