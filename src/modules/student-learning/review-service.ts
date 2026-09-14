import { randomUUID } from "node:crypto";
import { validationError } from "../../lib/errors.js";
import { createExerciseSession } from "../sessions/service.js";
import {
  getStudentReview,
  isReviewEligible,
  priorityForReviewReason,
  reviewReasonForSignal,
  REVIEW_COOLDOWN_HOURS,
  sortReviewItems,
  type ReviewActor,
  type ReviewItem,
  type StudentReviewResponse,
} from "../training/review-candidates.js";

export {
  getStudentReview,
  isReviewEligible,
  priorityForReviewReason,
  reviewReasonForSignal,
  REVIEW_COOLDOWN_HOURS,
  sortReviewItems,
  type ReviewActor,
  type ReviewItem,
  type StudentReviewResponse,
};

export async function startStudentReview(
  actor: ReviewActor,
  input: { skillId?: string; templateVersionId?: string; clientSessionId?: string },
) {
  const queue = await getStudentReview(actor);
  const item = queue.items.find(
    (candidate) =>
      (!input.skillId || candidate.skillId === input.skillId) &&
      (!input.templateVersionId || candidate.templateVersionId === input.templateVersionId),
  );
  if (!item) throw validationError("Bu review öğesi artık uygun değil");

  const session = await createExerciseSession(
    {
      studentId: actor.userId,
      templateVersionId: item.templateVersionId,
      clientSessionId: input.clientSessionId ?? `review-${randomUUID()}`,
      context: "INDIVIDUAL",
      sessionType: "PRACTICE",
    },
    actor,
  );
  return {
    mode: "REVIEW" as const,
    sessionId: session.id,
    isNew: session.status === "IN_PROGRESS",
    item,
  } satisfies { mode: "REVIEW"; sessionId: string; isNew: boolean; item: ReviewItem };
}
