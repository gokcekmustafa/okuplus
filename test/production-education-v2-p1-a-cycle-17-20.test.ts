import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessOptionLengthQuality } from "../src/curriculum/option-length-quality.js";
import {
  EDUCATION_V2_P1_A_CYCLE_17_20,
  EDUCATION_V2_P1_A_CYCLE_17_20_SEQUENCES,
  getEducationV2P1ACycle,
  p1ACycle5To8AssessmentId,
  p1ACycle5To8ContentVersionId,
  p1ACycle5To8QuestionVersionId,
  p1ACycle5To8TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_DECISIONS,
  EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_FINGERPRINT,
  EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_ID,
  educationV2P1ACycle17To20ProductionApproval,
  isEducationV2P1ACycle17To20ProductionAssignmentEnabled,
} from "../src/curriculum/education-v2-p1-a-cycle-17-20-release.js";
import { isEducationV2P1ACycle5To8SeedRequestAuthorized } from "../src/curriculum/education-v2-p1-a-cycle-5-8-seed-policy.js";
import { educationV2P1ACycle5To8ScopeSequences } from "../src/curriculum/education-v2-p1-a-cycle-5-8-release.js";
import { EDUCATION_V2_P1_800_DRAFT_CYCLES } from "../src/curriculum/education-v2-p1-800-draft-cycles.js";
import {
  CYCLE4_PITR_EXPECTED_RETENTION_SECONDS,
  CYCLE4_PITR_PROJECT_ID,
  CYCLE4_PITR_SOURCE_BRANCH_ID,
  CYCLE4_PITR_REQUIRED_TABLES,
  cycle4PitrCompareSchemaEndpoint,
  isCycle17To20PitrEvidenceValid,
} from "../scripts/production-cycle4-pitr-restore-evidence.js";
import { validateCycle17To20ReadOnlyPlanReport } from "../scripts/verify-cycle17-20-plan-report.js";
import {
  LEARNING_ROUTE_CYCLES,
  buildPlannedLearningRouteNodes,
  matchesLearningRouteGraph,
  nextLearningRouteCycle,
} from "../src/curriculum/learning-route-catalog.js";
import { parseTrainingExerciseVersionConfig } from "../src/modules/training/exercise-contract.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-17-20.yml", import.meta.url),
  "utf8",
);

const evidenceByQuestion: Record<
  string,
  { answer: string; evidence: string; additionalEvidence?: string }
> = {
  "a17-tide-1": {
    answer: "Sistemin ortak kütle merkezinin",
    evidence: "sistemin ortak kütle merkezi çevresinde döner",
  },
  "a17-tide-2": {
    answer: "Dönme merkezine uzaklıkları farklıdır",
    evidence: "parçalarının dönme merkezine uzaklıkları farklıdır",
  },
  "a17-tide-3": {
    answer: "Gökcisminin biçiminde değişime",
    evidence: "gelgit kaynaklı değişimlere yol açabilir",
  },
  "a17-freeze-1": { answer: "Kar olarak", evidence: "kar olarak başlayan yağış" },
  "a17-freeze-2": {
    answer: "Soğuk hava katmanı yeterince inceyse",
    evidence:
      "Bu katman yeterince kalın değilse damlalar yere değmeden katılaşacak kadar zaman bulamayabilir",
  },
  "a17-freeze-3": {
    answer: "Yüzeyde ince bir buz tabakası bulunmasını",
    evidence: "ince bir buz tabakası oluşturur",
  },
  "a17-project-1": {
    answer: "Kâğıt türünün emme süresine etkisini",
    evidence: "farklı kâğıt türlerinin suyu ne kadar hızlı emdiğini",
  },
  "a17-project-2": {
    answer: "Kâğıt dışında koşulları sabit tutuyor",
    evidence:
      "kâğıt türünü değiştirirken damla sayısını, yüzey alanını ve ölçüm aracını sabit tutuyor",
  },
  "a17-project-3": {
    answer: "Ölçülen örneklerle",
    evidence: "yalnızca kendi ölçtüğü örnekler hakkında konuşuyor",
  },
  "a17-super-1": {
    answer: "Sürekli dönen yükselici hava akımıyla",
    evidence: "güçlü biçimde dönen yukarı yönlü sıcak hava akımı",
  },
  "a17-super-2": {
    answer: "Bunların süper hücreyle ilişkili olabileceğini",
    evidence: "tehlikeli olaylarla ilişkili olabilir",
  },
  "a17-super-3": {
    answer: "Hayır; metin bunun her mezosiklon için geçerli olmadığını söylüyor.",
    evidence: "her mezosiklon hortum oluşturmaz",
  },
  "a17-thermo-1": {
    answer: "Sistemlerin sıcaklık bakımından denge ilişkisini",
    evidence: "sıcaklık bakımından denge ilişkisini açıklar",
  },
  "a17-thermo-2": {
    answer: "Süreçler entropinin arttığı yönde ilerler.",
    evidence: "kendiliğinden gerçekleşen doğal süreçler entropinin arttığı yönde ilerler",
  },
  "a17-thermo-3": {
    answer: "Buhar makinesi",
    evidence: "Buhar makinesi",
  },
  "a18-tree-1": {
    answer: "Bahar ve yaz başında",
    evidence: "Açık renkli bölüm çoğunlukla bahar ve yaz başında",
  },
  "a18-tree-2": {
    answer: "Ilıman ve yağışlı bir yıla",
    evidence: "ılıman ve yağışlı bir yılda büyüme halkası geniş",
  },
  "a18-tree-3": {
    answer: "Halka, yıllık büyüme koşulları için dolaylı kanıttır",
    evidence: "yıllık büyüme koşullarına ilişkin dolaylı kanıt sağlar",
  },
  "a18-sun-1": {
    answer: "Güçlü manyetik alanlı Güneş yüzeyinde",
    evidence: "yüzeyde manyetik alanın güçlü olduğu bölgelerde görülür",
  },
  "a18-sun-2": {
    answer: "Güneş kaynaklı bazı olaylar Dünya'ya ulaştığında",
    evidence: "Dünya'ya ulaştığında radyo iletişimini geçici olarak etkileyebilir",
  },
  "a18-sun-3": {
    answer: "Etki, olayın türüne ve Dünya'ya ulaşmasına bağlıdır",
    evidence: "Etkinin oluşması olayın türüne, yönüne ve Dünya'ya ulaşmasına bağlıdır",
  },
  "a18-moon-1": {
    answer: "Daha alçak ve düz bölgeler olarak",
    evidence: "koyu alanların çoğunlukla daha alçak ve düz",
  },
  "a18-moon-2": {
    answer: "Hayır; ad tarihsel, bugünkü su varlığını göstermez.",
    evidence: "bu bölgelerin bugün suyla kaplı olduğu anlamına gelmez",
  },
  "a18-moon-3": {
    answer: "Gözlemi kayaç kanıtlarıyla karşılaştırarak",
    evidence: "Kayaç örnekleri de bu alanların bileşimini karşılaştırmaya yardım eder",
    additionalEvidence: "Daha sonra gözlemler",
  },
  "a18-ocean-1": {
    answer: "Kendi başına hareket etmeyen nesnelerin",
    evidence: "kendi başına hareket etmeyen maddelerin taşınma süresini tahmin etti",
  },
  "a18-ocean-2": {
    answer: "Gözlem 3,6 yıl; model tahmini 3,5 yıl.",
    evidence: "ABD'nin batı kıyılarına ulaşması 3,6 yıl sürdü",
    additionalEvidence: "Model aynı yolculuk için 3,5 yıl tahmin etti",
  },
  "a18-ocean-3": {
    answer: "Modelin bu örnekte işe yaradığını",
    evidence: "modelin bu örnekte işe yaradığını destekler",
  },
  "a18-climate-1": {
    answer: "Ağaç halkası ve buz katmanı gibi doğal kayıtlar",
    evidence: "ağaç halkaları, buz katmanları ve mercanlar gibi doğal kayıtları inceler",
  },
  "a18-climate-2": {
    answer: "Geçmiş çevre koşulları hakkındaki çıkarımı güçlendirebilir",
    evidence: "Farklı kayıtların birlikte değerlendirilmesi çıkarımı güçlendirebilir",
  },
  "a18-climate-3": {
    answer: "Tek kayıt sınırlı ve dolaylı kanıt sunduğu için",
    evidence: "tek bir halkadan bütün gezegenin o yılki iklimini kesinleştirmek doğru değildir",
  },
  "a19-whale-1": {
    answer: "12,65 metre uzunluğunda",
    evidence: "12,65 metrelik bir birey kaydedilmiştir",
  },
  "a19-whale-2": {
    answer: "Bilimsel ölçüm yerine gözleme dayanabildikleri için",
    evidence: "bilimsel ölçümden çok gözleme dayanır",
  },
  "a19-whale-3": {
    answer: "Ölçümün nasıl alındığını da incelemeyi",
    evidence: "ölçümün nasıl alındığına da bakmak gerekir",
  },
  "a19-popcorn-1": {
    answer: "Buharın sert kabuk altında birikmesi",
    evidence: "kabuğu buharın hemen dışarı çıkmasını önler",
  },
  "a19-popcorn-2": {
    answer: "Buhar dışarı çıkar, basınç daha az birikir",
    evidence: "buhar delikten kaçabilir; böylece basınç birikmesi zorlaşır",
  },
  "a19-popcorn-3": {
    answer: "Su buharlaşır, basınç artar, kabuk çatlar",
    evidence: "İçeride biriken basınç yeterince yükseldiğinde kabuk çatlar",
  },
  "a19-woodpecker-1": {
    answer: "Larva aramak ve iletişim kurmak için",
    evidence: "böcek larvalarını bulmak hem de iletişim kurmak",
  },
  "a19-woodpecker-2": {
    answer: "Kuvveti beynin bulunduğu bölgeden uzağa yönlendirmeyi",
    evidence: "kuvveti azaltmak yerine beynin bulunduğu bölgeden uzağa yönlendirebildiğini",
  },
  "a19-woodpecker-3": {
    answer: "Beyin boyutu ve kafatası boşluğu da etkili olduğu için",
    evidence: "Küçük ve hafif beyin ile dar kafatası boşluğu",
  },
  "a19-satellite-1": {
    answer: "Çevrede ısı taşıyacak ortam bulunmadığı için",
    evidence: "uydunun çevresinde Dünya'daki hava gibi yoğun bir ortam bulunmaz",
  },
  "a19-satellite-2": { answer: "Isı alışverişini dengelemek", evidence: "bu alışverişi dengeler" },
  "a19-satellite-3": {
    answer: "Gölge ve Güneş'e dönük yüzey alanının değişmesi",
    evidence: "Gölgeye girme, Güneş'e dönük yüzey alanı",
  },
  "a19-surface-1": {
    answer: "Yüzey gerilimi ve suyu iten tüysü bacaklar",
    evidence: "Yüzey gerilimi",
    additionalEvidence: "suyu iten tüysü bacakları",
  },
  "a19-surface-2": {
    answer: "Ayağını suya çarparken ürettiği yukarı yönlü kuvvet",
    evidence: "ayağını suya hızla çarparak yukarı yönlü kuvvet oluşturur",
  },
  "a19-surface-3": {
    answer: "Boyut ve hareket farkı farklı destekler gerektirdiği için",
    evidence:
      "küçük böceğin ağırlığı ile büyük kertenkelenin hareketi aynı mekanizmayla açıklanmaz",
  },
  "a20-led-1": {
    answer: "Elektron daha düşük enerjili duruma geçerken",
    evidence: "Elektronlar daha düşük enerjili bir duruma geçerken enerji açığa çıkar",
  },
  "a20-led-2": {
    answer: "Yüksek enerjili ışık için kaliteli kristal gerekmesi",
    evidence: "Mavi ışık daha yüksek enerji taşıdığından",
  },
  "a20-led-3": {
    answer: "Beyaz ışık ve ekranlarda mavi ışığa ihtiyaç duyulması",
    evidence: "verimli beyaz aydınlatma ve modern ekranlar için mavi ışık da gerekliydi",
  },
  "a20-supercool-1": {
    answer: "Donma noktasının altında bir süre sıvı kalması",
    evidence: "bu sıcaklığın altına indiği hâlde bir süre sıvı kalabilir",
  },
  "a20-supercool-2": {
    answer: "Kristal oluşumunun başlaması gecikebildiği için",
    evidence: "kristal başlangıcının gecikmesi",
  },
  "a20-supercool-3": {
    answer: "Kristalleşme başlar ve su hızla katılaşabilir",
    evidence: "buz, kristal oluşumunu başlatabilir ve su hızla katılaşabilir",
  },
  "a20-glass-1": {
    answer: "Görünür ışık camdan çoğunlukla geçer",
    evidence: "görünür ışığı büyük ölçüde geçirebilir",
  },
  "a20-glass-2": {
    answer: "Görünür ışık cam elektronlarını uyarmaya yetmez",
    evidence: "gereken enerji, görünür ışığın taşıdığından daha yüksektir",
  },
  "a20-glass-3": {
    answer: "Camın tüm ışık türlerini aynı biçimde geçirdiği genellemesini",
    evidence: "Daha yüksek enerjili bazı ışınlar ise soğurulabilir",
  },
  "a20-beaks-1": {
    answer: "Gaga, yiyecek toplama ve parçalamada kullanıldığı için",
    evidence: "gaganın başlıca işlevlerinden biri yiyecek toplamaktır",
    additionalEvidence: "gagalarıyla parçalar",
  },
  "a20-beaks-2": {
    answer: "Tohumları delip ezmeye",
    evidence: "bu yapı tohumu delmeye veya ezmeye yardım eder",
  },
  "a20-beaks-3": {
    answer: "Gaga tek başına tür sınıflandırmasına yetmez",
    evidence: "kuş türleri yalnızca gagalarına göre sınıflandırılmaz",
  },
  "a20-goat-1": {
    answer: "270 derecelik bir görüş açısı",
    evidence: "yaklaşık 270 derecelik geniş bir açıyla görmelerine yardımcı olur",
  },
  "a20-goat-2": {
    answer: "Fazla ışığı süzüp parlama etkisini azaltması",
    evidence: "fazla ışığı süzerek kör edici yansımaları azaltmaya",
  },
  "a20-goat-3": {
    answer: "Geniş görüş ve ışık kontrolü çevreyi izlemeyi destekler",
    evidence: "yiyecek arama ve çevredeki tehlikelere karşı hazırlıklı olma açısından yarar sağlar",
    additionalEvidence: "yaklaşık 270 derecelik geniş bir açıyla görmelerine yardımcı olur",
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

describe("P1-A source-verified Cycles 17–20 package", () => {
  it("checks all 20 source-adapted stations and 60 answers against explicit text evidence", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_17_20_SEQUENCES).toEqual([17, 18, 19, 20]);
    expect(EDUCATION_V2_P1_A_CYCLE_17_20).toHaveLength(4);
    const sourceUrls = new Set<string>();
    const questionKeys = new Set<string>();
    const versionIds: string[] = [];
    const answerPositions = [0, 0, 0, 0];

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_17_20) {
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
      expect(program.path.code).toContain("_G8_12");
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
          const correct = question.options.find((option) => option.id === question.correctOptionId);
          expect(correct?.text).toBe(evidence!.answer);
          expect(station.text.toLocaleLowerCase("tr-TR"), question.key).toContain(
            evidence!.evidence.toLocaleLowerCase("tr-TR"),
          );
          if (evidence!.additionalEvidence) {
            expect(station.text.toLocaleLowerCase("tr-TR"), question.key).toContain(
              evidence!.additionalEvidence.toLocaleLowerCase("tr-TR"),
            );
          }
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
    const existingVersionIds = new Set<string>();
    for (const sequence of [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      const cycle = getEducationV2P1ACycle(sequence)!;
      for (const content of cycle.program.content) {
        existingVersionIds.add(p1ACycle5To8ContentVersionId(sequence, content.key));
      }
      for (const exercise of cycle.program.exercises) {
        existingVersionIds.add(p1ACycle5To8TemplateVersionId(sequence, exercise.key));
        for (const question of exercise.questions) {
          existingVersionIds.add(
            p1ACycle5To8QuestionVersionId(sequence, `${exercise.key}-${question.key}`),
          );
        }
      }
      for (const assessment of cycle.program.assessments) {
        existingVersionIds.add(p1ACycle5To8AssessmentId(sequence, assessment.key));
      }
    }
    expect(versionIds.some((versionId) => existingVersionIds.has(versionId))).toBe(false);
    expect(Math.max(...answerPositions) - Math.min(...answerPositions)).toBeLessThanOrEqual(2);

    const allSourceUrls = EDUCATION_V2_P1_800_DRAFT_CYCLES.flatMap((cycle) =>
      cycle.routeFamily === "A"
        ? cycle.sourceStations.flatMap((station) =>
            station.sourceEvidence?.url ? [station.sourceEvidence.url] : [],
          )
        : [],
    );
    for (const url of sourceUrls) {
      expect(allSourceUrls.filter((candidate) => candidate === url)).toHaveLength(1);
    }
  });

  it("keeps the corrected source claims, skills, numbers, and question versions precise", () => {
    const cycle17 = getEducationV2P1ACycle(17)!.sourceCycle.sourceStations;
    const supercell = cycle17.find((station) => station.key.endsWith("A17_INTEGRATED_SUPERCELL"))!;
    const supercellQuestion2 = supercell.questions.find(({ key }) => key === "a17-super-2")!;
    expect(supercellQuestion2.versionId).toMatch(/_V2$/u);
    expect(supercellQuestion2.explanation).toContain("Son cümle");
    expect(supercellQuestion2.explanation).toContain("ilişkili olabileceğini");
    expect(supercellQuestion2.hint).toContain("Son cümledeki");
    const supercellQuestion = supercell.questions.find(({ key }) => key === "a17-super-3")!;
    expect(supercell.text).not.toMatch(/radar|tek bir bulut görüntüsü|yerde yaşanacak sonuç/iu);
    expect(supercellQuestion.prompt).toBe("Metne göre her mezosiklon hortum oluşturur mu?");
    expect(supercellQuestion.versionId).toMatch(/_V2$/u);

    const thermodynamics = cycle17.find((station) =>
      station.key.endsWith("A17_ASSESSMENT_THERMODYNAMICS"),
    )!;
    expect(thermodynamics.skillCodes).toEqual(["RC_DETAIL", "RC_CAUSE_EFFECT"]);
    expect(thermodynamics.text).toContain("Entropi, en genel anlamıyla düzensizliğin ölçüsüdür");
    expect(thermodynamics.text).not.toMatch(
      /makinenin verimi|ölçümleri gerekir|ideal bir kristal/iu,
    );
    const zerothLawQuestion = thermodynamics.questions.find(({ key }) => key === "a17-thermo-1")!;
    expect(zerothLawQuestion.versionId).toMatch(/_V2$/u);
    expect(zerothLawQuestion.explanation).toContain("Üçüncü cümle");
    expect(zerothLawQuestion.hint).toContain("Üçüncü cümle");
    expect(
      thermodynamics.questions
        .filter(({ key }) => key.startsWith("a17-thermo-"))
        .map(({ versionId }) => versionId.endsWith("_V2")),
    ).toEqual([true, true, true]);

    const cycle18 = getEducationV2P1ACycle(18)!.sourceCycle.sourceStations;
    const moon = cycle18.find((station) => station.key.endsWith("A18_COMMON_MOON_DARK_REGIONS"))!;
    const moonQuestion = moon.questions.find(({ key }) => key === "a18-moon-2")!;
    expect(moonQuestion.prompt).toBe(
      "Maria adı bu bölgelerin bugün suyla kaplı olduğunu kanıtlar mı?",
    );
    expect(moonQuestion.options.filter(({ text }) => text.startsWith("Evet;")).length).toBe(3);
    expect(moonQuestion.versionId).toMatch(/_V2$/u);

    const ocean = cycle18.find((station) =>
      station.key.endsWith("A18_INTEGRATED_OCEAN_TRANSPORT"),
    )!;
    const oceanQuestion = ocean.questions.find(({ key }) => key === "a18-ocean-2")!;
    expect(ocean.text).toContain("ulaşması 3,6 yıl sürdü");
    expect(ocean.text).toContain("Model aynı yolculuk için 3,5 yıl tahmin etti");
    expect(oceanQuestion.versionId).toMatch(/_V2$/u);

    const cycle20 = getEducationV2P1ACycle(20)!.sourceCycle.sourceStations;
    const revisedQuestionKeys = [
      "a20-led-1",
      "a20-led-2",
      "a20-led-3",
      "a20-supercool-1",
      "a20-supercool-2",
      "a20-supercool-3",
      "a20-glass-1",
      "a20-glass-2",
      "a20-glass-3",
    ];
    const revisedQuestions = cycle20
      .flatMap((station) => station.questions)
      .filter((question) => revisedQuestionKeys.includes(question.key));
    expect(revisedQuestions).toHaveLength(9);
    for (const question of revisedQuestions) {
      expect(question.versionId, question.key).toMatch(/_V2$/u);
      expect(new Set(question.options.map(({ text }) => text)).size, question.key).toBe(4);
      expect(question.options.map(({ text }) => text).join(" "), question.key).not.toMatch(
        /her zaman|hiçbir zaman|bütünüyle|tamamen/iu,
      );
    }

    const cycle19 = getEducationV2P1ACycle(19)!.sourceCycle.sourceStations;
    const surface = cycle19.find((station) =>
      station.key.endsWith("A19_ASSESSMENT_SURFACE_WALKING_EVIDENCE"),
    )!;
    const surfaceQuestion = surface.questions.find(({ key }) => key === "a19-surface-1")!;
    expect(surfaceQuestion.explanation).toBe(
      "İkinci ve üçüncü cümle yüzey gerilimi ile suyu iten bacak yapılarını birlikte açıklar.",
    );
  });

  it("connects Cycle 16 through 20 while keeping unpublished cycles locked", () => {
    const cycle16 = getEducationV2P1ACycle(16)!;
    const catalog16 = LEARNING_ROUTE_CYCLES.find(
      (cycle) => cycle.routeFamily === "A" && cycle.sequence === 16,
    )!;
    expect(nextLearningRouteCycle(catalog16.pathCode)?.sequence).toBe(17);
    for (const sequence of [17, 18, 19, 20]) {
      const cycle = getEducationV2P1ACycle(sequence)!;
      const catalog = LEARNING_ROUTE_CYCLES.find(
        (item) => item.routeFamily === "A" && item.sequence === sequence,
      )!;
      expect(catalog.pathCode).toBe(cycle.program.path.code);
      expect(catalog.programId).toBe(cycle.program.programId);
      expect(catalog.manifest).toBe(cycle.manifest);
      expect(matchesLearningRouteGraph(graphFor(sequence))).toBe(true);
      expect(catalog.publicationApproved()).toBe(false);
      expect(catalog.authoringStatus).toBe("DRAFT_NOT_RELEASED");
      expect(nextLearningRouteCycle(catalog.pathCode)?.sequence).toBe(sequence + 1);
    }
    expect(cycle16.manifest.steps).toHaveLength(5);
    const planned = buildPlannedLearningRouteNodes({
      currentPathCode: catalog16.pathCode,
      visibleStationCount: 112,
      targetStationCount: 132,
    }).filter(
      (node) => node.cycleSequence !== null && node.cycleSequence >= 17 && node.cycleSequence <= 20,
    );
    expect(planned).toHaveLength(20);
    expect(
      planned.every((node) => node.status === "locked" && node.availability === "UNAVAILABLE"),
    ).toBe(true);
  });

  it("uses an independent release identity and preserves the owner publication gate", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_DECISIONS).toEqual(
      [17, 18, 19, 20].map((sequence) => ({
        sequence,
        status: "OWNER_RELEASE_REQUIRED",
        explicitPublicationApproved: false,
      })),
    );
    expect(EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/u);
    expect(EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_ID).toContain(
      EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_FINGERPRINT,
    );
    for (const sequence of [17, 18, 19, 20]) {
      expect(isEducationV2P1ACycle17To20ProductionAssignmentEnabled(sequence)).toBe(false);
    }
    const approval = educationV2P1ACycle17To20ProductionApproval("a".repeat(40));
    expect(approval).toContain(EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_FINGERPRINT.toUpperCase());
    expect(approval).toContain("A".repeat(40));
    expect(educationV2P1ACycle5To8ScopeSequences("CYCLES_17_TO_20")).toEqual([17, 18, 19, 20]);

    const planRequest = {
      dryRun: true,
      operation: "PLAN_ONLY",
      confirmation: "PLAN_EDUCATION_V2_P1_A_CYCLES_17_TO_20",
      graphScope: "CYCLES_17_TO_20" as const,
      productionApproval: undefined,
      expectedProductionApproval: approval,
      protectedProductionWorkflow: true,
    };
    expect(isEducationV2P1ACycle5To8SeedRequestAuthorized(planRequest)).toBe(true);
    expect(
      isEducationV2P1ACycle5To8SeedRequestAuthorized({
        ...planRequest,
        graphScope: "CYCLES_13_TO_16",
      }),
    ).toBe(false);
    expect(
      isEducationV2P1ACycle5To8SeedRequestAuthorized({
        ...planRequest,
        confirmation: "APPLY_EDUCATION_V2_P1_A_CYCLES_17_TO_20",
      }),
    ).toBe(false);
  });

  it("rejects altered, write-reporting, wrong-release and wrong-commit PLAN_ONLY reports", () => {
    const expected = {
      sequence: 17 as const,
      releaseId: "release-17",
      commit: "a".repeat(40),
      graphScope: "CYCLES_17_TO_20" as const,
    };
    const report = {
      status: "PASS",
      mode: "DRY_RUN",
      immutableReleaseId: expected.releaseId,
      productionReleaseId: expected.releaseId,
      expectedSourceCommit: expected.commit,
      productionReleaseCommit: expected.commit,
      graphScope: expected.graphScope,
      sequence: 17,
      state: "MISSING",
      dbChanged: false,
      stepCount: 5,
      contentCount: 5,
      exerciseCount: 5,
      questionCount: 15,
      assessmentCount: 1,
    };
    expect(validateCycle17To20ReadOnlyPlanReport(report, expected)).toEqual({
      valid: true,
      state: "MISSING",
    });
    expect(
      validateCycle17To20ReadOnlyPlanReport({ ...report, state: "SKILL_LINKS_MISSING" }, expected),
    ).toEqual({ valid: true, state: "SKILL_LINKS_MISSING" });
    expect(validateCycle17To20ReadOnlyPlanReport({ ...report, dbChanged: true }, expected)).toEqual(
      {
        valid: false,
        reason: "PLAN_REPORTED_WRITE",
      },
    );
    expect(validateCycle17To20ReadOnlyPlanReport({ ...report, sequence: 16 }, expected)).toEqual({
      valid: false,
      reason: "SEQUENCE_MISMATCH",
    });
    expect(
      validateCycle17To20ReadOnlyPlanReport({ ...report, productionReleaseId: "old" }, expected),
    ).toEqual({
      valid: false,
      reason: "RELEASE_ID_MISMATCH",
    });
    expect(
      validateCycle17To20ReadOnlyPlanReport({ ...report, graphScope: "CYCLES_13_TO_16" }, expected),
    ).toEqual({
      valid: false,
      reason: "GRAPH_SCOPE_MISMATCH",
    });
    expect(
      validateCycle17To20ReadOnlyPlanReport(
        { ...report, productionReleaseCommit: "b".repeat(40) },
        expected,
      ),
    ).toEqual({
      valid: false,
      reason: "RELEASE_COMMIT_MISMATCH",
    });
    expect(
      validateCycle17To20ReadOnlyPlanReport({ ...report, questionCount: 14 }, expected),
    ).toEqual({
      valid: false,
      reason: "RESOURCE_COUNTS_MISMATCH",
    });
  });

  it("requires same-run PITR scope, release commit and target checks before any APPLY step", () => {
    const nowMs = Date.now();
    const parentTimestamp = new Date(nowMs - 120_000).toISOString();
    const targetBranchId = "br-cycle17-20-test-restore";
    const expected = {
      runId: "12345",
      runAttempt: "1",
      sha: "a".repeat(40),
      database: "approved-db",
      role: "approved-role",
      port: "5432",
      scope: "cycle17-20" as const,
      graphScope: "CYCLES_17_TO_20" as const,
      nowMs,
    };
    const evidence = {
      status: "PASS",
      schemaVersion: 7,
      pitrScope: "cycle17-20",
      graphScope: "CYCLES_17_TO_20",
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
    expect(isCycle17To20PitrEvidenceValid(evidence, expected)).toBe(true);
    expect(
      isCycle17To20PitrEvidenceValid({ ...evidence, workflowRunId: "other-run" }, expected),
    ).toBe(false);
    expect(
      isCycle17To20PitrEvidenceValid({ ...evidence, sourceCommit: "b".repeat(40) }, expected),
    ).toBe(false);
    expect(
      isCycle17To20PitrEvidenceValid({ ...evidence, graphScope: "CYCLES_13_TO_16" }, expected),
    ).toBe(false);
    expect(
      isCycle17To20PitrEvidenceValid({ ...evidence, studentProgressChanged: true }, expected),
    ).toBe(false);

    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("default: PLAN_ONLY");
    expect(workflow).toContain("CYCLE1720_GRAPH_SCOPE: CYCLES_17_TO_20");
    expect(workflow).toContain("scripts/verify-cycle17-20-pitr-evidence.ts");
    expect(workflow.indexOf("Enforce same-run Cycle 17–20 PITR evidence")).toBeLessThan(
      workflow.indexOf("Apply only missing Cycle 17–20 graphs"),
    );
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("seed-education-v2-p1-a-cycle-5-8.ts --apply --all");
  });
});
