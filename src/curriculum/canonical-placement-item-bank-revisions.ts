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
