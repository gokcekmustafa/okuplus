import { FIRST_REAL_CURRICULUM_PACK } from "./first-real-pack.js";

const CONTENT_MIN_WORDS = 100;
const CONTENT_MAX_WORDS = 180;
const CONTENT_SENTENCE_REVIEW_THRESHOLD = 35;
const EXPECTED_CONTENT_COUNT = 9;
const EXPECTED_QUESTION_COUNT = 36;
const MC_MAX_POSITION_RATIO_THRESHOLD = 0.45;
const EXPECTED_TRACKS = new Set(["main-idea", "detail", "inference"]);
const EXPECTED_COGNITIVE_DEMANDS = new Set(["RECALL", "UNDERSTAND", "INFER"]);
const STOP_WORDS = new Set([
  "ama",
  "bazı",
  "bir",
  "bu",
  "da",
  "daha",
  "de",
  "diğer",
  "için",
  "ile",
  "kadar",
  "metin",
  "olan",
  "olarak",
  "sonra",
  "ve",
  "ya",
  "yine",
]);

export type CurriculumQaMetrics = {
  contentCount: number;
  questionCount: number;
  sourceCount: number;
  contentWordCounts: Record<string, number>;
  questionTypeCounts: Record<string, number>;
  cognitiveDemandCounts: Record<string, number>;
  mcCorrectPositionCounts: Record<string, number>;
  mcMaxPositionRatio: number;
  trackContentCounts: Record<string, number>;
};

export type CurriculumQaResult = {
  errors: string[];
  warnings: string[];
  metrics: CurriculumQaMetrics;
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function sentenceWordCounts(text: string): number[] {
  return text
    .split(/[.!?]+/u)
    .map((sentence) => wordCount(sentence))
    .filter((count) => count > 0);
}

function normalize(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function meaningfulTokens(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(/\s+/u)
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token)),
  );
}

function hasEvidenceOverlap(contentBody: string, evidence: string): boolean {
  const bodyTokens = meaningfulTokens(contentBody);
  return [...meaningfulTokens(evidence)].some((token) =>
    [...bodyTokens].some(
      (bodyToken) =>
        bodyToken === token ||
        (bodyToken.length >= 5 && token.length >= 5 && bodyToken.slice(0, 5) === token.slice(0, 5)),
    ),
  );
}

function addError(errors: string[], message: string): void {
  errors.push(message);
}

function addWarning(warnings: string[], message: string): void {
  if (!warnings.includes(message)) warnings.push(message);
}

export function runFirstRealPackQa(): CurriculumQaResult {
  const pack = FIRST_REAL_CURRICULUM_PACK;
  const errors: string[] = [];
  const warnings: string[] = [];
  const contentWordCounts: Record<string, number> = {};
  const questionTypeCounts: Record<string, number> = {};
  const cognitiveDemandCounts: Record<string, number> = {};
  const mcCorrectPositionCounts: Record<string, number> = {};
  const trackContentCounts: Record<string, number> = {};
  const sourceIds = new Set(pack.sources.map((source) => source.id));
  const contentSlugs = new Set<string>();
  const questionPrompts = new Set<string>();
  let questionCount = 0;

  if (pack.contents.length !== EXPECTED_CONTENT_COUNT) {
    addError(errors, `İçerik sayısı ${EXPECTED_CONTENT_COUNT} olmalı: ${pack.contents.length}`);
  }
  const manifestQuestionCount = pack.contents.reduce(
    (total, content) => total + content.questions.length,
    0,
  );
  if (manifestQuestionCount !== EXPECTED_QUESTION_COUNT) {
    addError(errors, `Soru sayısı ${EXPECTED_QUESTION_COUNT} olmalı: ${manifestQuestionCount}`);
  }
  if (pack.tracks.length !== EXPECTED_TRACKS.size) {
    addError(errors, `Track sayısı ${EXPECTED_TRACKS.size} olmalı: ${pack.tracks.length}`);
  }
  if (new Set(pack.tracks.map((track) => track.id)).size !== pack.tracks.length) {
    addError(errors, "Track id değerleri benzersiz değil");
  }
  for (const track of pack.tracks) {
    if (!EXPECTED_TRACKS.has(track.id)) addError(errors, `Bilinmeyen track: ${track.id}`);
    if (!track.label.trim() || !track.objective.trim()) {
      addError(errors, `Track metadata eksik: ${track.id}`);
    }
  }
  for (const source of pack.sources) {
    if (!source.id.trim() || !source.title.trim() || !source.checkedClaim.trim()) {
      addError(errors, `Kaynak metadata eksik: ${source.id}`);
    }
    if (!/^https:\/\//u.test(source.url)) {
      addError(errors, `Kaynak URL'i HTTPS değil: ${source.id}`);
    }
  }

  for (const content of pack.contents) {
    const path = `content:${content.slug}`;
    questionCount += content.questions.length;
    contentWordCounts[content.slug] = wordCount(content.body);
    trackContentCounts[content.trackId] = (trackContentCounts[content.trackId] ?? 0) + 1;

    if (contentSlugs.has(content.slug)) addError(errors, `Tekrarlı content slug: ${content.slug}`);
    contentSlugs.add(content.slug);
    if (!content.title.trim() || !content.domain.trim() || !content.topic.trim()) {
      addError(errors, `${path} başlık/domain/topic eksik`);
    }
    if (!content.objective.trim()) addError(errors, `${path} objective eksik`);
    if (!EXPECTED_TRACKS.has(content.trackId)) addError(errors, `${path} track bilinmiyor`);
    if (content.difficulty < 0 || content.difficulty > 1) {
      addError(errors, `${path} difficulty 0..1 aralığında değil`);
    }
    const paragraphs = content.body.split(/\n\s*\n/u);
    if (paragraphs.length !== 3 || paragraphs.some((paragraph) => !paragraph.trim())) {
      addError(errors, `${path} gövde üç dolu paragraf olmalı`);
    }
    const words = contentWordCounts[content.slug]!;
    if (words < CONTENT_MIN_WORDS || words > CONTENT_MAX_WORDS) {
      addError(
        errors,
        `${path} kelime sayısı ${CONTENT_MIN_WORDS}..${CONTENT_MAX_WORDS} dışında: ${words}`,
      );
    }
    const longSentence = Math.max(...sentenceWordCounts(content.body));
    if (longSentence > CONTENT_SENTENCE_REVIEW_THRESHOLD) {
      addWarning(
        warnings,
        `${path} cümle yoğunluğu editör incelemesi istiyor: en uzun cümle ${longSentence} kelime`,
      );
    }
    for (const sourceId of content.sourceIds) {
      if (!sourceIds.has(sourceId)) addError(errors, `${path} kaynak eşleşmesi yok: ${sourceId}`);
    }
    if (content.questions.length !== 4) {
      addError(errors, `${path} soru sayısı 4 olmalı: ${content.questions.length}`);
    }

    const contentQuestionPrompts = new Set<string>();
    for (const [index, question] of content.questions.entries()) {
      const questionPath = `${path}/question:${index + 1}`;
      questionTypeCounts[question.type] = (questionTypeCounts[question.type] ?? 0) + 1;
      cognitiveDemandCounts[question.cognitiveDemand] =
        (cognitiveDemandCounts[question.cognitiveDemand] ?? 0) + 1;
      if (questionPrompts.has(normalize(question.prompt))) {
        addError(errors, `Tekrarlı soru prompt'u: ${questionPath}`);
      }
      questionPrompts.add(normalize(question.prompt));
      if (contentQuestionPrompts.has(normalize(question.prompt))) {
        addError(errors, `Aynı içerikte tekrarlı prompt: ${questionPath}`);
      }
      contentQuestionPrompts.add(normalize(question.prompt));
      if (!question.prompt.trim() || !question.hint.trim() || !question.explanation.trim()) {
        addError(errors, `${questionPath} prompt/hint/explanation eksik`);
      }
      if (!EXPECTED_COGNITIVE_DEMANDS.has(question.cognitiveDemand)) {
        addError(errors, `${questionPath} cognitive demand bilinmiyor`);
      }
      if (question.difficulty < 0 || question.difficulty > 1) {
        addError(errors, `${questionPath} difficulty 0..1 aralığında değil`);
      }
      const optionIds = new Set<string>();
      const optionTexts = new Set<string>();
      for (const [optionIndex, option] of question.options.entries()) {
        if (!option.id.trim() || !option.text.trim()) {
          addError(errors, `${questionPath}/option:${optionIndex + 1} boş`);
        }
        if (optionIds.has(option.id)) addError(errors, `${questionPath} option id tekrarlı`);
        optionIds.add(option.id);
        const optionText = normalize(option.text);
        if (optionTexts.has(optionText)) addError(errors, `${questionPath} option metni tekrarlı`);
        optionTexts.add(optionText);
        if (option.position !== optionIndex) {
          addError(errors, `${questionPath} option position sıralı değil`);
        }
      }

      if (question.type === "MULTIPLE_CHOICE") {
        if (question.options.length !== 4) {
          addError(errors, `${questionPath} çoktan seçmeli soru 4 seçenekli olmalı`);
        }
        const answer = question.correctAnswer;
        const correctOptionIds = answer.correctOptionIds;
        if (
          answer.type !== "MULTIPLE_CHOICE" ||
          !Array.isArray(correctOptionIds) ||
          correctOptionIds.length !== 1 ||
          typeof correctOptionIds[0] !== "string"
        ) {
          addError(errors, `${questionPath} tek ve tip uyumlu doğru cevap taşımıyor`);
        } else {
          const correctId = correctOptionIds[0];
          const correctOption = question.options.find((option) => option.id === correctId);
          if (!correctOption) {
            addError(errors, `${questionPath} doğru seçenek id'si seçeneklerde yok`);
          } else {
            const positionId = String.fromCharCode(97 + correctOption.position);
            mcCorrectPositionCounts[positionId] = (mcCorrectPositionCounts[positionId] ?? 0) + 1;
            if (normalize(question.hint).includes(normalize(correctOption.text))) {
              addError(errors, `${questionPath} hint doğru seçeneği aynen sızdırıyor`);
            }
            if (
              !hasEvidenceOverlap(content.body, `${correctOption.text} ${question.explanation}`)
            ) {
              addError(errors, `${questionPath} doğru cevap için metin kanıtı bulunamadı`);
            }
          }
        }
        if (answer.allowMultiple !== false || answer.partialCredit !== false) {
          addError(errors, `${questionPath} çoktan seçmeli scoring tek doğru sözleşmesine uymuyor`);
        }
      } else if (question.type === "TRUE_FALSE") {
        if (
          question.options.length !== 2 ||
          question.options[0]?.id !== "true" ||
          question.options[1]?.id !== "false" ||
          question.options[0]?.text !== "Doğru" ||
          question.options[1]?.text !== "Yanlış"
        ) {
          addError(errors, `${questionPath} doğru/yanlış seçenek sözleşmesine uymuyor`);
        }
        if (
          question.correctAnswer.type !== "TRUE_FALSE" ||
          typeof question.correctAnswer.answer !== "boolean"
        ) {
          addError(errors, `${questionPath} doğru/yanlış cevap sözleşmesine uymuyor`);
        }
        if (!hasEvidenceOverlap(content.body, question.explanation)) {
          addError(errors, `${questionPath} doğru/yanlış açıklaması için metin kanıtı bulunamadı`);
        }
      } else {
        addError(errors, `${questionPath} desteklenmeyen soru tipi: ${question.type}`);
      }
    }
  }

  for (const track of EXPECTED_TRACKS) {
    if (trackContentCounts[track] !== 3) {
      addError(
        errors,
        `Track dağılımı üç içerik olmalı: ${track}=${trackContentCounts[track] ?? 0}`,
      );
    }
  }
  const mcTotal = Object.values(mcCorrectPositionCounts).reduce((total, count) => total + count, 0);
  const maxPositionCount = Math.max(...Object.values(mcCorrectPositionCounts), 0);
  const mcMaxPositionRatio = mcTotal > 0 ? maxPositionCount / mcTotal : 0;
  if (mcTotal >= 8 && mcMaxPositionRatio > MC_MAX_POSITION_RATIO_THRESHOLD) {
    addError(
      errors,
      `Çoktan seçmeli doğru konumu threshold dışında: ${JSON.stringify({ counts: mcCorrectPositionCounts, maxRatio: mcMaxPositionRatio, threshold: MC_MAX_POSITION_RATIO_THRESHOLD })}`,
    );
  }
  if (questionCount !== EXPECTED_QUESTION_COUNT) {
    addError(errors, `Toplam soru sayısı ${EXPECTED_QUESTION_COUNT} olmalı: ${questionCount}`);
  }

  return {
    errors,
    warnings,
    metrics: {
      contentCount: pack.contents.length,
      questionCount,
      sourceCount: pack.sources.length,
      contentWordCounts,
      questionTypeCounts,
      cognitiveDemandCounts,
      mcCorrectPositionCounts,
      mcMaxPositionRatio,
      trackContentCounts,
    },
  };
}
