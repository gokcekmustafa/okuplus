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
    ).toEqual({ errorClass: "PRISMA", errorCode: "P2002", constraintField: null });
  });

  it("reports a safe foreign-key field without exposing SQL values", () => {
    expect(
      classifyCanonicalPlacementProvisionError(
        { code: "P2003", meta: { field_name: "ContentSkill_skillId_fkey" } },
        "APPLY",
      ),
    ).toEqual({
      errorClass: "PRISMA",
      errorCode: "P2003",
      constraintField: "ContentSkill_skillId_fkey",
    });
  });

  it("classifies gate and postcondition failures as validation failures", () => {
    expect(classifyCanonicalPlacementProvisionError(new Error("sensitive"), "GATE")).toEqual({
      errorClass: "VALIDATION",
      errorCode: null,
      constraintField: null,
    });
    expect(
      classifyCanonicalPlacementProvisionError(new Error("sensitive"), "POSTCONDITION"),
    ).toEqual({ errorClass: "VALIDATION", errorCode: null, constraintField: null });
  });

  it("classifies a missing canonical skill catalog as a validation failure", () => {
    expect(
      classifyCanonicalPlacementProvisionError(
        { safeCode: "CANONICAL_SKILL_CATALOG_MISSING" },
        "SKILL_RESOLUTION",
      ),
    ).toEqual({
      errorClass: "VALIDATION",
      errorCode: "CANONICAL_SKILL_CATALOG_MISSING",
      constraintField: null,
    });
  });

  it("does not claim the transaction outcome when apply fails", () => {
    expect(canonicalPlacementProvisionWriteState("APPLY", false)).toBe("UNKNOWN");
    expect(canonicalPlacementProvisionWriteState("SNAPSHOT_READ_BEFORE", false)).toBe("NO");
    expect(canonicalPlacementProvisionWriteState("POSTCONDITION", true)).toBe("YES");
  });
});
