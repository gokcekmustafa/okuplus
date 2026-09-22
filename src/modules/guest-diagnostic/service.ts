import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FastifyRequest } from "fastify";

import {
  CANONICAL_PROFICIENCY_LEVEL_MANIFEST,
  type ProficiencySkillCode,
} from "../../curriculum/proficiency-levels.js";
import {
  serviceUnavailableError,
  conflictError,
  notFoundError,
  validationError,
} from "../../lib/errors.js";
import { scoreAttemptValue } from "../questions/service.js";
import { assertRequestOrigin } from "../auth/csrf.js";
import { getGuestCsrfToken, getGuestToken } from "./cookies.js";
import { assertGuestCsrfRequest, createGuestCsrfToken } from "./csrf.js";
import {
  createGuestToken,
  getGuestDbClient,
  hashGuestToken,
  withGuestSessionContext,
  withNewGuestSessionContext,
  type ValidatedGuestSession,
} from "./context.js";
import {
  GUEST_DIAGNOSTIC_CANDIDATES,
  GUEST_DIAGNOSTIC_CONFIG_KEY,
  GUEST_DIAGNOSTIC_DEFINITION_VERSION,
  GUEST_DIAGNOSTIC_MINIMUM_SCORABLE_COUNT,
  GUEST_DIAGNOSTIC_QUESTION_COUNT,
  GUEST_DIAGNOSTIC_SCORING_VERSION,
  GUEST_DIAGNOSTIC_SESSION_TTL_SECONDS,
} from "./definition.js";
import {
  evaluateGuestDiagnostic,
  parseGuestRecommendationPolicy,
  type GuestEvaluation,
} from "./scoring.js";
import { createGuestRateLimiter, type GuestRateLimitPolicy } from "./rate-limit.js";

type GuestDbClient = PrismaClient;
type GuestTransaction = Prisma.TransactionClient;
type GuestRateLimiter = ReturnType<typeof createGuestRateLimiter>;

const QUESTION_VERSION_SELECT = {
  id: true,
  questionId: true,
  prompt: true,
  options: true,
  correctAnswer: true,
  difficulty: true,
  status: true,
  publishedAt: true,
  question: {
    select: {
      id: true,
      type: true,
      status: true,
      deletedAt: true,
      skill: { select: { code: true } },
      content: { select: { id: true, tenantId: true, status: true, deletedAt: true } },
    },
  },
  contentVersion: {
    select: {
      id: true,
      title: true,
      body: true,
      status: true,
      publishedAt: true,
      content: { select: { id: true, tenantId: true, status: true, deletedAt: true } },
    },
  },
} satisfies Prisma.QuestionVersionSelect;

type QuestionVersionRow = Prisma.QuestionVersionGetPayload<{
  select: typeof QUESTION_VERSION_SELECT;
}>;

export type GuestAnswerInput = {
  itemId: string;
  clientAnswerId: string;
  answer: Prisma.JsonValue;
  timeSpentMs?: number | null;
};

export type GuestServiceDependencies = {
  client?: GuestDbClient;
  rateLimiter?: GuestRateLimiter;
  request: FastifyRequest;
  allowedOrigins: readonly string[];
  rateLimitIdentifier: string;
};

function publicItemId(position: number): string {
  return `item-${position}`;
}

function parsePublicItemId(value: string): number {
  const match = /^item-([1-9][0-9]*)$/u.exec(value.trim());
  const position = Number(match?.[1]);
  if (
    !Number.isSafeInteger(position) ||
    position < 1 ||
    position > GUEST_DIAGNOSTIC_QUESTION_COUNT
  ) {
    throw validationError("Soru kimliği geçersiz");
  }
  return position;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}

export function hashGuestAnswer(answer: Prisma.JsonValue): string {
  return createHash("sha256").update(canonicalJson(answer), "utf8").digest("hex");
}

function publicOptions(
  value: Prisma.JsonValue | null,
): Array<{ id: string; text: string; position: number }> {
  if (!Array.isArray(value)) throw serviceUnavailableError("Tanı içeriği kullanılamıyor");
  const options: Array<{ id: string; text: string; position: number }> = [];
  for (const option of value) {
    if (
      !isRecord(option) ||
      typeof option.id !== "string" ||
      typeof option.text !== "string" ||
      typeof option.position !== "number" ||
      !Number.isInteger(option.position)
    ) {
      throw serviceUnavailableError("Tanı içeriği kullanılamıyor");
    }
    options.push({ id: option.id, text: option.text, position: option.position });
  }
  return options.sort((left, right) => left.position - right.position);
}

function levelName(levelCode: string | null): string | null {
  if (!levelCode) return null;
  return (
    CANONICAL_PROFICIENCY_LEVEL_MANIFEST.levels.find((level) => level.code === levelCode)?.name ??
    null
  );
}

function validateQuestionVersion(
  row: QuestionVersionRow | undefined,
  candidate: (typeof GUEST_DIAGNOSTIC_CANDIDATES)[number],
): void {
  const content = row?.question.content;
  const contentVersion = row?.contentVersion;
  if (
    !row ||
    row.id !== candidate.questionVersionId ||
    row.questionId !== candidate.questionId ||
    row.status !== "PUBLISHED" ||
    !row.publishedAt ||
    !row.question ||
    row.question.type === "OPEN_ENDED" ||
    row.question.status !== "PUBLISHED" ||
    row.question.deletedAt !== null ||
    !content ||
    content.tenantId !== null ||
    content.status !== "PUBLISHED" ||
    content.deletedAt !== null ||
    !contentVersion ||
    contentVersion.status !== "PUBLISHED" ||
    !contentVersion.publishedAt ||
    contentVersion.content.tenantId !== null ||
    contentVersion.content.status !== "PUBLISHED" ||
    contentVersion.content.deletedAt !== null ||
    contentVersion.content.id !== content.id ||
    row.question.skill?.code !== candidate.skillCode ||
    row.difficulty !== candidate.difficulty ||
    row.correctAnswer === null
  ) {
    throw serviceUnavailableError("Guest Diagnostic için yayınlanmış içerik hazır değil");
  }
  publicOptions(row.options);
}

async function loadPublishedCandidateRows(tx: GuestTransaction): Promise<QuestionVersionRow[]> {
  const rows = await tx.questionVersion.findMany({
    where: {
      id: { in: GUEST_DIAGNOSTIC_CANDIDATES.map((candidate) => candidate.questionVersionId) },
    },
    select: QUESTION_VERSION_SELECT,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const candidate of GUEST_DIAGNOSTIC_CANDIDATES) {
    validateQuestionVersion(byId.get(candidate.questionVersionId), candidate);
  }

  const sourceTemplateVersionIds = [
    ...new Set(GUEST_DIAGNOSTIC_CANDIDATES.map((candidate) => candidate.sourceTemplateVersionId)),
  ];
  const links = await tx.exerciseTemplateVersionQuestion.findMany({
    where: {
      templateVersionId: { in: sourceTemplateVersionIds },
      questionVersionId: {
        in: GUEST_DIAGNOSTIC_CANDIDATES.map((candidate) => candidate.questionVersionId),
      },
    },
    select: { templateVersionId: true, questionVersionId: true },
  });
  const linked = new Set(
    links.map((link) => `${link.templateVersionId}:${link.questionVersionId}`),
  );
  for (const candidate of GUEST_DIAGNOSTIC_CANDIDATES) {
    if (!linked.has(`${candidate.sourceTemplateVersionId}:${candidate.questionVersionId}`)) {
      throw serviceUnavailableError("Guest Diagnostic soru kaynağı kullanılamıyor");
    }
  }

  const sourceVersions = await tx.exerciseTemplateVersion.findMany({
    where: { id: { in: sourceTemplateVersionIds } },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      template: { select: { tenantId: true, status: true, deletedAt: true } },
    },
  });
  if (
    sourceVersions.length !== sourceTemplateVersionIds.length ||
    sourceVersions.some(
      (version) =>
        version.status !== "PUBLISHED" ||
        !version.publishedAt ||
        version.template.tenantId !== null ||
        version.template.status !== "PUBLISHED" ||
        version.template.deletedAt !== null,
    )
  ) {
    throw serviceUnavailableError("Guest Diagnostic soru kaynağı yayınlanmamış");
  }
  return GUEST_DIAGNOSTIC_CANDIDATES.map((candidate) => byId.get(candidate.questionVersionId)!);
}

async function activeRecommendationConfig(tx: GuestTransaction) {
  const config = await tx.guestDiagnosticRecommendationConfig.findFirst({
    where: {
      configKey: GUEST_DIAGNOSTIC_CONFIG_KEY,
      status: "PUBLISHED",
      enabled: true,
      scoringContractVersion: GUEST_DIAGNOSTIC_SCORING_VERSION,
    },
    orderBy: [{ version: "desc" }, { publishedAt: "desc" }],
  });
  if (
    !config ||
    config.minimumAnsweredCount !== GUEST_DIAGNOSTIC_QUESTION_COUNT ||
    config.minimumScorableCount !== GUEST_DIAGNOSTIC_MINIMUM_SCORABLE_COUNT
  ) {
    throw serviceUnavailableError("Guest Diagnostic recommendation config hazır değil");
  }
  return config;
}

function sessionSummary(
  session: { id: string; status: string; questionCount: number; expiresAt: Date },
  answeredCount: number,
) {
  return {
    sessionId: session.id,
    status: session.status,
    questionCount: session.questionCount,
    answeredCount,
    expiresAt: session.expiresAt.toISOString(),
  };
}

async function withOwnedGuestSession<T>(
  token: string,
  sessionId: string,
  operation: "READ" | "ANSWER" | "COMPLETE",
  callback: (tx: GuestTransaction, session: ValidatedGuestSession) => Promise<T>,
  client: GuestDbClient,
): Promise<T> {
  return withGuestSessionContext(
    token,
    operation,
    async (tx, session) => {
      if (session.id !== sessionId) throw notFoundError("Tanı oturumu bulunamadı");
      return callback(tx, session);
    },
    client,
  );
}

function configErrorMessage(error: unknown): boolean {
  return (
    error instanceof Error &&
    /GUEST_DATABASE_URL|database client identity|non-superuser/i.test(error.message)
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function normalizeGuestServiceError(error: unknown): never {
  if (configErrorMessage(error))
    throw serviceUnavailableError("Guest Diagnostic şu anda kullanılamıyor");
  if (error instanceof Error && error.name === "GuestRateLimitConfigurationError") {
    throw serviceUnavailableError("Guest Diagnostic şu anda kullanılamıyor");
  }
  if (error instanceof Error && error.name === "GuestRateLimitUnavailableError") {
    throw serviceUnavailableError("Guest Diagnostic koruması şu anda kullanılamıyor");
  }
  if (error instanceof Error && error.name === "GuestDiagnosticSecurityError") {
    throw notFoundError("Tanı oturumu bulunamadı veya artık geçerli değil");
  }
  throw error;
}

async function limit(
  limiter: GuestRateLimiter,
  policy: GuestRateLimitPolicy,
  identifier: string,
): Promise<void> {
  const result = await limiter.limit(policy, identifier);
  if (!result.allowed) throw conflictError("Çok fazla istek; lütfen biraz sonra tekrar dene");
}

function resultContract(result: {
  questionCount: number;
  answeredCount: number;
  scoredQuestionCount: number;
  score: number | null;
  skillSubscores: Prisma.JsonValue;
  resultState: string;
  confidenceState: string;
  recommendationMode: string;
  recommendedLevelCode: string | null;
  recommendationCopyKey: string | null;
  scoringContractVersion: number;
  definitionVersion: number;
}) {
  return {
    contractVersion: 1,
    recommendationMode: result.recommendationMode,
    questionCount: result.questionCount,
    answeredCount: result.answeredCount,
    scoredQuestionCount: result.scoredQuestionCount,
    score: result.score,
    skillSubscores: result.skillSubscores,
    resultState: result.resultState,
    confidenceState: result.confidenceState,
    recommendedLevelCode: result.recommendedLevelCode,
    recommendedLevelName: levelName(result.recommendedLevelCode),
    recommendationCopyKey: result.recommendationCopyKey,
    scoringContractVersion: result.scoringContractVersion,
    definitionVersion: result.definitionVersion,
    flags: {
      officialPlacement: false,
      studentProfileUpdated: false,
      baselineCreated: false,
      assessmentResultCreated: false,
    },
  };
}

export async function createOrResumeGuestDiagnostic(
  dependencies: GuestServiceDependencies,
): Promise<{
  sessionId: string;
  status: string;
  questionCount: number;
  answeredCount: number;
  expiresAt: string;
  token: string;
  csrfToken: string;
  resumed: boolean;
}> {
  const client = dependencies.client ?? getGuestDbClient();
  const limiter = requireRateLimiter(dependencies);
  await limit(limiter, "sessionCreation", dependencies.rateLimitIdentifier);
  assertRequestOrigin(dependencies.request, dependencies.allowedOrigins);

  const existingToken = getGuestToken(dependencies.request);
  const existingCsrf = getGuestCsrfToken(dependencies.request);
  if (existingToken && existingCsrf) {
    try {
      return await withGuestSessionContext(
        existingToken,
        "READ",
        async (tx, session) => {
          const row = await tx.guestDiagnosticSession.findUnique({
            where: { id: session.id },
            select: {
              id: true,
              status: true,
              questionCount: true,
              expiresAt: true,
              _count: { select: { answers: true } },
            },
          });
          if (!row) throw notFoundError("Tanı oturumu bulunamadı");
          return {
            ...sessionSummary(row, row._count.answers),
            token: "",
            csrfToken: "",
            resumed: true,
          };
        },
        client,
      );
    } catch (error) {
      if (!(error instanceof Error && error.name === "GuestDiagnosticSecurityError")) throw error;
    }
  }

  const token = createGuestToken();
  const csrfToken = createGuestCsrfToken();
  const expiresAt = new Date(Date.now() + GUEST_DIAGNOSTIC_SESSION_TTL_SECONDS * 1000);
  const created = await withNewGuestSessionContext(
    expiresAt,
    async (tx, session) => {
      const config = await activeRecommendationConfig(tx);
      const rows = await loadPublishedCandidateRows(tx);
      const byId = new Map(rows.map((row) => [row.id, row]));

      await tx.guestDiagnosticSession.create({
        data: {
          id: session.id,
          tokenHash: hashGuestToken(token),
          csrfTokenHash: hashGuestToken(csrfToken),
          definitionVersion: GUEST_DIAGNOSTIC_DEFINITION_VERSION,
          scoringContractVersion: GUEST_DIAGNOSTIC_SCORING_VERSION,
          recommendationConfigId: config.id,
          sourceTemplateVersionId: GUEST_DIAGNOSTIC_CANDIDATES[0]!.sourceTemplateVersionId,
          questionCount: GUEST_DIAGNOSTIC_QUESTION_COUNT,
          minimumScorableCount: GUEST_DIAGNOSTIC_MINIMUM_SCORABLE_COUNT,
          minimumAnsweredCount: GUEST_DIAGNOSTIC_QUESTION_COUNT,
          expiresAt,
          items: {
            create: GUEST_DIAGNOSTIC_CANDIDATES.map((candidate) => {
              const row = byId.get(candidate.questionVersionId)!;
              return {
                position: candidate.position,
                questionVersionId: row.id,
                questionType: row.question.type,
                skillCode: candidate.skillCode,
                difficulty: candidate.difficulty,
              };
            }),
          },
        },
      });
      return sessionSummary(
        { ...session, status: "IN_PROGRESS", questionCount: GUEST_DIAGNOSTIC_QUESTION_COUNT },
        0,
      );
    },
    client,
  );

  return { ...created, token, csrfToken, resumed: false };
}

function requireRateLimiter(dependencies: GuestServiceDependencies): GuestRateLimiter {
  if (!dependencies.rateLimiter) {
    throw serviceUnavailableError("Guest Diagnostic koruması şu anda kullanılamıyor");
  }
  return dependencies.rateLimiter;
}

export async function getGuestDiagnosticQuestions(
  sessionId: string,
  dependencies: GuestServiceDependencies,
) {
  const client = dependencies.client ?? getGuestDbClient();
  await limit(
    requireRateLimiter(dependencies),
    "questionRetrieval",
    dependencies.rateLimitIdentifier,
  );
  return withOwnedGuestSession(
    getGuestToken(dependencies.request) ?? "",
    sessionId,
    "READ",
    async (tx, session) => {
      const row = await tx.guestDiagnosticSession.findUnique({
        where: { id: session.id },
        select: {
          id: true,
          status: true,
          questionCount: true,
          expiresAt: true,
          items: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              position: true,
              questionType: true,
              skillCode: true,
              difficulty: true,
              answers: { select: { id: true } },
              questionVersion: {
                select: {
                  ...QUESTION_VERSION_SELECT,
                },
              },
            },
          },
        },
      });
      if (!row) throw notFoundError("Tanı oturumu bulunamadı");
      const answeredCount = row.items.filter((item) => item.answers.length > 0).length;
      return {
        ...sessionSummary(row, answeredCount),
        questions: row.items.map((item) => ({
          id: publicItemId(item.position),
          position: item.position,
          answered: item.answers.length > 0,
          questionType: item.questionType,
          skill: item.skillCode,
          difficulty: item.difficulty,
          prompt: item.questionVersion.prompt,
          options: publicOptions(item.questionVersion.options),
          content: item.questionVersion.contentVersion
            ? {
                title: item.questionVersion.contentVersion.title,
                body: item.questionVersion.contentVersion.body,
              }
            : null,
        })),
      };
    },
    client,
  );
}

export async function submitGuestDiagnosticAnswer(
  sessionId: string,
  input: GuestAnswerInput,
  dependencies: GuestServiceDependencies,
) {
  const client = dependencies.client ?? getGuestDbClient();
  await limit(
    requireRateLimiter(dependencies),
    "answerSubmission",
    dependencies.rateLimitIdentifier,
  );
  const token = getGuestToken(dependencies.request);
  if (!token) throw notFoundError("Tanı oturumu bulunamadı veya artık geçerli değil");

  try {
    return await withOwnedGuestSession(
      token,
      sessionId,
      "ANSWER",
      async (tx, session) => {
        const row = await tx.guestDiagnosticSession.findUnique({
          where: { id: session.id },
          select: { csrfTokenHash: true, status: true },
        });
        if (!row) throw notFoundError("Tanı oturumu bulunamadı");
        assertGuestCsrfRequest(
          dependencies.request,
          row.csrfTokenHash,
          dependencies.allowedOrigins,
        );

        const position = parsePublicItemId(input.itemId);
        const item = await tx.guestDiagnosticItem.findUnique({
          where: { sessionId_position: { sessionId: session.id, position } },
          select: {
            id: true,
            position: true,
            skillCode: true,
            questionType: true,
            questionVersion: {
              select: { options: true, correctAnswer: true, question: { select: { type: true } } },
            },
          },
        });
        if (!item) throw notFoundError("Tanı sorusu bulunamadı");

        const answerFingerprint = hashGuestAnswer(input.answer);
        const existingByClientId = await tx.guestDiagnosticAnswer.findUnique({
          where: {
            sessionId_clientAnswerId: {
              sessionId: session.id,
              clientAnswerId: input.clientAnswerId,
            },
          },
          select: {
            itemId: true,
            answerFingerprint: true,
            isCorrect: true,
            rawScore: true,
            responseOrder: true,
          },
        });
        if (existingByClientId) {
          if (
            existingByClientId.itemId !== item.id ||
            existingByClientId.answerFingerprint !== answerFingerprint
          ) {
            throw conflictError("Bu cevap kimliği daha önce farklı bir cevapla kullanılmış");
          }
          return {
            itemId: input.itemId,
            clientAnswerId: input.clientAnswerId,
            isCorrect: existingByClientId.isCorrect,
            rawScore: existingByClientId.rawScore,
            responseOrder: existingByClientId.responseOrder,
            idempotent: true,
          };
        }

        const existingForItem = await tx.guestDiagnosticAnswer.findUnique({
          where: { sessionId_itemId: { sessionId: session.id, itemId: item.id } },
          select: { id: true },
        });
        if (existingForItem) throw conflictError("Bu soru daha önce cevaplandı");

        const scored = scoreAttemptValue(item.questionVersion, input.answer);
        if (scored.rawScore === null || scored.isCorrect === null) {
          throw validationError("Bu soru tipi Guest Diagnostic tarafından desteklenmiyor");
        }
        const responseOrder =
          (await tx.guestDiagnosticAnswer.count({ where: { sessionId: session.id } })) + 1;
        await tx.guestDiagnosticAnswer.create({
          data: {
            sessionId: session.id,
            itemId: item.id,
            clientAnswerId: input.clientAnswerId,
            answerFingerprint,
            isCorrect: scored.isCorrect,
            rawScore: scored.rawScore,
            responseOrder,
            timeSpentMs: input.timeSpentMs ?? null,
          },
        });
        await tx.guestDiagnosticSession.update({
          where: { id: session.id },
          data: { lastActivityAt: new Date() },
        });
        return {
          itemId: input.itemId,
          clientAnswerId: input.clientAnswerId,
          isCorrect: scored.isCorrect,
          rawScore: scored.rawScore,
          responseOrder,
          idempotent: false,
        };
      },
      client,
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw conflictError("Bu soru daha önce cevaplandı");
    }
    throw error;
  }
}

function evaluateStoredAnswers(
  answers: Array<{ isCorrect: boolean; rawScore: number; item: { skillCode: string } }>,
  minimumScorableCount: number,
  policy: ReturnType<typeof parseGuestRecommendationPolicy>,
): GuestEvaluation {
  return evaluateGuestDiagnostic(
    answers.map((answer) => ({
      skillCode: answer.item.skillCode as ProficiencySkillCode,
      isCorrect: answer.isCorrect,
      rawScore: answer.rawScore,
    })),
    minimumScorableCount,
    policy,
  );
}

async function completeInTransaction(
  tx: GuestTransaction,
  session: ValidatedGuestSession,
  request: FastifyRequest,
  allowedOrigins: readonly string[],
) {
  // Serialize completion for one session so concurrent requests observe the
  // first durable result instead of racing on the unique result constraint.
  await tx.$queryRaw`
    SELECT "id"
    FROM "GuestDiagnosticSession"
    WHERE "id" = ${session.id}
    FOR UPDATE
  `;
  const row = await tx.guestDiagnosticSession.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      status: true,
      csrfTokenHash: true,
      questionCount: true,
      minimumScorableCount: true,
      minimumAnsweredCount: true,
      definitionVersion: true,
      scoringContractVersion: true,
      recommendationConfigId: true,
      result: true,
      answers: {
        orderBy: { responseOrder: "asc" },
        select: { isCorrect: true, rawScore: true, item: { select: { skillCode: true } } },
      },
    },
  });
  if (!row) throw notFoundError("Tanı oturumu bulunamadı");
  assertGuestCsrfRequest(request, row.csrfTokenHash, allowedOrigins);
  if (row.result) return resultContract(row.result);
  if (row.status !== "IN_PROGRESS")
    throw notFoundError("Tanı oturumu bulunamadı veya artık geçerli değil");
  if (row.answers.length < row.minimumAnsweredCount) {
    throw validationError("Tanı tamamlanmadan önce bütün sorular cevaplanmalı");
  }

  const scoredCount = row.answers.filter((answer) => answer.rawScore !== null).length;
  if (scoredCount < row.minimumScorableCount) {
    throw validationError("Tanı sonucu için yeterli sayıda puanlanabilir cevap gerekli");
  }

  // The config relation is deliberately loaded as an optional top-level row.
  // Its RLS policy hides disabled/unpublished configs; selecting it as a
  // required Prisma relation would turn that expected absence into a 500.
  const recommendationConfig = await tx.guestDiagnosticRecommendationConfig.findUnique({
    where: { id: row.recommendationConfigId },
    select: {
      recommendationThresholds: true,
      skillSignalThresholds: true,
      status: true,
      enabled: true,
      publishedAt: true,
    },
  });
  const config =
    recommendationConfig?.status === "PUBLISHED" &&
    recommendationConfig.enabled &&
    recommendationConfig.publishedAt
      ? parseGuestRecommendationPolicy(
          recommendationConfig.recommendationThresholds,
          recommendationConfig.skillSignalThresholds,
        )
      : null;
  const evaluation = evaluateStoredAnswers(row.answers, row.minimumScorableCount, config);
  const result = await tx.guestDiagnosticResult.create({
    data: {
      sessionId: row.id,
      scoringContractVersion: row.scoringContractVersion,
      recommendationConfigId: row.recommendationConfigId,
      definitionVersion: row.definitionVersion,
      questionCount: row.questionCount,
      answeredCount: row.answers.length,
      scoredQuestionCount: evaluation.scoredQuestionCount,
      score: evaluation.score,
      skillSubscores: evaluation.skillSubscores,
      resultState: evaluation.resultState,
      confidenceState: evaluation.confidenceState,
      recommendationMode: "RECOMMENDATION_ONLY",
      recommendedLevelCode: evaluation.recommendedLevelCode,
      recommendedLevelName: levelName(evaluation.recommendedLevelCode),
      recommendationCopyKey: evaluation.recommendedLevelCode
        ? "GUEST_DIAGNOSTIC_RECOMMENDATION"
        : null,
      completedAt: new Date(),
    },
  });
  await tx.guestDiagnosticSession.update({
    where: { id: row.id },
    data: {
      status: "COMPLETED",
      completedAt: result.completedAt,
      lastActivityAt: result.completedAt,
    },
  });
  return resultContract(result);
}

export async function completeGuestDiagnostic(
  sessionId: string,
  dependencies: GuestServiceDependencies,
) {
  const client = dependencies.client ?? getGuestDbClient();
  await limit(requireRateLimiter(dependencies), "completion", dependencies.rateLimitIdentifier);
  const token = getGuestToken(dependencies.request);
  if (!token) throw notFoundError("Tanı oturumu bulunamadı veya artık geçerli değil");

  try {
    return await withOwnedGuestSession(
      token,
      sessionId,
      "COMPLETE",
      (tx, session) =>
        completeInTransaction(tx, session, dependencies.request, dependencies.allowedOrigins),
      client,
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      try {
        return await getGuestDiagnosticResult(sessionId, dependencies);
      } catch {
        throw error;
      }
    }
    if (!(error instanceof Error && error.name === "GuestDiagnosticSecurityError")) throw error;
    return getGuestDiagnosticResult(sessionId, dependencies);
  }
}

export async function getGuestDiagnosticResult(
  sessionId: string,
  dependencies: GuestServiceDependencies,
) {
  const client = dependencies.client ?? getGuestDbClient();
  await limit(
    requireRateLimiter(dependencies),
    "resultRetrieval",
    dependencies.rateLimitIdentifier,
  );
  const token = getGuestToken(dependencies.request);
  if (!token) throw notFoundError("Tanı oturumu bulunamadı veya artık geçerli değil");
  return withOwnedGuestSession(
    token,
    sessionId,
    "READ",
    async (tx, session) => {
      const result = await tx.guestDiagnosticResult.findUnique({
        where: { sessionId: session.id },
      });
      if (!result) throw conflictError("Tanı henüz tamamlanmadı");
      return resultContract(result);
    },
    client,
  );
}
