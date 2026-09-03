import { z } from "zod";

export const pilotEventSchema = z
  .object({
    eventType: z.enum([
      "SIGNUP_COMPLETED",
      "ONBOARDING_STARTED",
      "ONBOARDING_COMPLETED",
      "LEARNING_PATH_OPENED",
      "TODAY_OPENED",
      "EXERCISE_STARTED",
      "QUESTION_VIEWED",
      "QUESTION_ATTEMPTED",
      "QUESTION_ANSWERED",
      "EXERCISE_COMPLETED",
      "EXERCISE_ABANDONED",
      "EXERCISE_RESUMED",
      "ASSESSMENT_STARTED",
      "ASSESSMENT_COMPLETED",
      "REVIEW_STARTED",
      "REVIEW_COMPLETED",
      "STREAK_STARTED",
      "STREAK_CONTINUED",
      "TECHNICAL_ERROR",
      "PREMIUM_INFO_VIEWED",
      "PREMIUM_CTA_CLICKED",
      "LIMIT_REACHED",
      "PAYWALL_VIEWED",
      "PREMIUM_CHECKOUT_STARTED",
      "PREMIUM_CHECKOUT_COMPLETED",
      "PREMIUM_CHECKOUT_FAILED",
      "SUBSCRIPTION_CANCELED",
    ]),
    clientEventId: z.string().trim().min(1).max(128),
    sessionId: z.string().trim().min(1).max(100).optional(),
    questionVersionId: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const pilotFeedbackSchema = z
  .object({
    clientFeedbackId: z.string().trim().min(1).max(128),
    category: z.enum(["CONTENT_CLARITY", "QUESTION_CLARITY", "DIFFICULTY", "GENERAL_SATISFACTION"]),
    rating: z.number().int().min(1).max(5).optional(),
    message: z.string().trim().max(1000).optional(),
    sessionId: z.string().trim().min(1).max(100).optional(),
    questionVersionId: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const pilotBugReportSchema = z
  .object({
    clientBugId: z.string().trim().min(1).max(128),
    category: z.enum([
      "BUG",
      "CONTENT_ISSUE",
      "WRONG_ANSWER",
      "UNCLEAR_QUESTION",
      "TECHNICAL_ERROR",
    ]),
    description: z.string().trim().min(1).max(2000),
    sessionId: z.string().trim().min(1).max(100).optional(),
    questionVersionId: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type PilotEventInput = z.infer<typeof pilotEventSchema>;
export type PilotFeedbackInput = z.infer<typeof pilotFeedbackSchema>;
export type PilotBugReportInput = z.infer<typeof pilotBugReportSchema>;
