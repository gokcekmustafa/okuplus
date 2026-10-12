import { describe, expect, it } from "vitest";
import { auditCanonicalEducationV2LearningCycleReadiness } from "../src/curriculum/learning-cycle-readiness.js";
import {
  buildEducationV2P1ALearningCycleManifest,
  validateLearningCycleManifest,
} from "../src/curriculum/learning-cycle-manifest.js";

describe("learning cycle publication readiness", () => {
  it("kaynak müfredatları mevcut QA doğrulayıcılarıyla birlikte denetler", () => {
    const report = auditCanonicalEducationV2LearningCycleReadiness();

    expect(report.status).toBe("NOT_VERIFIED");
    expect(report.cycles.map((cycle) => cycle.stepCount)).toEqual([22, 9, 5, 5, 5]);
    expect(report.cycles.every((cycle) => cycle.sourceValidation === "PASS")).toBe(true);
    expect(report.cycles.every((cycle) => cycle.publishedGraph === "NOT_VERIFIED")).toBe(true);
    expect(report.automaticAssignment.p1BCD).toBe("CLOSED_UNTIL_CALIBRATED");
  });

  it("kaynak graph bozuksa production hazırmış gibi raporlamaz", () => {
    const broken = buildEducationV2P1ALearningCycleManifest();
    broken.steps = broken.steps.map((step, index) =>
      index === 0 ? { ...step, content: undefined, exercise: undefined } : step,
    );
    const validation = validateLearningCycleManifest(broken);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.code === "MISSING_REFERENCE")).toBe(true);
    const report = auditCanonicalEducationV2LearningCycleReadiness();
    expect(report.productionVerification.status).toBe("NOT_VERIFIED");
  });
});
