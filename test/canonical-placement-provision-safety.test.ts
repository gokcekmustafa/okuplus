import { describe, expect, it } from "vitest";
import {
  canonicalPlacementProvisionWriteState,
  classifyCanonicalPlacementProvisionError,
} from "../src/curriculum/canonical-placement-provision-safety.js";

describe("canonical placement provision safety reporting", () => {
  it("reports a Prisma code without exposing exception details", () => {
    expect(
      classifyCanonicalPlacementProvisionError(
        { code: "P2002", meta: { target: "sensitive" } },
        "APPLY",
      ),
    ).toEqual({ errorClass: "PRISMA", errorCode: "P2002" });
  });

  it("classifies gate and postcondition failures as validation failures", () => {
    expect(classifyCanonicalPlacementProvisionError(new Error("sensitive"), "GATE")).toEqual({
      errorClass: "VALIDATION",
      errorCode: null,
    });
    expect(
      classifyCanonicalPlacementProvisionError(new Error("sensitive"), "POSTCONDITION"),
    ).toEqual({ errorClass: "VALIDATION", errorCode: null });
  });

  it("does not claim the transaction outcome when apply fails", () => {
    expect(canonicalPlacementProvisionWriteState("APPLY", false)).toBe("UNKNOWN");
    expect(canonicalPlacementProvisionWriteState("SNAPSHOT_READ_BEFORE", false)).toBe("NO");
    expect(canonicalPlacementProvisionWriteState("POSTCONDITION", true)).toBe("YES");
  });
});
