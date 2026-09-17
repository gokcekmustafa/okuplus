import { describe, expect, it } from "vitest";
import { compareBaselineToCurrent } from "../src/modules/development/compare.js";
import { buildPlacementBaselineSkills } from "../src/modules/baseline/service.js";

describe("baseline development comparison", () => {
  it("keeps all six learning skills in the placement snapshot without inventing fast-reading scores", () => {
    const skills = buildPlacementBaselineSkills({
      RC_MAIN_IDEA: { score: 0.6, scoredCount: 12 },
      RC_DETAIL: { score: 0.5, scoredCount: 12 },
      RC_INFERENCE: { score: 0.4, scoredCount: 12 },
    });
    expect(skills).toHaveLength(6);
    expect(skills.find((skill) => skill.competency === "FAST_ATTENTION")).toMatchObject({
      score: null,
      scoredCount: 0,
    });
    expect(skills.find((skill) => skill.competency === "RC_MAIN_IDEA")).toMatchObject({
      score: 0.6,
      scoredCount: 12,
    });
  });

  it("compares measured baseline and current values without inventing missing scores", () => {
    const result = compareBaselineToCurrent(
      [{ competency: "RC_MAIN_IDEA", score: 0.4, scoredCount: 10 }],
      [
        {
          family: "MAIN_IDEA",
          competency: "RC_MAIN_IDEA",
          label: "Ana Fikir",
          recentAccuracy: 0.7,
          trend: "DEVELOPING",
        },
        {
          family: "INFERENCE",
          competency: "RC_INFERENCE",
          label: "Çıkarım",
          recentAccuracy: null,
          trend: null,
        },
      ],
    );

    expect(result[0]).toMatchObject({
      baselineScore: 0.4,
      currentAccuracy: 0.7,
      trend: "DEVELOPING",
    });
    expect(result[0]?.change).toBeCloseTo(0.3);
    expect(result[1]).toMatchObject({
      baselineScore: null,
      currentAccuracy: null,
      change: null,
    });
  });

  it("preserves the complete current skill presentation order", () => {
    const result = compareBaselineToCurrent(null, [
      {
        family: "ATTENTION_BURST",
        competency: "FAST_ATTENTION",
        label: "Dikkat",
        recentAccuracy: null,
        trend: null,
      },
    ]);

    expect(result).toEqual([
      {
        family: "ATTENTION_BURST",
        competency: "FAST_ATTENTION",
        label: "Dikkat",
        baselineScore: null,
        currentAccuracy: null,
        change: null,
        trend: null,
      },
    ]);
  });
});
