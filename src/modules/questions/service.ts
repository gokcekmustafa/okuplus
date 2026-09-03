import {
  Prisma,
  type QuestionStatus,
  type VersionStatus,
  type QuestionType,
  type PlatformRole,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError, forbiddenError } from "../../lib/errors.js";
import { recordCorrectAnswer } from "../gamification/service.js";
import {
  ENTITLEMENT_FEATURES,
  entitlementLimitMessage,
  recordUsageInTransaction,
} from "../entitlements/index.js";
import {
  validateQuestionVersionPayload,
  type CreateQuestionInput,
  type CreateQuestionVersionInput,
  type ListQuestionsQuery,
  type UpdateQuestionInput,
  type UpdateQuestionStatusInput,
  type UpdateQuestionVersionInput,
  type UpdateContentQuestionsInput,
  type CreateAttemptInput,
  type AttemptResponse,
  type CorrectAnswer,
  type Option,
} from "./schemas.js";

const QUESTION_LIST_SELECT = {
  id: true,
  contentId: true,
  position: true,
  type: true,
  skillId: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  content: {
    select: { id: true, tenantId: true, title: true, type: true, difficulty: true, status: true },
  },
  skill: { select: { id: true, code: true, name: true, category: true } },
  _count: { select: { versions: true, attempts: true } },
} satisfies Prisma.QuestionSelect;

const VERSION_SUMMARY_SELECT = {
  id: true,
  questionId: true,
  version: true,
  prompt: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  createdBy: { select: { displayName: true } },
} satisfies Prisma.QuestionVersionSelect;
const VERSION_DETAIL_SELECT = {
  ...VERSION_SUMMARY_SELECT,
  options: true,
  correctAnswer: true,
  explanation: true,
  hint: true,
  difficulty: true,
  partialCreditEnabled: true,
  generationMetadata: true,
} satisfies Prisma.QuestionVersionSelect;
const QUESTION_DETAIL_SELECT = {
  ...QUESTION_LIST_SELECT,
  versions: { select: VERSION_SUMMARY_SELECT, orderBy: { version: "desc" } },
} satisfies Prisma.QuestionSelect;

type QuestionListRow = Prisma.QuestionGetPayload<{ select: typeof QUESTION_LIST_SELECT }>;
type QuestionDetailRow = Prisma.QuestionGetPayload<{ select: typeof QUESTION_DETAIL_SELECT }>;
type VersionSummaryRow = Prisma.QuestionVersionGetPayload<{
  select: typeof VERSION_SUMMARY_SELECT;
}>;
type VersionDetailRow = Prisma.QuestionVersionGetPayload<{ select: typeof VERSION_DETAIL_SELECT }>;

export interface QuestionListItem {
  id: string;
  contentId: string;
  position: number;
  type: string;
  skillId: string | null;
  status: QuestionStatus;
  contentTitle: string;
  contentType: string;
  contentDifficulty: number;
  contentStatus: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string | null;
  versionCount: number;
  attemptCount: number;
  skill?: { id: string; code: string; name: string; category: string } | null;
}
export interface QuestionListResult {
  items: QuestionListItem[];
  total: number;
  page: number;
  pageSize: number;
}
export interface CurrentVersionSummary {
  id: string;
  version: number;
  prompt: string;
  status: VersionStatus;
  publishedAt: Date | null;
  createdAt: Date;
  createdByName: string | null;
}
export interface QuestionDetail extends QuestionListItem {
  currentVersion: CurrentVersionSummary | null;
  versions: CurrentVersionSummary[];
}
export interface QuestionVersionSummary extends CurrentVersionSummary {
  questionId: string;
}
export interface QuestionVersionDetail extends QuestionVersionSummary {
  options: Prisma.JsonValue | null;
  correctAnswer: Prisma.JsonValue | null;
  explanation: string | null;
  hint: string | null;
  difficulty: number | null;
  partialCreditEnabled: boolean;
  generationMetadata: Prisma.JsonValue | null;
}

export async function listQuestionByContent(contentId: string): Promise<QuestionListItem[]> {
  const content = await prisma.content.findFirst({
    where: { id: contentId, deletedAt: null },
    select: { id: true },
  });
  if (!content) throw notFoundError("İçerik bulunamadı");
  const rows = await prisma.question.findMany({
    where: { contentId, deletedAt: null },
    select: QUESTION_LIST_SELECT,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toQuestionListItem);
}

export async function listQuestions(query: ListQuestionsQuery): Promise<QuestionListResult> {
  const { contentId, type, status, skillId, search, page, pageSize } = query;
  const where: Prisma.QuestionWhereInput = {
    deletedAt: null,
    ...(contentId ? { contentId } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(skillId ? { skillId } : {}),
    ...(search ? { OR: [{ content: { title: { contains: search, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.question.findMany({
      where,
      select: QUESTION_LIST_SELECT,
      orderBy: { position: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.question.count({ where }),
  ]);
  return { items: rows.map(toQuestionListItem), total, page, pageSize };
}

export async function getQuestion(id: string): Promise<QuestionDetail> {
  const row = await findQuestion(id);
  if (!row) throw notFoundError("Soru bulunamadı");
  return toQuestionDetail(row);
}

/** Bir Question ve zorunlu ilk DRAFT QuestionVersion'ını tek transaction'da oluşturur. */
export async function createQuestion(
  input: CreateQuestionInput,
  actorId?: string,
): Promise<QuestionDetail> {
  const created = await prisma.$transaction(async (tx) => {
    const content = await tx.content.findFirst({
      where: { id: input.contentId, deletedAt: null },
      select: { id: true },
    });
    if (!content) throw notFoundError("İçerik bulunamadı");
    const positionConflict = await tx.question.findFirst({
      where: { contentId: input.contentId, position: input.position, deletedAt: null },
      select: { id: true },
    });
    if (positionConflict)
      throw conflictError(
        `İçerik kimliği ${input.contentId} için pozisyon ${input.position} zaten kullanılıyor`,
      );
    const question = await tx.question.create({
      data: {
        contentId: input.contentId,
        position: input.position,
        type: input.type,
        skillId: input.skillId ?? null,
        ...(actorId ? { createdById: actorId } : {}),
      },
      select: { id: true },
    });
    await tx.questionVersion.create({
      data: {
        questionId: question.id,
        version: 1,
        prompt: input.prompt,
        options: input.options as Prisma.InputJsonValue,
        correctAnswer: input.correctAnswer as Prisma.InputJsonValue,
        explanation: input.explanation ?? null,
        hint: input.hint ?? null,
        difficulty: input.difficulty ?? null,
        ...(actorId ? { createdById: actorId } : {}),
      },
    });
    return question;
  });
  return getQuestion(created.id);
}

export async function updateQuestion(
  id: string,
  input: UpdateQuestionInput,
): Promise<QuestionDetail> {
  const question = await findQuestion(id);
  if (!question) throw notFoundError("Soru bulunamadı");
  if (input.position !== undefined) {
    const conflict = await prisma.question.findFirst({
      where: {
        contentId: question.contentId,
        position: input.position,
        deletedAt: null,
        NOT: { id },
      },
      select: { id: true },
    });
    if (conflict) throw conflictError(`İçerik için pozisyon ${input.position} zaten kullanılıyor`);
  }
  const data: Prisma.QuestionUncheckedUpdateInput = {};
  if (input.position !== undefined) data.position = input.position;
  if (input.skillId !== undefined) data.skillId = input.skillId;
  if (Object.keys(data).length) await prisma.question.update({ where: { id }, data });
  return getQuestion(id);
}

export async function updateQuestionStatus(
  id: string,
  input: UpdateQuestionStatusInput,
): Promise<QuestionDetail> {
  const row = await prisma.question.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!row) throw notFoundError("Soru bulunamadı");
  if (input.status === row.status) return getQuestion(id);
  if (input.status === "PUBLISHED") {
    const published = await prisma.questionVersion.findFirst({
      where: { questionId: id, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!published) throw validationError("Yayınlanmış bir soru sürümü olmayan soru yayınlanamaz");
  } else if (input.status === "ARCHIVED" && row.status !== "DRAFT" && row.status !== "PUBLISHED")
    throw validationError("Bu durumdan arşivlenmiş duruma geçilemez");
  else if (input.status === "DRAFT" && row.status !== "ARCHIVED")
    throw validationError("Yalnızca arşivlenmiş soru taslağa alınabilir");
  await prisma.question.update({ where: { id }, data: { status: input.status } });
  return getQuestion(id);
}

/** Tarihçeyi koruyan silme; yayınlanmış QuestionVersion'lara dokunmaz. */
export async function deleteQuestion(id: string): Promise<{ id: string; deletedAt: Date }> {
  const question = await prisma.question.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!question) throw notFoundError("Soru bulunamadı");
  const deletedAt = new Date();
  await prisma.question.update({ where: { id }, data: { deletedAt } });
  return { id, deletedAt };
}
export const softDeleteQuestion = deleteQuestion;

export async function listQuestionVersions(questionId: string): Promise<QuestionVersionSummary[]> {
  if (!(await findQuestion(questionId))) throw notFoundError("Soru bulunamadı");
  const rows = await prisma.questionVersion.findMany({
    where: { questionId },
    select: VERSION_SUMMARY_SELECT,
    orderBy: { version: "desc" },
  });
  return rows.map(toQuestionVersionSummary);
}
export async function getQuestionVersion(id: string): Promise<QuestionVersionDetail> {
  const row = await prisma.questionVersion.findUnique({
    where: { id },
    select: VERSION_DETAIL_SELECT,
  });
  if (!row) throw notFoundError("Soru sürümü bulunamadı");
  return toQuestionVersionDetail(row);
}

export async function createQuestionVersion(
  questionId: string,
  input: CreateQuestionVersionInput,
  actorId?: string,
): Promise<QuestionVersionDetail> {
  const created = await prisma.$transaction(async (tx) => {
    const question = await tx.question.findFirst({
      where: { id: questionId, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!question) throw notFoundError("Soru bulunamadı");
    const previous = await tx.questionVersion.findFirst({
      where: { questionId },
      orderBy: { version: "desc" },
      select: VERSION_DETAIL_SELECT,
    });
    if (!previous) throw validationError("İlk sürüm Question oluşturulurken yaratılır");
    const payload = {
      prompt: input.prompt ?? previous.prompt,
      options: input.options ?? previous.options,
      correctAnswer: input.correctAnswer ?? previous.correctAnswer,
      explanation: input.explanation !== undefined ? input.explanation : previous.explanation,
      hint: input.hint !== undefined ? input.hint : previous.hint,
      difficulty: input.difficulty !== undefined ? input.difficulty : previous.difficulty,
    };
    validateQuestionVersionPayload(question.type, payload);
    return tx.questionVersion.create({
      data: {
        questionId,
        version: previous.version + 1,
        prompt: payload.prompt,
        options: toNullableJsonInput(payload.options),
        correctAnswer: toNullableJsonInput(payload.correctAnswer),
        explanation: payload.explanation,
        hint: payload.hint,
        difficulty: payload.difficulty,
        ...(actorId ? { createdById: actorId } : {}),
      },
      select: { id: true },
    });
  });
  return getQuestionVersion(created.id);
}

export async function updateQuestionVersion(
  id: string,
  input: UpdateQuestionVersionInput,
): Promise<QuestionVersionDetail> {
  const existing = await prisma.questionVersion.findUnique({
    where: { id },
    select: { ...VERSION_DETAIL_SELECT, question: { select: { type: true } } },
  });
  if (!existing) throw notFoundError("Soru sürümü bulunamadı");
  if (existing.status !== "DRAFT")
    throw validationError(
      "Yalnızca taslak soru sürümü düzenlenebilir. İncelemedeki veya yayınlanmış sürüm için yeni sürüm oluşturulmalı.",
    );
  const payload = {
    prompt: input.prompt ?? existing.prompt,
    options: input.options ?? existing.options,
    correctAnswer: input.correctAnswer ?? existing.correctAnswer,
    explanation: input.explanation !== undefined ? input.explanation : existing.explanation,
    hint: input.hint !== undefined ? input.hint : existing.hint,
    difficulty: input.difficulty !== undefined ? input.difficulty : existing.difficulty,
  };
  validateQuestionVersionPayload(existing.question.type, payload);
  await prisma.questionVersion.update({
    where: { id },
    data: {
      prompt: payload.prompt,
      options: toNullableJsonInput(payload.options),
      correctAnswer: toNullableJsonInput(payload.correctAnswer),
      explanation: payload.explanation,
      hint: payload.hint,
      difficulty: payload.difficulty,
    },
  });
  return getQuestionVersion(id);
}

export async function reviewQuestionVersion(id: string): Promise<QuestionVersionDetail> {
  const existing = await prisma.questionVersion.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) throw notFoundError("Soru sürümü bulunamadı");
  if (existing.status !== "DRAFT")
    throw validationError("Yalnızca taslak sürüm incelemeye alınabilir");
  await prisma.questionVersion.update({ where: { id }, data: { status: "REVIEW" } });
  return getQuestionVersion(id);
}

/** Yayınlanan sürüm immutable kalır; Question'ın yayın durumu aynı transaction'da güncellenir. */
export async function publishQuestionVersion(id: string): Promise<QuestionVersionDetail> {
  const existing = await prisma.questionVersion.findUnique({
    where: { id },
    select: { id: true, questionId: true, status: true },
  });
  if (!existing) throw notFoundError("Soru sürümü bulunamadı");
  if (existing.status === "PUBLISHED") throw validationError("Soru sürümü zaten yayınlanmış");
  if (existing.status === "ARCHIVED") throw validationError("Arşivlenmiş soru sürümü yayınlanamaz");
  await prisma.$transaction(async (tx) => {
    await tx.questionVersion.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await tx.question.update({ where: { id: existing.questionId }, data: { status: "PUBLISHED" } });
  });
  return getQuestionVersion(id);
}

/** Var olan soruları hedef içeriğe taşır ve pozisyonlarını günceller; yeni soru oluşturmaz. */
export async function updateContentQuestions(
  contentId: string,
  input: UpdateContentQuestionsInput,
): Promise<{ updated: number }> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.content.findFirst({
      where: { id: contentId, deletedAt: null },
      select: { id: true, tenantId: true },
    });
    if (!target) throw notFoundError("İçerik bulunamadı");
    const questionIds = input.questions.map(({ questionId }) => questionId);
    const questions = await tx.question.findMany({
      where: { id: { in: questionIds }, deletedAt: null },
      select: {
        id: true,
        contentId: true,
        position: true,
        content: { select: { tenantId: true } },
      },
    });
    if (questions.length !== questionIds.length)
      throw validationError("Bağlanmak istenen soru bulunamadı veya silinmiş");
    if (questions.some((question) => question.content.tenantId !== target.tenantId))
      throw validationError("Soru ve hedef içerik aynı tenant kapsamına ait olmalı");
    const submittedIds = new Set(questionIds);
    const submittedPositions = new Set(input.questions.map(({ position }) => position));
    const conflicts = await tx.question.findMany({
      where: {
        contentId,
        deletedAt: null,
        id: { notIn: [...submittedIds] },
        position: { in: [...submittedPositions] },
      },
      select: { position: true },
    });
    if (conflicts.length)
      throw conflictError("Hedef içerikte istenen pozisyonlardan biri zaten kullanılıyor");
    let updated = 0;
    for (const entry of input.questions) {
      const question = questions.find(({ id }) => id === entry.questionId)!;
      if (question.contentId !== contentId || question.position !== entry.position) {
        await tx.question.update({
          where: { id: entry.questionId },
          data: { contentId, position: entry.position },
        });
        updated++;
      }
    }
    return { updated };
  });
}

/**
 * Cevabı doğru cevaba göre puanlar.
 * Döndürür: { isCorrect: boolean|null, rawScore: 0-1 arası number|null, feedback?: string }
 * OPEN_ENDED için: isCorrect=null, rawScore=null, feedback döner.
 * Geçersiz cevap formatı: validationError fırlatır.
 * Yan etkisiz, deterministik.
 */
export async function scoreAttempt(
  questionVersionId: string,
  answer: Prisma.JsonValue,
): Promise<{ isCorrect: boolean | null; rawScore: number | null; feedback?: string }> {
  const version = await prisma.questionVersion.findUnique({
    where: { id: questionVersionId },
    select: {
      id: true,
      options: true,
      correctAnswer: true,
      partialCreditEnabled: true,
      question: { select: { type: true } },
    },
  });
  if (!version) throw notFoundError("Soru sürümü bulunamadı");

  const type = version.question?.type as QuestionType;
  const correctAnswer = version.correctAnswer as CorrectAnswer;
  const options = (version.options as Option[]) ?? [];

  const optionIdSet = new Set(options.map((o) => o.id));

  // Type guards for discriminated union
  function isMultipleChoiceCA(ca: CorrectAnswer): ca is {
    type: "MULTIPLE_CHOICE";
    correctOptionIds: string[];
    allowMultiple: boolean;
    partialCredit: boolean;
  } {
    return ca.type === "MULTIPLE_CHOICE";
  }
  function isTrueFalseCA(ca: CorrectAnswer): ca is { type: "TRUE_FALSE"; answer: boolean } {
    return ca.type === "TRUE_FALSE";
  }
  function isMatchingCA(ca: CorrectAnswer): ca is {
    type: "MATCHING";
    pairs: { leftId: string; rightId: string }[];
    partialCredit: boolean;
  } {
    return ca.type === "MATCHING";
  }
  function isFillBlankCA(ca: CorrectAnswer): ca is {
    type: "FILL_BLANK";
    blanks: {
      blankId: string;
      acceptedAnswers: string[];
      caseSensitive?: boolean;
      regex?: string;
    }[];
    partialCredit: boolean;
  } {
    return ca.type === "FILL_BLANK";
  }

  // Yardımcı: cevap formatını doğrula
  function validateAnswerFormat(): void {
    if (type === "MULTIPLE_CHOICE") {
      if (!Array.isArray(answer)) throw validationError("MULTIPLE_CHOICE cevabı dizi olmalı");
      for (const a of answer) {
        if (typeof a !== "string" || !optionIdSet.has(a)) {
          throw validationError(`Geçersiz opsiyon kimliği: ${a}`);
        }
      }
      const uniq = new Set(answer);
      if (uniq.size !== answer.length)
        throw validationError("Cevapta tekrar eden opsiyon kimliği var");
    } else if (type === "TRUE_FALSE") {
      if (typeof answer !== "boolean") throw validationError("TRUE_FALSE cevabı boolean olmalı");
    } else if (type === "MATCHING") {
      if (!answer || typeof answer !== "object")
        throw validationError("MATCHING cevabı obje olmalı");
      const ans = answer as Record<string, string>;
      for (const [left, right] of Object.entries(ans)) {
        if (!optionIdSet.has(left) || !optionIdSet.has(right)) {
          throw validationError(`Geçersiz eşleşme kimliği: ${left} veya ${right}`);
        }
      }
    } else if (type === "FILL_BLANK") {
      if (!answer || typeof answer !== "object")
        throw validationError("FILL_BLANK cevabı obje olmalı");
      const ans = answer as Record<string, string>;
      for (const [blankId, val] of Object.entries(ans)) {
        if (typeof val !== "string")
          throw validationError(`Boşluk ${blankId} cevabı string olmalı`);
      }
    } else if (type === "OPEN_ENDED") {
      if (typeof answer !== "string") throw validationError("OPEN_ENDED cevabı string olmalı");
    } else {
      throw validationError("Bilinmeyen soru tipi");
    }
  }

  validateAnswerFormat();

  // Puanlama fonksiyonları
  function clampScore(score: number): number {
    return Math.max(0, Math.min(1, score));
  }

  if (type === "MULTIPLE_CHOICE") {
    const ca = correctAnswer;
    if (!isMultipleChoiceCA(ca))
      throw validationError("Geçersiz MULTIPLE_CHOICE correctAnswer formatı");
    const correctSet = new Set(ca.correctOptionIds);
    const userSet = new Set(answer as string[]);

    if (!ca.allowMultiple) {
      // Tek seçimli
      const userAnswer = answer as string[];
      const first = userAnswer[0];
      const isCorrect = userSet.size === 1 && first !== undefined && correctSet.has(first);
      return { isCorrect, rawScore: isCorrect ? 1 : 0 };
    }

    // Çoklu seçimli
    if (ca.partialCredit) {
      let correctCount = 0;
      for (const id of correctSet) if (userSet.has(id)) correctCount++;
      const score = correctCount / Math.max(1, correctSet.size);
      return { isCorrect: score === 1, rawScore: clampScore(score) };
    } else {
      // Kısmi puan yok: tam küme eşleşmesi gerek
      const isCorrect =
        userSet.size === correctSet.size && [...correctSet].every((id) => userSet.has(id));
      return { isCorrect, rawScore: isCorrect ? 1 : 0 };
    }
  }

  if (type === "TRUE_FALSE") {
    const ca = correctAnswer;
    if (!isTrueFalseCA(ca)) throw validationError("Geçersiz TRUE_FALSE correctAnswer formatı");
    const isCorrect = answer === ca.answer;
    return { isCorrect, rawScore: isCorrect ? 1 : 0 };
  }

  if (type === "MATCHING") {
    const ca = correctAnswer;
    if (!isMatchingCA(ca)) throw validationError("Geçersiz MATCHING correctAnswer formatı");
    const userAns = answer as Record<string, string>;
    const correctPairs = new Map(ca.pairs.map((p) => [p.leftId, p.rightId]));
    const totalPairs = correctPairs.size;
    let correctCount = 0;
    for (const [left, right] of correctPairs) {
      if (userAns[left] === right) correctCount++;
    }
    if (ca.partialCredit) {
      const score = totalPairs > 0 ? correctCount / totalPairs : 0;
      return { isCorrect: score === 1, rawScore: clampScore(score) };
    } else {
      const isCorrect = correctCount === totalPairs;
      return { isCorrect, rawScore: isCorrect ? 1 : 0 };
    }
  }

  if (type === "FILL_BLANK") {
    const ca = correctAnswer;
    if (!isFillBlankCA(ca)) throw validationError("Geçersiz FILL_BLANK correctAnswer formatı");
    const userAns = answer as Record<string, string>;
    let correctCount = 0;
    const totalBlanks = ca.blanks.length;

    for (const blank of ca.blanks) {
      const userVal = userAns[blank.blankId] ?? "";
      const isCaseSensitive = blank.caseSensitive ?? false;
      const userNorm = isCaseSensitive ? userVal : userVal.toLowerCase();
      const accepted = blank.acceptedAnswers.map((a: string) =>
        isCaseSensitive ? a : a.toLowerCase(),
      );
      let matched = accepted.includes(userNorm);
      if (!matched && blank.regex) {
        try {
          const re = new RegExp(blank.regex, isCaseSensitive ? "" : "i");
          matched = re.test(userVal);
        } catch {
          // regex hatası -> eşleşmez
        }
      }
      if (matched) correctCount++;
    }

    if (ca.partialCredit) {
      const score = totalBlanks > 0 ? correctCount / totalBlanks : 0;
      return { isCorrect: score === 1, rawScore: clampScore(score) };
    } else {
      const isCorrect = correctCount === totalBlanks;
      return { isCorrect, rawScore: isCorrect ? 1 : 0 };
    }
  }

  // OPEN_ENDED
  return {
    isCorrect: null,
    rawScore: null,
    feedback: "Manuel değerlendirme gerekli",
  };
}

/**
 * Öğrencinin cevabını kaydeder ve puanlar.
 * - Gerçek ExerciseSession doğrulanır (FK güvenliği)
 * - Tenant/RLS izolasyonu: session tenant + soru kapsamı kontrolü
 * - scoreAttempt() ile puanlanır (OPEN_ENDED -> null)
 * - Attempt kaydı transaction içinde oluşturulur
 * - Duplicate clientAttemptId P2002 -> 409
 */
export async function createAttempt(
  questionVersionId: string,
  input: CreateAttemptInput,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
): Promise<AttemptResponse> {
  const { sessionId, answer, clientAttemptId, timeSpentMs } = input;

  // 1) QuestionVersion'ı yükle
  const version = await prisma.questionVersion.findUnique({
    where: { id: questionVersionId },
    select: {
      id: true,
      questionId: true,
      question: { select: { type: true, contentId: true } },
    },
  });
  if (!version) throw notFoundError("Soru sürümü bulunamadı");

  const question = await prisma.question.findUnique({
    where: { id: version.questionId },
    select: { contentId: true, content: { select: { tenantId: true } } },
  });
  if (!question) throw notFoundError("Soru bulunamadı");

  // 2) Session doğrula
  const session = await prisma.exerciseSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      tenantId: true,
      studentId: true,
      templateVersionId: true,
      context: true,
      sessionType: true,
      status: true,
    },
  });
  if (!session) throw notFoundError("Oturum bulunamadı");

  // Tenant kontrolü - session tenant
  const isSuperAdmin = actor.platformRole === "SUPER_ADMIN";
  if (!isSuperAdmin) {
    if (actor.tenantId !== null && session.tenantId !== actor.tenantId) {
      throw forbiddenError("Bu oturuma erişim yetkiniz yok");
    }
    if (session.studentId !== actor.userId) {
      throw forbiddenError("Bu oturum size ait değil");
    }
  }

  // Soru kapsamı: session tenant ile soru tenant uyumu (SUPER_ADMIN bypass)
  const questionTenantId = question.content.tenantId; // null = global
  if (!isSuperAdmin && questionTenantId !== null && questionTenantId !== session.tenantId) {
    throw forbiddenError("Bu soru bu oturumun kapsamına ait değil");
  }

  // Session'ın template'i bu soruyu içermeli
  const link = await prisma.exerciseTemplateVersionQuestion.findFirst({
    where: { templateVersionId: session.templateVersionId, questionVersionId },
    select: { templateVersionId: true },
  });
  if (!link) {
    throw validationError("Bu soru bu oturumun şablonuna ait değil");
  }

  // 3) scoreAttempt ile puanla (deterministik, yan etkisiz)
  const { isCorrect, rawScore, feedback } = await scoreAttempt(questionVersionId, answer);

  // 4) Attempt kaydı - transaction güvenliği
  try {
    const attempt = await prisma.$transaction(async (tx) => {
      // Admin/back-office attempt imports are not end-user B2C practice usage.
      // Only an authenticated personal-context student attempt consumes the
      // personal daily question allowance.
      if (
        actor.platformRole === null &&
        session.context === "INDIVIDUAL" &&
        session.sessionType === "PRACTICE"
      ) {
        const usage = await recordUsageInTransaction(
          tx,
          actor,
          ENTITLEMENT_FEATURES.PRACTICE_QUESTION,
          `question:${sessionId}:${clientAttemptId}`,
        );
        if (!usage.allowed) {
          throw forbiddenError(entitlementLimitMessage(ENTITLEMENT_FEATURES.PRACTICE_QUESTION), {
            feature: ENTITLEMENT_FEATURES.PRACTICE_QUESTION,
            plan: "PLAN_FREE",
            dailyLimit: usage.dailyLimit,
            usedToday: usage.usedToday,
            remainingToday: usage.remainingToday,
            resetAt: usage.resetAt,
          });
        }
      }
      return tx.attempt.create({
        data: {
          tenantId: session.tenantId,
          sessionId,
          questionVersionId,
          clientAttemptId,
          questionId: version.questionId,
          answer: answer as Prisma.InputJsonValue,
          isCorrect,
          rawScore,
          timeSpentMs: timeSpentMs ?? null,
          responseOrder: 1,
          feedback: (feedback ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
        },
        select: {
          id: true,
          questionVersionId: true,
          questionId: true,
          answer: true,
          isCorrect: true,
          rawScore: true,
          timeSpentMs: true,
          responseOrder: true,
          feedback: true,
          answeredAt: true,
          createdAt: true,
        },
      });
    });

    const response = {
      id: attempt.id,
      questionVersionId: attempt.questionVersionId,
      questionId: attempt.questionId ?? version.questionId,
      answer: attempt.answer,
      isCorrect: attempt.isCorrect,
      rawScore: attempt.rawScore,
      timeSpentMs: attempt.timeSpentMs,
      responseOrder: attempt.responseOrder,
      feedback: attempt.feedback,
      answeredAt: attempt.answeredAt.toISOString(),
      createdAt: attempt.createdAt.toISOString(),
    };
    if (attempt.isCorrect === true) {
      await recordCorrectAnswer({
        tenantId: session.tenantId,
        studentId: session.studentId,
        attemptId: attempt.id,
        answeredAt: attempt.answeredAt,
      }).catch(() => null);
    }
    return response;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        // @@unique([sessionId, clientAttemptId])
        throw conflictError("Bu deneme kimliği zaten kullanılmış");
      }
      if (err.code === "P2003") {
        // FK violation - sessionId veya questionVersionId
        throw validationError("Oturum veya soru sürümü geçersiz");
      }
    }
    throw err;
  }
}

async function findQuestion(id: string) {
  return prisma.question.findFirst({
    where: { id, deletedAt: null },
    select: QUESTION_DETAIL_SELECT,
  });
}
function toNullableJsonInput(
  value: Prisma.JsonValue | null,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}
function toQuestionListItem(row: QuestionListRow): QuestionListItem {
  return {
    id: row.id,
    contentId: row.contentId,
    position: row.position,
    type: row.type,
    skillId: row.skillId,
    status: row.status,
    contentTitle: row.content.title,
    contentType: row.content.type,
    contentDifficulty: row.content.difficulty,
    contentStatus: row.content.status,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tenantId: row.content.tenantId,
    versionCount: row._count.versions,
    attemptCount: row._count.attempts,
    skill: row.skill,
  };
}
function toVersionSummary(row: VersionSummaryRow): CurrentVersionSummary {
  return {
    id: row.id,
    version: row.version,
    prompt: row.prompt,
    status: row.status,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    createdByName: row.createdBy?.displayName ?? null,
  };
}
function toQuestionDetail(row: QuestionDetailRow): QuestionDetail {
  const versions: CurrentVersionSummary[] = row.versions.map(toVersionSummary);
  return {
    ...toQuestionListItem(row),
    versions,
    currentVersion:
      versions.find((version) => version.status === "PUBLISHED") ?? versions[0] ?? null,
  };
}
function toQuestionVersionSummary(row: VersionSummaryRow): QuestionVersionSummary {
  return { questionId: row.questionId, ...toVersionSummary(row) };
}
function toQuestionVersionDetail(row: VersionDetailRow): QuestionVersionDetail {
  return {
    ...toQuestionVersionSummary(row),
    options: row.options,
    correctAnswer: row.correctAnswer,
    explanation: row.explanation,
    hint: row.hint,
    difficulty: row.difficulty,
    partialCreditEnabled: row.partialCreditEnabled,
    generationMetadata: row.generationMetadata,
  };
}
