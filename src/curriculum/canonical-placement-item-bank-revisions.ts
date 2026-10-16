import {
  CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST,
  CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
  validateCanonicalPlacementItemBankManifest,
  type CanonicalPlacementItemBankManifest,
  type CanonicalPlacementQuestion,
} from "./canonical-placement-item-bank.js";

export const CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE_VERSION = "1.0.2" as const;

export type CanonicalPlacementItemBankRevisionCandidate = Omit<
  CanonicalPlacementItemBankManifest,
  "manifestVersion"
> & {
  manifestVersion: typeof CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE_VERSION;
  publicationApproved: false;
  editorialReviewStatus: "REVIEW_REQUIRED";
};

const optionRevisions: Readonly<Record<string, readonly string[]>> = {
  "PLV1-Q010": [
    "Öğle fotoğrafları, bulutlarla yağmur arasında kesin ilişki kurar.",
    "Gözlemler karşılaştırılır; öğle kayıtları kesin tahmin vermez.",
    "Rüzgâr kaydı sonraki yağışın zamanını kesin biçimde gösterir.",
    "Benzer bulutlar görüldüğünde yağmurun başlayacağı anlaşılır.",
  ],
  "PLV1-Q021": [
    "Sesli açıklamalar fiziksel eser incelemesinin yerini alır.",
    "Sesli açıklama sergi deneyimini destekleyen bir araçtır.",
    "Eserler sesli rehberle sergi salonundan kaldırılır.",
    "Bütün açıklamalar aynı uzunlukta hazırlanır.",
  ],
  "PLV1-Q025": [
    "Eksik kayıtları belirtmeden bütün gözlemleri eşdeğer saymak",
    "Kayıtları sınırlılıklarını belirterek karşılaştırmak",
    "En sıra dışı notu ek kanıt aramadan kabul etmek",
    "Eski ölçümleri yöntem farkına bakmadan elemek",
  ],
  "PLV1-Q033": [
    "Kıyı güvenliği için ışıkları bütün alanlarda aynı tutmak",
    "Güvenlik ile canlıların yön bulmasını birlikte gözetmek",
    "Canlıların hareketini tek başına aydınlatmayla açıklamak",
    "Gözlemi sürdürmek için kıyıyı daha parlak aydınlatmak",
  ],
};

const answerPositionByQuestionId: Readonly<Record<string, number>> = {
  "PLV1-Q001": 0,
  "PLV1-Q009": 1,
  "PLV1-Q010": 2,
  "PLV1-Q015": 3,
  "PLV1-Q017": 0,
  "PLV1-Q021": 1,
  "PLV1-Q025": 2,
  "PLV1-Q029": 3,
  "PLV1-Q033": 0,
};

const revisionReasons: Readonly<Record<string, string>> = {
  "PLV1-Q010":
    "Sınırlı gözlem ve temkinli sonuç korunarak seçenek ayrıntıları dengelendi; doğru yanıt tek başına daha uzun olmaktan çıkarıldı.",
  "PLV1-Q021":
    "Uygulamanın sergi deneyimini desteklediği bilgisi korunarak doğru seçenek kısaltıldı ve çeldiriciler metindeki fiziksel inceleme ayrımına yaklaştırıldı.",
  "PLV1-Q025":
    "Arşiv çalışmasının amacı korunarak seçenekler benzer ayrıntı düzeyine getirildi; doğru yanıtın uzunluk ipucu azaltıldı.",
  "PLV1-Q033":
    "Güvenlik ile canlı davranışını birlikte gözetme gerekçesi korunarak seçenekler doğal ve benzer uzunlukta yeniden yazıldı.",
};

function reviseQuestion(question: CanonicalPlacementQuestion): CanonicalPlacementQuestion {
  const options = optionRevisions[question.stableQuestionId];
  const targetCorrectPosition = answerPositionByQuestionId[question.stableQuestionId];
  if (!options && targetCorrectPosition === undefined) return question;
  if (
    question.questionType !== "MULTIPLE_CHOICE" ||
    question.correctAnswer.type !== "MULTIPLE_CHOICE"
  ) {
    throw new Error(
      `Yerleştirme revizyon adayı çoktan seçmeli olmayan soruyu hedefliyor: ${question.stableQuestionId}`,
    );
  }

  let revisedOptions = question.options.map((option) => ({ ...option }));
  if (options) {
    if (options.length !== revisedOptions.length) {
      throw new Error(
        `Yerleştirme revizyonunda seçenek sayısı değişemez: ${question.stableQuestionId}`,
      );
    }
    revisedOptions = revisedOptions.map((option, index) => ({
      ...option,
      text: options[index]!,
    }));
  }

  const correctOptionId = question.correctAnswer.correctOptionIds[0]!;
  const targetPosition =
    targetCorrectPosition ?? revisedOptions.findIndex((option) => option.id === correctOptionId);
  const correctOption = revisedOptions.find((option) => option.id === correctOptionId);
  if (!correctOption || targetPosition < 0 || targetPosition >= revisedOptions.length) {
    throw new Error(
      `Yerleştirme revizyonunda cevap kimliği/konumu geçersiz: ${question.stableQuestionId}`,
    );
  }
  const remaining = revisedOptions.filter((option) => option.id !== correctOptionId);
  remaining.splice(targetPosition, 0, correctOption);
  revisedOptions = remaining.map((option, position) => ({ ...option, position }));

  return {
    ...question,
    options: revisedOptions,
    ...(revisionReasons[question.stableQuestionId]
      ? { revisionReason: revisionReasons[question.stableQuestionId] }
      : {}),
  };
}

const candidateDraft: CanonicalPlacementItemBankRevisionCandidate = {
  ...CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST,
  manifestVersion: CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE_VERSION,
  publicationApproved: false,
  editorialReviewStatus: "REVIEW_REQUIRED",
  questions: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.map(reviseQuestion),
};

/**
 * Validates the candidate against the unchanged v1 schema. The base schema
 * pins the production manifest version, so only the version field is mapped
 * back for structural validation; the returned candidate remains v1.0.2.
 */
export function validateCanonicalPlacementItemBankRevisionCandidate(
  candidate: CanonicalPlacementItemBankRevisionCandidate = candidateDraft,
): CanonicalPlacementItemBankRevisionCandidate {
  if (candidate.manifestVersion !== CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE_VERSION) {
    throw new Error("Yerleştirme bankası revizyon sürümü beklenen 1.0.2 değil.");
  }
  if (candidate.publicationApproved || candidate.editorialReviewStatus !== "REVIEW_REQUIRED") {
    throw new Error("Yerleştirme bankası revizyon adayı inceleme/yayın kapısı kapalı kalmalı.");
  }

  const {
    publicationApproved: _publicationApproved,
    editorialReviewStatus: _reviewStatus,
    ...manifest
  } = candidate;
  validateCanonicalPlacementItemBankManifest({
    ...manifest,
    manifestVersion: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
  });
  return candidate;
}

export const CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE =
  validateCanonicalPlacementItemBankRevisionCandidate(candidateDraft);

/** A second, closed review candidate that also repairs non-MC item wording. */
export const CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE_VERSION = "1.0.3" as const;

export type CanonicalPlacementItemBankReviewCandidate = Omit<
  CanonicalPlacementItemBankRevisionCandidate,
  "manifestVersion"
> & {
  manifestVersion: typeof CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE_VERSION;
};

const nonMultipleChoiceRevisions: Readonly<Record<string, Partial<CanonicalPlacementQuestion>>> = {
  "PLV1-Q003": {
    questionText:
      "İlk denemede liflerin bir bölümü tutuldu. Ekip farklı kumaş ve sürelerle yeni ölçümler planladığına göre, bulguyu farklı koşullarda yeniden ___ amaçlamıştır.",
    correctAnswer: {
      type: "FILL_BLANK",
      blanks: [{ blankId: "blank-1", acceptedAnswers: ["sınamayı"], caseSensitive: false }],
      partialCredit: false,
    },
    explanation:
      "Ekip, tek denemeden kesin sonuç çıkarmak yerine yeni kumaş ve sürelerle ölçüm planlamıştır; bu, ilk bulguyu yeniden sınama amacını gösterir.",
    rationale:
      "Yeni ölçüm planından, ilk bulgunun farklı koşullarda yeniden sınanmak istendiği sonucunu çıkarmayı ölçer.",
    revisionReason:
      "Eski kök cevabı ve çıkarımı açıkça veriyordu; yeni kök, farklı koşullarda ölçüm planının amacını çıkarttırır.",
  },
  "PLV1-Q006": {
    questionText: "Kütüphane düzenindeki durumları verilen karşılıklarıyla eşleştiriniz.",
    options: [
      { id: "l1", text: "Geçiş yolunun sık sık kesilmesi", position: 0 },
      { id: "l2", text: "Öğrencilerin ders çalışması, ziyaretçilerin kitap araması", position: 1 },
      { id: "l3", text: "Görevlinin iki alanı da görebilmesi", position: 2 },
      { id: "l4", text: "Bir hafta sonraki kısa anket", position: 3 },
      { id: "r1", text: "Hareketli ve sessiz alanlar ayrı bölümlere ayrılır", position: 4 },
      { id: "r2", text: "Masalar ve kitap arabalarının yeri düzenlenir", position: 5 },
      { id: "r3", text: "Alçak raflar kullanılır", position: 6 },
      { id: "r4", text: "Öğrenciler daha az bölündüklerini bildirir", position: 7 },
    ],
    correctAnswer: {
      type: "MATCHING",
      pairs: [
        { leftId: "l1", rightId: "r2" },
        { leftId: "l2", rightId: "r1" },
        { leftId: "l3", rightId: "r3" },
        { leftId: "l4", rightId: "r4" },
      ],
      partialCredit: false,
    },
    explanation:
      "Kesilen geçiş yolu sonrasında masalar ve arabalar yeniden düzenlenmiştir; farklı kullanımlar ayrı bölümlere alınmış, alçak raflarla görüş korunmuş ve ankette öğrenciler daha az bölündüklerini bildirmiştir.",
    rationale:
      "Sorun, düzenleme, görüş koşulu ve sonraki geri bildirim arasındaki ilişkileri birbirinden ayırarak kurmayı ölçer.",
    revisionReason:
      "Önceki iki eşleştirmenin amaçları örtüşüyordu; yeni eşleştirme metindeki dört ayrı durum ve karşılığını kullanır.",
  },
  "PLV1-Q007": {
    questionText:
      "Kulübün çalışmasının ana yaklaşımı, canlıları düzenli gözlemlemek ve sonuçları ___ yorumlamaktır.",
    correctAnswer: {
      type: "FILL_BLANK",
      blanks: [
        {
          blankId: "blank-1",
          acceptedAnswers: ["koşulları göz önünde bulundurarak"],
          caseSensitive: false,
        },
      ],
      partialCredit: false,
    },
    explanation:
      "Kulüp saati, bitkiyi ve canlıyı kaydetmiş; hava ve çevredeki bitkiler gibi etkenler nedeniyle sonucu bütün bahçelere genellememiştir.",
    rationale:
      "Düzenli kayıt ile sonuçları etkileyebilecek koşullara dikkat etme yaklaşımını ana düşüncede birleştirir.",
    revisionReason:
      "Eski kök genel bir adla kolayca tamamlanabiliyordu; yeni kök gözlem ve sınırlı yorum yaklaşımını özetletir.",
  },
  "PLV1-Q019": {
    questionText:
      "Sesli rehberin temel bilgiyi kısa sunup ayrıntıyı isteğe bağlı kılması, uygulamanın sergi deneyimini ___ gösterir.",
    correctAnswer: {
      type: "FILL_BLANK",
      blanks: [{ blankId: "blank-1", acceptedAnswers: ["desteklediğini"], caseSensitive: false }],
      partialCredit: false,
    },
    explanation:
      "Kısa açıklama temel bilgiyi verir, ayrı düğme ayrıntı isteyenlere seçenek sunar; müze de rehberin sergi deneyimini desteklediğini belirtir.",
    rationale:
      "Kısa ve isteğe bağlı ayrıntı düzeninin, fiziksel sergi deneyiminin yerine geçmeyip onu destekleyen rolünü özetler.",
    revisionReason:
      "Eski kök temel sonucu ve cevabı neredeyse aynı cümlede veriyordu; yeni kök özelliklerden rehberin rolünü çıkarttırır.",
  },
  "PLV1-Q022": {
    options: [
      { id: "l1", text: "Aynı türden dört bitki seçmek", position: 0 },
      { id: "l2", text: "İki farklı sulama aralığı uygulamak", position: 1 },
      { id: "l3", text: "Bitkileri eşit ışık alan rafa koymak", position: 2 },
      { id: "l4", text: "Genelleme yapmadan daha uzun bir çalışma önermek", position: 3 },
      { id: "r1", text: "Işık koşulunu olabildiğince sabit tutmak", position: 4 },
      { id: "r2", text: "Bitki türü farkını azaltmak", position: 5 },
      { id: "r3", text: "Mevcut sonucun kapsamını sınırlı tutmak", position: 6 },
      { id: "r4", text: "Değişen sulama koşullarını karşılaştırmak", position: 7 },
    ],
    explanation:
      "Aynı tür seçimi tür farkını, eşit ışık koşulu ışık etkisini azaltır; farklı sulama aralıkları karşılaştırılır ve daha uzun çalışma önerisi erken genellemeyi önler.",
    revisionReason:
      "‘Az bitki ve kısa süreyle yetinmek’ çalışmanın ileriye dönük önerisini yanlış temsil ediyordu; seçenek şimdi metindeki daha uzun çalışma önerisini yansıtır.",
  },
  "PLV1-Q024": {
    questionText:
      "Kısa süre ve az sayıda bitkiyle yürütülen deneyden, sulama aralığının bütün bitkilerin büyümesini belirlediği sonucu çıkarılabilir.",
    correctAnswer: { type: "TRUE_FALSE", answer: false },
    explanation:
      "Metin, az sayıda bitki ve kısa süre nedeniyle sonucu bütün bitkilere genellemek yerine daha uzun bir çalışma önermiştir.",
    rationale:
      "Sınırlı örneklem ve süreye dayanan bir bulgudan evrensel bir neden-sonuç sonucu çıkarılamayacağını değerlendirmeyi ölçer.",
    revisionReason:
      "Eski doğru/yanlış cümlesi metindeki sonucu doğrudan tekrar ediyordu; yeni ifade sınırlı kanıttan aşırı genelleme yapılıp yapılamayacağını ölçer.",
  },
  "PLV1-Q031": {
    questionText:
      "Raporun temel önerisi, aydınlatmayı düzenlerken güvenlik ile canlıların gece yön bulma ihtiyacı arasında bir ___ gözetmektir.",
    correctAnswer: {
      type: "FILL_BLANK",
      blanks: [{ blankId: "blank-1", acceptedAnswers: ["denge"], caseSensitive: false }],
      partialCredit: false,
    },
    explanation:
      "Rapor bütün ışıkları kaldırmak yerine renk, yön ve zaman ayarlı seçenekleri karşılaştırarak güvenlik ile canlıların davranışını birlikte ele alır.",
    rationale:
      "Çözüm seçeneklerinden hareketle raporun iki ihtiyacı birlikte gözeten ana yaklaşımını özetlemeyi ölçer.",
    revisionReason:
      "Eski boşluk, kaynak cümledeki fiili doğrudan kopyalıyordu; yeni cevap farklı iki ihtiyacı birlikte gözetme fikrini adlandırır.",
  },
};

const reviewCandidateDraft: CanonicalPlacementItemBankReviewCandidate = {
  ...candidateDraft,
  manifestVersion: CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE_VERSION,
  questions: candidateDraft.questions.map((question) => ({
    ...question,
    ...nonMultipleChoiceRevisions[question.stableQuestionId],
  })),
};

export function validateCanonicalPlacementItemBankReviewCandidate(
  candidate: CanonicalPlacementItemBankReviewCandidate = reviewCandidateDraft,
): CanonicalPlacementItemBankReviewCandidate {
  if (candidate.manifestVersion !== CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE_VERSION) {
    throw new Error("Yerleştirme bankası inceleme adayı beklenen 1.0.3 sürümünde değil.");
  }
  if (candidate.publicationApproved || candidate.editorialReviewStatus !== "REVIEW_REQUIRED") {
    throw new Error("Yerleştirme bankası inceleme/yayın kapısı kapalı kalmalı.");
  }

  const {
    publicationApproved: _publicationApproved,
    editorialReviewStatus: _reviewStatus,
    ...manifest
  } = candidate;
  validateCanonicalPlacementItemBankManifest({
    ...manifest,
    manifestVersion: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
  });
  return candidate;
}

export const CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE =
  validateCanonicalPlacementItemBankReviewCandidate(reviewCandidateDraft);
