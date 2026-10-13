import { describe, expect, it } from "vitest";
import {
  reorderJsonOptionsForSession,
  reorderOptionsForSession,
  shouldReorderStudentOptions,
} from "../src/modules/questions/session-option-order.js";

const options = [
  { id: "a", text: "Birinci" },
  { id: "b", text: "İkinci" },
  { id: "c", text: "Üçüncü" },
  { id: "d", text: "Dördüncü" },
];

describe("session option order", () => {
  it("keeps option ids and order stable for the same session", () => {
    const first = reorderOptionsForSession(options, "session-1:question-1");
    const second = reorderOptionsForSession(options, "session-1:question-1");

    expect(second).toEqual(first);
    expect(first.map((option) => option.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(first).not.toBe(options);
  });

  it("uses the session key to vary the displayed position across sessions", () => {
    const positions = new Set(
      Array.from({ length: 12 }, (_, index) =>
        reorderOptionsForSession(options, `session-${index}:question-1`).findIndex(
          (option) => option.id === "a",
        ),
      ),
    );

    expect(positions.size).toBeGreaterThan(1);
  });

  it("does not reorder malformed or non-option JSON", () => {
    const malformed = [{ text: "Kimliksiz seçenek" }];
    const scalar = "not-an-option-list";

    expect(reorderJsonOptionsForSession(malformed, "session-1")).toEqual(malformed);
    expect(reorderJsonOptionsForSession(scalar, "session-1")).toBe(scalar);
  });

  it("reorders every student-visible session context but never teacher/admin views", () => {
    for (const context of ["INDIVIDUAL", "ASSIGNMENT", "ASSESSMENT"] as const) {
      expect(shouldReorderStudentOptions(null, context, "MULTIPLE_CHOICE")).toBe(true);
    }
    expect(shouldReorderStudentOptions("TEACHER", "ASSIGNMENT", "MULTIPLE_CHOICE")).toBe(false);
    expect(shouldReorderStudentOptions("SUPER_ADMIN", "ASSESSMENT", "MULTIPLE_CHOICE")).toBe(false);
    expect(shouldReorderStudentOptions(null, "INDIVIDUAL", "TRUE_FALSE")).toBe(false);
  });
});
