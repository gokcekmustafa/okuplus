import { z } from "zod";

export const p1TeacherOverrideSchema = z.object({
  classId: z.string().trim().min(1),
  studentId: z.string().trim().min(1),
  p0LearningPathId: z.string().trim().min(1),
  learningPathId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500),
});

export const p1TransitionSchema = z.object({
  p0LearningPathId: z.string().trim().min(1),
});

export type P1TeacherOverrideRequest = z.infer<typeof p1TeacherOverrideSchema>;
