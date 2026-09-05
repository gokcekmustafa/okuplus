import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST,
  canonicalPlacementAssessmentConfig,
  type CanonicalPlacementAssessmentManifest,
} from "./canonical-placement-assessment.js";
import {
  CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST,
  type CanonicalPlacementQuestion,
} from "./canonical-placement-item-bank.js";
import { PROFICIENCY_SKILL_CODES, type ProficiencySkillCode } from "./proficiency-levels.js";

export const CANONICAL_PLACEMENT_GRAPH_IDS = Object.freeze({
  assessmentId: "canonical-assessment-oku-reading-placement-v1",
  templateId: "canonical-template-oku-reading-placement-v1",
  templateVersionId: "canonical-template-version-oku-reading-placement-v1-v1",
});

export type CanonicalPlacementSkillRef = {
  id: string;
  code: ProficiencySkillCode;
  name: string;
};

export type CanonicalPlacementContentPlan = {
  itemBankContentId: string;
  contentId: string;
  contentVersionId: string;
  position: number;
  title: string;
  domain: string;
  body: string;
  difficulty: number;
  wordCount: number;
  skillCodes: ProficiencySkillCode[];
  license: string;
  changelog: string;
};

export type CanonicalPlacementQuestionPlan = {
  stableQuestionId: string;
  itemBankContentId: string;
  contentId: string;
  questionId: string;
  questionVersionId: string;
  contentPosition: number;
  templatePosition: number;
  skillCode: ProficiencySkillCode;
  question: CanonicalPlacementQuestion;
  generationMetadata: Record<string, unknown>;
};

export type CanonicalPlacementAssessmentGraph = {
  manifest: CanonicalPlacementAssessmentManifest;
  skills: CanonicalPlacementSkillRef[];
  assessment: {
    id: string;
    tenantId: null;
    title: string;
    type: "PLACEMENT";
    levelId: null;
    status: "PUBLISHED";
    deletedAt: null;
    config: Record<string, unknown>;
  };
  template: {
    id: string;
    tenantId: null;
    title: string;
    type: "MIXED";
    skillId: null;
    contentId: null;
    status: "PUBLISHED";
    deletedAt: null;
    config: Record<string, unknown>;
  };
  templateVersion: {
    id: string;
    templateId: string;
    version: 1;
    status: "PUBLISHED";
  };
  contents: CanonicalPlacementContentPlan[];
  questions: CanonicalPlacementQuestionPlan[];
  contentSkills: Array<{ contentId: string; skillId: string; skillCode: ProficiencySkillCode }>;
};

export type CanonicalPlacementExistingAssessment = {
  id: string;
  tenantId: string | null;
  title: string;
  type: string;
  levelId: string | null;
  status: string;
  deletedAt: Date | null;
  config: unknown;
};

export type CanonicalPlacementExistingTemplate = {
  id: string;
  tenantId: string | null;
  title: string;
  type: string;
  skillId: string | null;
  contentId: string | null;
  status: string;
  deletedAt: Date | null;
  config: unknown;
};

export type CanonicalPlacementExistingTemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  status: string;
  publishedAt: Date | null;
};

export type CanonicalPlacementExistingContent = {
  id: string;
  tenantId: string | null;
  type: string;
  title: string;
  difficulty: number;
  status: string;
  currentVersionId: string | null;
  deletedAt: Date | null;
};

export type CanonicalPlacementExistingContentVersion = {
  id: string;
  contentId: string;
  version: number;
  title: string;
  body: string;
  wordCount: number;
  license: string | null;
  changelog: string | null;
  status: string;
  publishedAt: Date | null;
};

export type CanonicalPlacementExistingQuestion = {
  id: string;
  contentId: string;
  position: number;
  type: string;
  skillId: string | null;
  status: string;
  deletedAt: Date | null;
};

export type CanonicalPlacementExistingQuestionVersion = {
  id: string;
  questionId: string;
  version: number;
  prompt: string;
  options: unknown;
  correctAnswer: unknown;
  explanation: string | null;
  difficulty: number | null;
  status: string;
  publishedAt: Date | null;
  partialCreditEnabled: boolean;
  generationMetadata: unknown;
};

export type CanonicalPlacementExistingContentSkill = {
  contentId: string;
  skillId: string;
  skillCode: string;
};

export type CanonicalPlacementExistingTemplateContent = {
  templateVersionId: string;
  contentVersionId: string;
  position: number;
};

export type CanonicalPlacementExistingTemplateQuestion = {
  templateVersionId: string;
  questionVersionId: string;
  questionId: string | null;
  position: number;
};

export type CanonicalPlacementSnapshot = {
  assessment: CanonicalPlacementExistingAssessment | null;
  template: CanonicalPlacementExistingTemplate | null;
  templateVersion: CanonicalPlacementExistingTemplateVersion | null;
  contents: CanonicalPlacementExistingContent[];
  contentVersions: CanonicalPlacementExistingContentVersion[];
  questions: CanonicalPlacementExistingQuestion[];
  questionVersions: CanonicalPlacementExistingQuestionVersion[];
  contentSkills: CanonicalPlacementExistingContentSkill[];
  templateContents: CanonicalPlacementExistingTemplateContent[];
  templateQuestions: CanonicalPlacementExistingTemplateQuestion[];
  assessmentMarkerIds: string[];
  templateMarkerIds: string[];
};

export type CanonicalPlacementBootstrapAction = "CREATE" | "NOOP" | "CONFLICT";

export type CanonicalPlacementBootstrapPlan = {
  action: CanonicalPlacementBootstrapAction;
  conflicts: string[];
  idempotent: boolean;
  expectedCounts: {
    assessments: number;
    templates: number;
    templateVersions: number;
    contents: number;
    contentVersions: number;
    contentSkills: number;
    questions: number;
    questionVersions: number;
    templateContents: number;
    templateQuestions: number;
  };
};

function wordCount(body: string): number {
  return body.trim().split(/\s+/u).filter(Boolean).length;
}

function stableContentId(contentId: string): string {
  return `canonical-placement-content-${contentId}`;
}

function stableContentVersionId(contentId: string): string {
  return `canonical-placement-content-version-${contentId}-v1`;
}

function stableQuestionId(questionId: string): string {
  return `canonical-placement-question-${questionId}`;
}

function stableQuestionVersionId(questionId: string): string {
  return `canonical-placement-question-version-${questionId}-v1`;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function questionOptions(question: CanonicalPlacementQuestion): unknown[] {
  return question.options;
}

function expectedTemplateConfig(
  manifest: CanonicalPlacementAssessmentManifest,
): Record<string, unknown> {
  return {
    canonicalManifestId: manifest.manifestId,
    canonicalManifestVersion: manifest.manifestVersion,
    stableIdentity: CANONICAL_PLACEMENT_GRAPH_IDS,
    assessmentKey: manifest.assessment.assessmentKey,
    itemBank: manifest.itemBank,
    sourceStrategy: manifest.template.sourceStrategy,
    visibility: manifest.assessment.visibility,
    questionCount: manifest.questionPlan.totalQuestionCount,
    questionOrder: manifest.questionPlan.questionOrder,
    skillDistribution: manifest.questionPlan.skillDistribution,
    difficultyDistribution: manifest.questionPlan.difficultyDistribution,
    scoring: manifest.scoring,
    levelMappingPolicy: manifest.assessment.levelMappingPolicy,
  };
}

function expectedGenerationMetadata(
  manifest: CanonicalPlacementAssessmentManifest,
  contentId: string,
  question: CanonicalPlacementQuestion,
): Record<string, unknown> {
  return {
    canonicalManifestId: manifest.manifestId,
    canonicalManifestVersion: manifest.manifestVersion,
    itemBankManifestId: manifest.itemBank.manifestId,
    itemBankManifestVersion: manifest.itemBank.manifestVersion,
    stableQuestionId: question.stableQuestionId,
    stableContentId: contentId,
    skillCode: question.skillCode,
    difficultyLabel: question.difficultyLabel,
    cognitiveDemand: question.cognitiveDemand,
    rationale: question.rationale,
    evidence: question.evidence,
    sourceMetadata: question.sourceMetadata,
    ...(question.revisionReason ? { revisionReason: question.revisionReason } : {}),
  };
}

export function buildCanonicalPlacementAssessmentGraph(
  manifest: CanonicalPlacementAssessmentManifest = CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST,
  skillRefs: readonly CanonicalPlacementSkillRef[] = PROFICIENCY_SKILL_CODES.map((code) => ({
    id: code,
    code,
    name: code,
  })),
): CanonicalPlacementAssessmentGraph {
  const skillByCode = new Map(skillRefs.map((skill) => [skill.code, skill]));
  const missingSkills = PROFICIENCY_SKILL_CODES.filter((code) => !skillByCode.has(code));
  if (missingSkills.length > 0) {
    throw new Error(`placement graph için Skill eksik: ${missingSkills.join(", ")}`);
  }

  const contents = CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.passages.map((passage, position) => {
    const passageQuestions = CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.filter(
      (question) => question.contentId === passage.contentId,
    );
    const difficulty =
      passageQuestions.reduce((sum, question) => sum + question.difficulty, 0) /
      passageQuestions.length;
    return {
      itemBankContentId: passage.contentId,
      contentId: stableContentId(passage.contentId),
      contentVersionId: stableContentVersionId(passage.contentId),
      position,
      title: passage.title,
      domain: passage.domain,
      body: passage.body,
      difficulty,
      wordCount: wordCount(passage.body),
      skillCodes: [...new Set(passageQuestions.map((question) => question.skillCode))],
      license: "INTERNAL_ORIGINAL",
      changelog: `${manifest.manifestId}@${manifest.manifestVersion}; itemBank=${manifest.itemBank.manifestId}@${manifest.itemBank.manifestVersion}; stableContentId=${stableContentId(passage.contentId)}; domain=${passage.domain}.`,
    } satisfies CanonicalPlacementContentPlan;
  });

  const contentByItemBankId = new Map(
    contents.map((content) => [content.itemBankContentId, content]),
  );
  const questions = CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.map(
    (question, templatePosition) => {
      const content = contentByItemBankId.get(question.contentId);
      if (!content)
        throw new Error(`placement question passage eşleşmesi yok: ${question.contentId}`);
      const contentQuestions = CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.filter(
        (candidate) => candidate.contentId === question.contentId,
      );
      return {
        stableQuestionId: question.stableQuestionId,
        itemBankContentId: question.contentId,
        contentId: content.contentId,
        questionId: stableQuestionId(question.stableQuestionId),
        questionVersionId: stableQuestionVersionId(question.stableQuestionId),
        contentPosition: contentQuestions.findIndex(
          (candidate) => candidate.stableQuestionId === question.stableQuestionId,
        ),
        templatePosition,
        skillCode: question.skillCode,
        question,
        generationMetadata: expectedGenerationMetadata(manifest, content.contentId, question),
      } satisfies CanonicalPlacementQuestionPlan;
    },
  );

  const config = canonicalPlacementAssessmentConfig(manifest);
  const assessmentConfig = {
    ...config,
    resultLevelId: null,
    reviewRequired: true,
  };
  const skills = PROFICIENCY_SKILL_CODES.map((code) => skillByCode.get(code)!);

  return {
    manifest,
    skills,
    assessment: {
      id: manifest.graph.assessmentId,
      tenantId: null,
      title: manifest.assessment.title,
      type: "PLACEMENT",
      levelId: null,
      status: "PUBLISHED",
      deletedAt: null,
      config: assessmentConfig,
    },
    template: {
      id: manifest.graph.templateId,
      tenantId: null,
      title: manifest.assessment.title,
      type: "MIXED",
      skillId: null,
      contentId: null,
      status: "PUBLISHED",
      deletedAt: null,
      config: expectedTemplateConfig(manifest),
    },
    templateVersion: {
      id: manifest.graph.templateVersionId,
      templateId: manifest.graph.templateId,
      version: 1,
      status: "PUBLISHED",
    },
    contents,
    questions,
    contentSkills: contents.flatMap((content) =>
      content.skillCodes.map((skillCode) => ({
        contentId: content.contentId,
        skillId: skillByCode.get(skillCode)!.id,
        skillCode,
      })),
    ),
  };
}

async function readMarkerIds(
  client: PrismaClient | Prisma.TransactionClient,
  table: "Assessment" | "ExerciseTemplate",
  manifestId: string,
): Promise<string[]> {
  const rows = await client.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${table}"`)} WHERE "config"->>'canonicalManifestId' = ${manifestId}`,
  );
  return rows.map((row) => row.id);
}

export async function readCanonicalPlacementSnapshot(
  client: PrismaClient | Prisma.TransactionClient,
  graph: CanonicalPlacementAssessmentGraph,
): Promise<CanonicalPlacementSnapshot> {
  const contentIds = graph.contents.map((content) => content.contentId);
  const contentVersionIds = graph.contents.map((content) => content.contentVersionId);
  const questionIds = graph.questions.map((question) => question.questionId);
  const questionVersionIds = graph.questions.map((question) => question.questionVersionId);

  const [
    assessment,
    template,
    templateVersion,
    contents,
    contentVersions,
    questions,
    questionVersions,
    contentSkills,
    templateContents,
    templateQuestions,
    assessmentMarkerIds,
    templateMarkerIds,
  ] = await Promise.all([
    client.assessment.findUnique({ where: { id: graph.assessment.id } }),
    client.exerciseTemplate.findUnique({ where: { id: graph.template.id } }),
    client.exerciseTemplateVersion.findUnique({ where: { id: graph.templateVersion.id } }),
    client.content.findMany({ where: { id: { in: contentIds } } }),
    client.contentVersion.findMany({ where: { id: { in: contentVersionIds } } }),
    client.question.findMany({ where: { id: { in: questionIds } } }),
    client.questionVersion.findMany({ where: { id: { in: questionVersionIds } } }),
    client.contentSkill.findMany({
      where: { contentId: { in: contentIds } },
      include: { skill: { select: { code: true } } },
    }),
    client.exerciseTemplateVersionContent.findMany({
      where: { templateVersionId: graph.templateVersion.id },
    }),
    client.exerciseTemplateVersionQuestion.findMany({
      where: { templateVersionId: graph.templateVersion.id },
    }),
    readMarkerIds(client, "Assessment", graph.manifest.manifestId),
    readMarkerIds(client, "ExerciseTemplate", graph.manifest.manifestId),
  ]);

  return {
    assessment,
    template,
    templateVersion,
    contents,
    contentVersions,
    questions,
    questionVersions,
    contentSkills: contentSkills.map((row) => ({
      contentId: row.contentId,
      skillId: row.skillId,
      skillCode: row.skill.code,
    })),
    templateContents,
    templateQuestions,
    assessmentMarkerIds,
    templateMarkerIds,
  };
}

function addConflict(conflicts: string[], message: string): void {
  if (!conflicts.includes(message)) conflicts.push(message);
}

function matchesExpectedContent(
  actual: CanonicalPlacementExistingContent,
  expected: CanonicalPlacementContentPlan,
): boolean {
  return (
    actual.tenantId === null &&
    actual.type === "PASSAGE" &&
    actual.title === expected.title &&
    actual.difficulty === expected.difficulty &&
    actual.status === "PUBLISHED" &&
    actual.currentVersionId === expected.contentVersionId &&
    actual.deletedAt === null
  );
}

function matchesExpectedContentVersion(
  actual: CanonicalPlacementExistingContentVersion,
  expected: CanonicalPlacementContentPlan,
): boolean {
  return (
    actual.contentId === expected.contentId &&
    actual.version === 1 &&
    actual.title === expected.title &&
    actual.body === expected.body &&
    actual.wordCount === expected.wordCount &&
    actual.license === expected.license &&
    actual.changelog === expected.changelog &&
    actual.status === "PUBLISHED" &&
    actual.publishedAt !== null
  );
}

function matchesExpectedQuestion(
  actual: CanonicalPlacementExistingQuestion,
  expected: CanonicalPlacementQuestionPlan,
  skill: CanonicalPlacementSkillRef,
): boolean {
  return (
    actual.contentId === expected.contentId &&
    actual.position === expected.contentPosition &&
    actual.type === expected.question.questionType &&
    actual.skillId === skill.id &&
    actual.status === "PUBLISHED" &&
    actual.deletedAt === null
  );
}

function matchesExpectedQuestionVersion(
  actual: CanonicalPlacementExistingQuestionVersion,
  expected: CanonicalPlacementQuestionPlan,
): boolean {
  return (
    actual.questionId === expected.questionId &&
    actual.version === 1 &&
    actual.prompt === expected.question.questionText &&
    isDeepStrictEqual(actual.options, questionOptions(expected.question)) &&
    isDeepStrictEqual(actual.correctAnswer, expected.question.correctAnswer) &&
    actual.explanation === expected.question.explanation &&
    actual.difficulty === expected.question.difficulty &&
    actual.status === "PUBLISHED" &&
    actual.publishedAt !== null &&
    actual.partialCreditEnabled === false &&
    isDeepStrictEqual(actual.generationMetadata, expected.generationMetadata)
  );
}

export function planCanonicalPlacementPromotion(
  graph: CanonicalPlacementAssessmentGraph,
  snapshot: CanonicalPlacementSnapshot,
): CanonicalPlacementBootstrapPlan {
  const expectedCounts = {
    assessments: 1,
    templates: 1,
    templateVersions: 1,
    contents: graph.contents.length,
    contentVersions: graph.contents.length,
    contentSkills: graph.contentSkills.length,
    questions: graph.questions.length,
    questionVersions: graph.questions.length,
    templateContents: graph.contents.length,
    templateQuestions: graph.questions.length,
  };
  const conflicts: string[] = [];
  const skillByCode = new Map(graph.skills.map((skill) => [skill.code, skill]));

  if (
    snapshot.assessment &&
    !(
      snapshot.assessment.id === graph.assessment.id &&
      snapshot.assessment.tenantId === null &&
      snapshot.assessment.title === graph.assessment.title &&
      snapshot.assessment.type === graph.assessment.type &&
      snapshot.assessment.levelId === null &&
      snapshot.assessment.status === graph.assessment.status &&
      snapshot.assessment.deletedAt === null &&
      isDeepStrictEqual(snapshot.assessment.config, graph.assessment.config)
    )
  ) {
    addConflict(conflicts, "canonical placement Assessment identity/metadata mismatch");
  }
  if (
    snapshot.template &&
    !(
      snapshot.template.id === graph.template.id &&
      snapshot.template.tenantId === null &&
      snapshot.template.title === graph.template.title &&
      snapshot.template.type === graph.template.type &&
      snapshot.template.skillId === null &&
      snapshot.template.contentId === null &&
      snapshot.template.status === graph.template.status &&
      snapshot.template.deletedAt === null &&
      isDeepStrictEqual(snapshot.template.config, graph.template.config)
    )
  ) {
    addConflict(conflicts, "canonical placement Template identity/metadata mismatch");
  }
  if (
    snapshot.templateVersion &&
    !(
      snapshot.templateVersion.id === graph.templateVersion.id &&
      snapshot.templateVersion.templateId === graph.templateVersion.templateId &&
      snapshot.templateVersion.version === 1 &&
      snapshot.templateVersion.status === "PUBLISHED" &&
      snapshot.templateVersion.publishedAt !== null
    )
  ) {
    addConflict(conflicts, "canonical placement TemplateVersion identity/status mismatch");
  }

  const contentById = new Map(snapshot.contents.map((content) => [content.id, content]));
  const contentVersionById = new Map(
    snapshot.contentVersions.map((contentVersion) => [contentVersion.id, contentVersion]),
  );
  const questionById = new Map(snapshot.questions.map((question) => [question.id, question]));
  const questionVersionById = new Map(
    snapshot.questionVersions.map((questionVersion) => [questionVersion.id, questionVersion]),
  );

  for (const expected of graph.contents) {
    const actualContent = contentById.get(expected.contentId);
    const actualContentVersion = contentVersionById.get(expected.contentVersionId);
    if (actualContent && !matchesExpectedContent(actualContent, expected)) {
      addConflict(conflicts, `placement Content mismatch: ${expected.contentId}`);
    }
    if (actualContentVersion && !matchesExpectedContentVersion(actualContentVersion, expected)) {
      addConflict(conflicts, `placement ContentVersion mismatch: ${expected.contentVersionId}`);
    }
  }

  for (const expected of graph.questions) {
    const actualQuestion = questionById.get(expected.questionId);
    const actualQuestionVersion = questionVersionById.get(expected.questionVersionId);
    const skill = skillByCode.get(expected.skillCode)!;
    if (actualQuestion && !matchesExpectedQuestion(actualQuestion, expected, skill)) {
      addConflict(conflicts, `placement Question mismatch: ${expected.questionId}`);
    }
    if (actualQuestionVersion && !matchesExpectedQuestionVersion(actualQuestionVersion, expected)) {
      addConflict(conflicts, `placement QuestionVersion mismatch: ${expected.questionVersionId}`);
    }
  }

  const expectedContentSkills = new Set(
    graph.contentSkills.map((row) => `${row.contentId}|${row.skillId}`),
  );
  const actualContentSkills = new Set(
    snapshot.contentSkills.map((row) => `${row.contentId}|${row.skillId}`),
  );
  if (
    snapshot.contentSkills.length > 0 &&
    (snapshot.contentSkills.length !== expectedContentSkills.size ||
      [...expectedContentSkills].some((key) => !actualContentSkills.has(key)) ||
      snapshot.contentSkills.some(
        (row) => !expectedContentSkills.has(`${row.contentId}|${row.skillId}`),
      ))
  ) {
    addConflict(conflicts, "placement ContentSkill graph mismatch");
  }

  const expectedTemplateContents = new Set(
    graph.contents.map(
      (content) => `${graph.templateVersion.id}|${content.contentVersionId}|${content.position}`,
    ),
  );
  const actualTemplateContents = new Set(
    snapshot.templateContents.map(
      (row) => `${row.templateVersionId}|${row.contentVersionId}|${row.position}`,
    ),
  );
  if (
    snapshot.templateContents.length > 0 &&
    (snapshot.templateContents.length !== expectedTemplateContents.size ||
      [...expectedTemplateContents].some((key) => !actualTemplateContents.has(key)) ||
      snapshot.templateContents.some(
        (row) =>
          !expectedTemplateContents.has(
            `${row.templateVersionId}|${row.contentVersionId}|${row.position}`,
          ),
      ))
  ) {
    addConflict(conflicts, "placement TemplateVersionContent graph mismatch");
  }

  const expectedTemplateQuestions = new Set(
    graph.questions.map(
      (question) =>
        `${graph.templateVersion.id}|${question.questionVersionId}|${question.questionId}|${question.templatePosition}`,
    ),
  );
  const actualTemplateQuestions = new Set(
    snapshot.templateQuestions.map(
      (row) =>
        `${row.templateVersionId}|${row.questionVersionId}|${row.questionId}|${row.position}`,
    ),
  );
  if (
    snapshot.templateQuestions.length > 0 &&
    (snapshot.templateQuestions.length !== expectedTemplateQuestions.size ||
      [...expectedTemplateQuestions].some((key) => !actualTemplateQuestions.has(key)) ||
      snapshot.templateQuestions.some(
        (row) =>
          !expectedTemplateQuestions.has(
            `${row.templateVersionId}|${row.questionVersionId}|${row.questionId}|${row.position}`,
          ),
      ))
  ) {
    addConflict(conflicts, "placement TemplateVersionQuestion graph mismatch");
  }

  const expectedAssessmentMarker = graph.assessment.id;
  const expectedTemplateMarker = graph.template.id;
  if (snapshot.assessmentMarkerIds.some((id) => id !== expectedAssessmentMarker)) {
    addConflict(conflicts, "başka Assessment canonical placement marker'ı mevcut");
  }
  if (snapshot.templateMarkerIds.some((id) => id !== expectedTemplateMarker)) {
    addConflict(conflicts, "başka Template canonical placement marker'ı mevcut");
  }

  const stableRecordCount =
    Number(snapshot.assessment !== null) +
    Number(snapshot.template !== null) +
    Number(snapshot.templateVersion !== null) +
    snapshot.contents.length +
    snapshot.contentVersions.length +
    snapshot.questions.length +
    snapshot.questionVersions.length +
    snapshot.contentSkills.length +
    snapshot.templateContents.length +
    snapshot.templateQuestions.length;
  const allExpectedRecordsPresent =
    snapshot.assessment !== null &&
    snapshot.template !== null &&
    snapshot.templateVersion !== null &&
    snapshot.contents.length === expectedCounts.contents &&
    snapshot.contentVersions.length === expectedCounts.contentVersions &&
    snapshot.questions.length === expectedCounts.questions &&
    snapshot.questionVersions.length === expectedCounts.questionVersions &&
    snapshot.contentSkills.length === expectedCounts.contentSkills &&
    snapshot.templateContents.length === expectedCounts.templateContents &&
    snapshot.templateQuestions.length === expectedCounts.templateQuestions;

  if (allExpectedRecordsPresent && conflicts.length === 0) {
    return { action: "NOOP", conflicts: [], idempotent: true, expectedCounts };
  }
  if (
    stableRecordCount > 0 ||
    snapshot.assessmentMarkerIds.length > 0 ||
    snapshot.templateMarkerIds.length > 0
  ) {
    addConflict(conflicts, "canonical placement graph kısmi veya mevcut; overwrite yapılmayacak");
  }
  if (conflicts.length > 0) {
    return { action: "CONFLICT", conflicts, idempotent: false, expectedCounts };
  }
  return { action: "CREATE", conflicts: [], idempotent: false, expectedCounts };
}

export async function applyCanonicalPlacementPromotion(
  client: PrismaClient,
  graph: CanonicalPlacementAssessmentGraph,
): Promise<{
  assessmentId: string;
  templateId: string;
  templateVersionId: string;
  contentIds: string[];
  questionIds: string[];
}> {
  const publishedAt = new Date();
  return client.$transaction(
    async (tx) => {
      for (const content of graph.contents) {
        await tx.content.create({
          data: {
            id: content.contentId,
            tenantId: null,
            type: "PASSAGE",
            title: content.title,
            difficulty: content.difficulty,
            status: "DRAFT",
          },
        });
        await tx.contentVersion.create({
          data: {
            id: content.contentVersionId,
            contentId: content.contentId,
            version: 1,
            title: content.title,
            body: content.body,
            wordCount: content.wordCount,
            license: content.license,
            changelog: content.changelog,
            status: "DRAFT",
          },
        });
      }
      await tx.contentSkill.createMany({
        data: graph.contentSkills.map(({ contentId, skillId }) => ({ contentId, skillId })),
      });

      for (const question of graph.questions) {
        const skill = graph.skills.find((candidate) => candidate.code === question.skillCode)!;
        await tx.question.create({
          data: {
            id: question.questionId,
            contentId: question.contentId,
            position: question.contentPosition,
            type: question.question.questionType,
            skillId: skill.id,
            status: "DRAFT",
          },
        });
        await tx.questionVersion.create({
          data: {
            id: question.questionVersionId,
            questionId: question.questionId,
            version: 1,
            prompt: question.question.questionText,
            options: asJson(question.question.options),
            correctAnswer: asJson(question.question.correctAnswer),
            explanation: question.question.explanation,
            difficulty: question.question.difficulty,
            status: "DRAFT",
            partialCreditEnabled: false,
            generationMetadata: asJson(question.generationMetadata),
          },
        });
      }

      await tx.exerciseTemplate.create({
        data: {
          id: graph.template.id,
          tenantId: null,
          title: graph.template.title,
          type: "MIXED",
          skillId: null,
          contentId: null,
          config: asJson(graph.template.config),
          status: "DRAFT",
        },
      });
      await tx.exerciseTemplateVersion.create({
        data: {
          id: graph.templateVersion.id,
          templateId: graph.template.id,
          version: 1,
          status: "DRAFT",
        },
      });
      await tx.exerciseTemplateVersionContent.createMany({
        data: graph.contents.map((content) => ({
          templateVersionId: graph.templateVersion.id,
          contentVersionId: content.contentVersionId,
          position: content.position,
        })),
      });
      await tx.exerciseTemplateVersionQuestion.createMany({
        data: graph.questions.map((question) => ({
          templateVersionId: graph.templateVersion.id,
          questionVersionId: question.questionVersionId,
          questionId: question.questionId,
          position: question.templatePosition,
        })),
      });

      for (const content of graph.contents) {
        await tx.contentVersion.update({
          where: { id: content.contentVersionId },
          data: { status: "PUBLISHED", publishedAt },
        });
        await tx.content.update({
          where: { id: content.contentId },
          data: { currentVersionId: content.contentVersionId, status: "PUBLISHED" },
        });
      }
      await tx.questionVersion.updateMany({
        where: { id: { in: graph.questions.map((question) => question.questionVersionId) } },
        data: { status: "PUBLISHED", publishedAt },
      });
      await tx.question.updateMany({
        where: { id: { in: graph.questions.map((question) => question.questionId) } },
        data: { status: "PUBLISHED" },
      });
      await tx.exerciseTemplateVersion.update({
        where: { id: graph.templateVersion.id },
        data: { status: "PUBLISHED", publishedAt },
      });
      await tx.exerciseTemplate.update({
        where: { id: graph.template.id },
        data: { status: "PUBLISHED" },
      });
      await tx.assessment.create({
        data: {
          id: graph.assessment.id,
          tenantId: null,
          title: graph.assessment.title,
          type: "PLACEMENT",
          levelId: null,
          config: asJson(graph.assessment.config),
          status: "PUBLISHED",
          deletedAt: null,
        },
      });

      return {
        assessmentId: graph.assessment.id,
        templateId: graph.template.id,
        templateVersionId: graph.templateVersion.id,
        contentIds: graph.contents.map((content) => content.contentId),
        questionIds: graph.questions.map((question) => question.questionId),
      };
    },
    { maxWait: 3_000, timeout: 30_000 },
  );
}
