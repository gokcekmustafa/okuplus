import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { parseEnv } from "../src/config/env.js";
import {
  buildDevelopmentComparison,
  readSkillResults,
  type MeasurementHistoryItem,
} from "../src/modules/measurements/index.js";

const env = parseEnv({
  NODE_ENV: "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
});

describe("student measurement dashboard", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("anonymous access is rejected", async () => {
    const response = await app.inject({ method: "GET", url: "/student/measurements" });
    expect(response.statusCode).toBe(401);
  });

  it("reads persisted skill evidence without inventing missing scores", () => {
    const skills = readSkillResults({
      placementScoring: {
        skillSubscores: {
          RC_MAIN_IDEA: { score: 0.8, scoredCount: 12 },
          RC_DETAIL: { score: null, scoredCount: 0 },
        },
      },
    });

    expect(skills).toEqual([
      {
        skillCode: "RC_MAIN_IDEA",
        label: "Ana fikir",
        score: 0.8,
        scoredCount: 12,
      },
      {
        skillCode: "RC_DETAIL",
        label: "Ayrıntıyı bulma",
        score: null,
        scoredCount: 0,
      },
    ]);
  });

  it("compares only repeated development measurements", () => {
    const first: MeasurementHistoryItem = {
      id: "first",
      assessmentId: "assessment-a",
      title: "İlk gelişim ölçümü",
      type: "BENCHMARK",
      source: "DEVELOPMENT_MEASUREMENT",
      score: 0.4,
      completedAt: new Date("2026-09-01T10:00:00Z"),
      level: null,
      skillResults: [],
    };
    const latest: MeasurementHistoryItem = {
      ...first,
      id: "latest",
      title: "Son gelişim ölçümü",
      score: 0.65,
      completedAt: new Date("2026-09-15T10:00:00Z"),
    };

    expect(buildDevelopmentComparison([latest, first])).toMatchObject({
      available: true,
      measurementCount: 2,
      scoreChange: 0.25,
      from: { title: "İlk gelişim ölçümü", score: 0.4 },
      to: { title: "Son gelişim ölçümü", score: 0.65 },
    });
    expect(buildDevelopmentComparison([first]).available).toBe(false);
  });
});
