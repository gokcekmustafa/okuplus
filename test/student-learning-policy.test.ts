import { describe, expect, it } from "vitest";
import {
  assertStudentActor,
  isStudentLearningSession,
  STUDENT_LEARNING_SESSION_FILTER,
} from "../src/modules/student-learning/policy.js";

describe("student learning session policy", () => {
  it("counts only individual practice sessions as daily learning activity", () => {
    expect(isStudentLearningSession(STUDENT_LEARNING_SESSION_FILTER)).toBe(true);
    expect(
      isStudentLearningSession({
        ...STUDENT_LEARNING_SESSION_FILTER,
        assessmentId: "placement-result",
      }),
    ).toBe(false);
    expect(
      isStudentLearningSession({
        ...STUDENT_LEARNING_SESSION_FILTER,
        assignmentId: "assignment",
      }),
    ).toBe(false);
  });

  it("rejects platform actors from student-only endpoints", () => {
    expect(() =>
      assertStudentActor({ userId: "admin", tenantId: null, platformRole: "SUPER_ADMIN" }),
    ).toThrow("Bu uç yalnızca öğrencilere açıktır");
    expect(() =>
      assertStudentActor({ userId: "student", tenantId: "personal", platformRole: null }),
    ).not.toThrow();
  });
});
