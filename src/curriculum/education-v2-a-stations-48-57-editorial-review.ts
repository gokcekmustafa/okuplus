import {
  EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE,
  p1ACycle4ContentVersionId,
  p1ACycle4Id,
  p1ACycle4QuestionVersionId,
  p1ACycle4TemplateVersionId,
} from "./education-v2-p1-a-cycle-4-program.js";
import { getEducationV2P1ExpansionDraftCycle } from "./education-v2-p1-800-draft-cycles.js";
import {
  EDUCATION_V2_P1_A_CYCLE_5_8,
  p1ACycle5To8ContentVersionId,
  p1ACycle5To8Id,
  p1ACycle5To8QuestionVersionId,
  p1ACycle5To8TemplateVersionId,
} from "./education-v2-p1-a-cycle-5-8-program.js";

const cycle5Source = getEducationV2P1ExpansionDraftCycle("A", 5);
const cycle5Program = EDUCATION_V2_P1_A_CYCLE_5_8.find((cycle) => cycle.sequence === 5);
if (!cycle5Source || !cycle5Program) {
  throw new Error("İstasyon 53–57 için Cycle 5 kaynak kaydı bulunamadı.");
}

const editorialNotes: Readonly<Record<string, string>> = {
  EDU_V2_P1_A_EXPANSION_4_A4_FAST_READING:
    "Duyuru metni, gün-saat, buluşma noktası ve koşullu değişikliği doğrudan destekliyor.",
  EDU_V2_P1_A_EXPANSION_4_A4_COMPREHENSION:
    "Yağmur bahçesi anlatısı ve sorular kendi içinde tutarlı; deney sonucu dış kaynakla doğrulanmış gibi sunulmuyor.",
  EDU_V2_P1_A_EXPANSION_4_A4_COMMON_STRATEGY:
    "İlk sorunun sessizlik sonucu metinde kanıtlanmıyor; sürümlü aday soruyu yalnızca metindeki iki düzenlemeyi bulacak şekilde daraltıyor.",
  EDU_V2_P1_A_EXPANSION_4_A4_INTEGRATED:
    "Metin tablo içermiyor; başlık, kazanım ve öğrenci yönergesi tablo varsayımından arındırıldı.",
  EDU_V2_P1_A_EXPANSION_4_A4_ASSESSMENT:
    "Amaç, sayısal ayrıntı ve genelleme sınırı metinde açık; soru ve cevaplar bu sınırla uyumlu.",
  EDU_V2_P1_A_EXPANSION_5_A5_FAST_READING:
    "Duyuru paragrafı tablo değil; yeni sürümlü başlık ve kazanım metin türünü doğru adlandırıyor.",
  EDU_V2_P1_A_EXPANSION_5_A5_COMPREHENSION:
    "Tamir günü metni ile ayrıntı/ana düşünce soruları tutarlı; metin özgün yazım olarak işaretli kalıyor.",
  EDU_V2_P1_A_EXPANSION_5_A5_STRATEGY:
    "‘Ancak’ ve ‘bu nedenle’ ilişkileri metinde açıkça kurulmuş ve sorular doğru ilişkiyi hedefliyor.",
  EDU_V2_P1_A_EXPANSION_5_A5_INTEGRATED:
    "Ölçüm günleri, sulama koşulu ve gezi günü çözümü metinde açık; sorular bu bilgileri aşıp genelleme yapmıyor.",
  EDU_V2_P1_A_EXPANSION_5_A5_ASSESSMENT:
    "Sergi içeriği ve belirtilmeyen karar ayrımı metinde açık; değerlendirme soruları doğrudan kanıta dayanıyor.",
};

/**
 * Internal editorial pass for the ten authored stations 48–57. This does not
 * certify external sources: these records remain ORIGINAL_AUTHORING and
 * REVIEW_REQUIRED unless a source is independently documented.
 */
export const EDUCATION_V2_A_STATIONS_48_57_EDITORIAL_REVIEW = [
  ...EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sourceStations.map((station, index) => ({
    stationNumber: 48 + index,
    sequence: 4,
    stationKey: station.key,
    title: station.title,
    category: station.category,
    skillCodes: [...station.skillCodes],
    questionKeys: station.questions.map((question) => question.key),
    contentOrigin: station.contentOrigin,
    provenanceStatus: station.provenanceStatus,
    sourceEvidencePresent: Boolean(station.sourceEvidence),
    editorialStatus: station.key.endsWith("A4_COMMON_STRATEGY")
      ? "VERSIONED_CORRECTION_CANDIDATE"
      : station.key.endsWith("A4_INTEGRATED")
        ? "VERSIONED_METADATA_CANDIDATE"
        : "INTERNAL_REVIEWED_SOURCE_UNVERIFIED",
    finding: editorialNotes[station.key],
  })),
  ...cycle5Source.sourceStations.map((station, index) => ({
    stationNumber: 53 + index,
    sequence: 5,
    stationKey: station.key,
    title: station.title,
    category: station.category,
    skillCodes: [...station.skillCodes],
    questionKeys: station.questions.map((question) => question.key),
    contentOrigin: station.contentOrigin,
    provenanceStatus: station.provenanceStatus,
    sourceEvidencePresent: Boolean(station.sourceEvidence),
    editorialStatus: station.key.endsWith("A5_FAST_READING")
      ? "VERSIONED_METADATA_CANDIDATE"
      : "INTERNAL_REVIEWED_SOURCE_UNVERIFIED",
    finding: editorialNotes[station.key],
  })),
] as const;

const cycle4CommonKey = "EDU_V2_P1_A_EXPANSION_4_A4_COMMON_STRATEGY";
const cycle4IntegratedKey = "EDU_V2_P1_A_EXPANSION_4_A4_INTEGRATED";
const cycle4Common = EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.exercises.find(
  (exercise) => exercise.key === cycle4CommonKey,
)!;
const cycle4Integrated = EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.exercises.find(
  (exercise) => exercise.key === cycle4IntegratedKey,
)!;
const cycle4IntegratedSource = EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sourceStations.find(
  (station) => station.key === cycle4IntegratedKey,
)!;
const cycle4CommonSource = cycle4Common.questions.find(
  (question) => question.key === "a4-common-1",
)!;
const cycle5FastKey = "EDU_V2_P1_A_EXPANSION_5_A5_FAST_READING";
const cycle5Fast = cycle5Program.program.exercises.find(
  (exercise) => exercise.key === cycle5FastKey,
)!;
const cycle5FastSource = cycle5Source.sourceStations.find(
  (station) => station.key === cycle5FastKey,
)!;
const cycle5FastContent = cycle5Program.program.content.find(
  (content) => content.key === cycle5Fast.contentKey,
)!;

const cycle4CommonQuestion = {
  ...cycle4CommonSource,
  prompt: "Metne göre yeni çalışma bölümünde hangi iki düzenleme yapıldı?",
  options: [
    { id: "a", text: "Masalar sık yerleştirildi; kulaklıklar girişte bırakıldı.", position: 1 },
    {
      id: "b",
      text: "Masalar aralıklı yerleştirildi; kulaklıklar salonda bırakıldı.",
      position: 2,
    },
    {
      id: "c",
      text: "Masalar aralıklı yerleştirildi; kulaklıklar girişte bırakıldı.",
      position: 3,
    },
    { id: "d", text: "Masalar düzenlenmedi; kulaklıklar girişte bırakıldı.", position: 4 },
  ],
  correctOptionId: "c",
  explanation:
    "Metin masaların aralıklı yerleştirildiğini ve ödünç kulaklıkların girişte bırakıldığını söylüyor; bunların sessizlik sağladığını ayrıca iddia etmiyor.",
  hint: "Metindeki iki düzenlemeyi aynen bul; etkileri hakkında ek varsayım yapma.",
};

export const EDUCATION_V2_P1_A_CYCLE_4_EDITORIAL_CANDIDATE = {
  status: "VERSIONED_EDITORIAL_CANDIDATE" as const,
  publicationApproved: false as const,
  editorialReviewStatus: "REVIEW_REQUIRED" as const,
  baseProgramId: EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.programId,
  sequence: 4,
  stepMetadataChanges: [
    {
      stationNumber: 51,
      stationKey: cycle4IntegratedKey,
      baseTitle: cycle4Integrated.title,
      title: "Işık süresiyle gözlem sonucunu karşılaştır",
      baseLearningOutcome: cycle4IntegratedSource.outcome,
      learningOutcome:
        "İki ölçüm süresini gözlemle karşılaştırır ve tek denemeden genelleme yapmaz.",
      exerciseInstructions:
        "İki ışık süresini ve gözlem sonucunu karşılaştır; tek denemeyi genelleme.",
      exerciseTitle: "Işık süresini ve gözlemi karşılaştır",
      contentVersionId: p1ACycle4ContentVersionId(cycle4Integrated.contentKey),
    },
  ],
  changedQuestions: [
    {
      stationNumber: 50,
      exerciseKey: cycle4Common.key,
      questionKey: cycle4CommonQuestion.key,
      baseQuestionVersionId: p1ACycle4QuestionVersionId(cycle4Common.key, cycle4CommonQuestion.key),
      questionVersionId: p1ACycle4Id(
        "questionVersion",
        `${cycle4Common.key}-${cycle4CommonQuestion.key}-v5`,
      ),
      answerKeyChanged: false,
      question: cycle4CommonQuestion,
    },
  ],
  templateVersions: [
    {
      exerciseKey: cycle4Common.key,
      baseTemplateVersionId: p1ACycle4TemplateVersionId(cycle4Common.key),
      templateVersionId: p1ACycle4Id("templateVersion", `${cycle4Common.key}-v5`),
      contentVersionId: p1ACycle4ContentVersionId(cycle4Common.contentKey),
      questionVersionIds: cycle4Common.questions.map((question) =>
        question.key === cycle4CommonQuestion.key
          ? p1ACycle4Id("questionVersion", `${cycle4Common.key}-${question.key}-v5`)
          : p1ACycle4QuestionVersionId(cycle4Common.key, question.key),
      ),
    },
    {
      exerciseKey: cycle4Integrated.key,
      baseTemplateVersionId: p1ACycle4TemplateVersionId(cycle4Integrated.key),
      templateVersionId: p1ACycle4Id("templateVersion", `${cycle4Integrated.key}-v5`),
      exerciseTitle: "Işık süresini ve gözlemi karşılaştır",
      exerciseInstructions:
        "İki ışık süresini ve gözlem sonucunu karşılaştır; tek denemeyi genelleme.",
      contentVersionId: p1ACycle4ContentVersionId(cycle4Integrated.contentKey),
      questionVersionIds: cycle4Integrated.questions.map((question) =>
        p1ACycle4QuestionVersionId(cycle4Integrated.key, question.key),
      ),
    },
  ],
};

export const EDUCATION_V2_P1_A_CYCLE_5_STATION_53_EDITORIAL_CANDIDATE = {
  status: "VERSIONED_EDITORIAL_CANDIDATE" as const,
  publicationApproved: false as const,
  editorialReviewStatus: "REVIEW_REQUIRED" as const,
  contentOrigin: cycle5FastSource.contentOrigin,
  provenanceStatus: cycle5FastSource.provenanceStatus,
  sourceEvidence: cycle5FastSource.sourceEvidence ?? null,
  stationNumber: 53,
  stationKey: cycle5Fast.key,
  base: {
    title: cycle5Fast.title,
    learningOutcome: cycle5FastSource.outcome,
    contentVersionId: p1ACycle5To8ContentVersionId(5, cycle5FastContent.key),
    templateVersionId: p1ACycle5To8TemplateVersionId(5, cycle5Fast.key),
    questionVersionIds: cycle5Fast.questions.map((question) =>
      p1ACycle5To8QuestionVersionId(5, `${cycle5Fast.key}-${question.key}`),
    ),
  },
  candidate: {
    title: "Duyurudaki gerekli bilgiyi hızla bul",
    learningOutcome:
      "Bir etkinlik duyurusunda aranan ayrıntıyı hızla bulur ve ilgili cümleyle doğrular.",
    exerciseInstructions:
      "Aranan gün, saat, yer veya koşul bilgisini duyuruda bul ve ilgili cümleyle doğrula.",
    exerciseTitle: "Duyurudaki gerekli bilgiyi hızla bul",
    contentVersionId: p1ACycle5To8Id(5, "contentVersion", `${cycle5FastContent.key}-v6`),
    contentTitle: "Gökyüzü gözlemi duyurusu",
    body: cycle5FastContent.body,
    difficulty: cycle5FastContent.difficulty,
    skillCode: cycle5FastContent.skillCode,
    templateVersionId: p1ACycle5To8Id(5, "templateVersion", `${cycle5Fast.key}-v6`),
    questionVersionIds: cycle5Fast.questions.map((question) =>
      p1ACycle5To8QuestionVersionId(5, `${cycle5Fast.key}-${question.key}`),
    ),
  },
};

export const EDUCATION_V2_P1_A_CYCLE_5_STATIONS_53_57 = cycle5Source.sourceStations;
