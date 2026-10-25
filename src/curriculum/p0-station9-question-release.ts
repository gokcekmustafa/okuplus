import { createHash } from "node:crypto";
import {
  EDUCATION_V2_P0_PROGRAM,
  contentVersionId as p0ContentVersionId,
  questionId as p0QuestionId,
  templateId as p0TemplateId,
} from "./education-v2-p0-program.js";
import { P0_STATION9_V3_RELEASE_DECISION } from "./p0-station9-release-decision.js";
import {
  QUESTION_BANK_VERSIONED_REVISION_CANDIDATES,
  type QuestionBankRevisionCandidate,
} from "./question-bank-versioned-revisions.js";

const EXERCISE_KEY = P0_STATION9_V3_RELEASE_DECISION.exerciseKey;
const QUESTION_KEY = P0_STATION9_V3_RELEASE_DECISION.questionKey;
const PROGRAM_ID = EDUCATION_V2_P0_PROGRAM.programId;

function requiredSingleCandidate<T>(items: readonly T[], description: string): T {
  if (items.length !== 1) throw new Error(`P0 istasyon 9 sürüm adayı tekil değil: ${description}`);
  return items[0]!;
}

function p0Candidate(): QuestionBankRevisionCandidate {
  return requiredSingleCandidate(
    QUESTION_BANK_VERSIONED_REVISION_CANDIDATES.filter(
      (candidate) => candidate.key === `${PROGRAM_ID}:question-quality-v3`,
    ),
    "candidate",
  );
}

const candidate = p0Candidate();
const changedQuestion = requiredSingleCandidate(
  candidate.changedQuestions.filter(
    (item) => item.exerciseKey === EXERCISE_KEY && item.questionKey === QUESTION_KEY,
  ),
  QUESTION_KEY,
);
const changedTemplate = requiredSingleCandidate(
  candidate.templateVersions.filter((item) => item.exerciseKey === EXERCISE_KEY),
  EXERCISE_KEY,
);

if (
  candidate.revisionVersion !== 3 ||
  changedQuestion.answerKeyChanged ||
  changedQuestion.baseQuestionVersionId !== P0_STATION9_V3_RELEASE_DECISION.baseQuestionVersionId ||
  changedQuestion.questionVersionId !== P0_STATION9_V3_RELEASE_DECISION.questionVersionId ||
  changedTemplate.baseTemplateVersionId !== P0_STATION9_V3_RELEASE_DECISION.baseTemplateVersionId ||
  changedTemplate.templateVersionId !== P0_STATION9_V3_RELEASE_DECISION.templateVersionId
) {
  throw new Error("P0 istasyon 9 v3 sürüm kimlikleri kaynak adayla eşleşmiyor");
}

export const P0_STATION9_V3_RELEASE = Object.freeze({
  key: "p0-fast-chunking-station-9-v3",
  programId: PROGRAM_ID,
  exerciseKey: EXERCISE_KEY,
  questionKey: QUESTION_KEY,
  stableStepKey: "FAST_CHUNKING_PRACTICE",
  publicationApproved: P0_STATION9_V3_RELEASE_DECISION.publicationApproved,
  approvalBasis: P0_STATION9_V3_RELEASE_DECISION.approvalBasis,
  baseQuestionVersionId: changedQuestion.baseQuestionVersionId,
  questionId: p0QuestionId(EXERCISE_KEY, QUESTION_KEY),
  questionVersionId: changedQuestion.questionVersionId,
  questionVersionNumber: 3,
  contentVersionId: p0ContentVersionId(EXERCISE_KEY),
  question: changedQuestion.question,
  templateId: p0TemplateId(EXERCISE_KEY),
  baseTemplateVersionId: changedTemplate.baseTemplateVersionId,
  templateVersionId: changedTemplate.templateVersionId,
  templateVersionNumber: 3,
  templateQuestionVersionIds: changedTemplate.questionVersionIds,
});

export type P0Station9V3Release = typeof P0_STATION9_V3_RELEASE;

export function p0Station9V3ReleaseFingerprint(): string {
  const release = P0_STATION9_V3_RELEASE;
  const payload = JSON.stringify({
    key: release.key,
    programId: release.programId,
    exerciseKey: release.exerciseKey,
    questionKey: release.questionKey,
    stableStepKey: release.stableStepKey,
    publicationApproved: release.publicationApproved,
    baseQuestionVersionId: release.baseQuestionVersionId,
    questionId: release.questionId,
    questionVersionId: release.questionVersionId,
    questionVersionNumber: release.questionVersionNumber,
    contentVersionId: release.contentVersionId,
    question: release.question,
    templateId: release.templateId,
    baseTemplateVersionId: release.baseTemplateVersionId,
    templateVersionId: release.templateVersionId,
    templateVersionNumber: release.templateVersionNumber,
    templateQuestionVersionIds: release.templateQuestionVersionIds,
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function p0Station9OwnerApprovalToken(commitSha: string): string {
  const normalizedSha = commitSha.trim().toUpperCase();
  if (!/^[A-F0-9]{40}$/u.test(normalizedSha)) {
    throw new Error("P0 istasyon 9 yayın commit'i tam SHA olmalıdır");
  }
  return `APPROVE_P0_STATION_9_V3_${p0Station9V3ReleaseFingerprint().toUpperCase()}_AT_${normalizedSha}`;
}
