import { describe, expect, it } from "vitest";
import {
  reorderJsonOptionsForSession,
  reorderOptionsForSession,
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
});
