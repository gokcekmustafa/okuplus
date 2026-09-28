import { describe, expect, it } from "vitest";
import {
  EDUCATION_V2_APPROVED_FINGERPRINT_ENV,
  evaluateAuditStatuses,
  readAuditConfiguration,
} from "../scripts/audit-education-v2-p0-staging.js";

const validEnvironment = {
  EDUCATION_V2_P0_ENVIRONMENT: "STAGING",
  EDUCATION_V2_P0_DATABASE_URL:
    "postgresql://readonly:masked@ep-staging.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  DB_FINGERPRINT_DATABASE_URL:
    "postgresql://operator:masked@ep-staging.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  [EDUCATION_V2_APPROVED_FINGERPRINT_ENV]: "a".repeat(64),
};

describe("education V2 staging read-only audit", () => {
  it("missing staging URL is UNVERIFIED and never falls back to DATABASE_URL", () => {
    const result = readAuditConfiguration({
      ...validEnvironment,
      EDUCATION_V2_P0_DATABASE_URL: undefined,
      DATABASE_URL: "postgresql://local-test/oku_plus_test",
    });
    expect(result.status).toBe("UNVERIFIED");
    if (result.status === "UNVERIFIED") {
      expect(result.reasons).toContain("EDUCATION_V2_P0_DATABASE_URL eksik");
    }
  });

  it("accepts a staging target only when the explicit target contract is complete", () => {
    const result = readAuditConfiguration({
      ...validEnvironment,
      EDUCATION_V2_COMMON_REINFORCEMENT_TEMPLATE_VERSION_ID: "reinforcement-template-version",
      EDUCATION_V2_COMMON_ASSESSMENT_ID: "common-assessment",
    });
    expect(result.status).toBe("READY");
  });

  it("does not connect when common learning-path identifiers are missing", () => {
    const result = readAuditConfiguration(validEnvironment);
    expect(result.status).toBe("UNVERIFIED");
    if (result.status === "UNVERIFIED") {
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          "EDUCATION_V2_COMMON_REINFORCEMENT_TEMPLATE_VERSION_ID eksik",
          "EDUCATION_V2_COMMON_ASSESSMENT_ID eksik",
        ]),
      );
    }
  });

  it("rejects non-staging environment and test-like database", () => {
    const result = readAuditConfiguration({
      ...validEnvironment,
      EDUCATION_V2_P0_ENVIRONMENT: "PRODUCTION",
      EDUCATION_V2_P0_DATABASE_URL:
        "postgresql://readonly:masked@ep-test.eu-central-1.aws.neon.tech/oku_plus_test",
    });
    expect(result.status).toBe("UNVERIFIED");
  });

  it("requires an independently approved target fingerprint", () => {
    const result = readAuditConfiguration({
      ...validEnvironment,
      [EDUCATION_V2_APPROVED_FINGERPRINT_ENV]: undefined,
    });
    expect(result.status).toBe("UNVERIFIED");
    if (result.status === "UNVERIFIED") {
      expect(result.reasons).toContain(`${EDUCATION_V2_APPROVED_FINGERPRINT_ENV} eksik`);
    }
  });

  it("aggregates live audit states conservatively", () => {
    expect(evaluateAuditStatuses(["READY", "READY"])).toBe("READY");
    expect(evaluateAuditStatuses(["READY", "BLOCKED"])).toBe("BLOCKED");
    expect(evaluateAuditStatuses(["BLOCKED", "UNVERIFIED"])).toBe("UNVERIFIED");
  });

  it("contains no write-capable SQL primitive", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../scripts/audit-education-v2-p0-staging.ts", import.meta.url), "utf8"),
    );
    expect(source).not.toMatch(
      /\$executeRaw|\$queryRawUnsafe|\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/u,
    );
    expect(source).toContain("$queryRaw");
  });

  it("discovers the P0 common graph by its manifest identity and runtime contract", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("../scripts/discover-education-v2-p0-staging-records.ts", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain('templateVersionId("common-reinforcement")');
    expect(source).toContain('getProgramIds("assessment", "common-assessment")');
    expect(source).toContain('resolved.config.family === "PHRASE_CHUNKING"');
    expect(source).toContain('resolved.config.competency === "FAST_CHUNKING"');
    expect(source).toContain('resolved.config.rendererKey === "QUESTION_PHRASE_CHUNKING"');
    expect(source).not.toContain('AND et."skillId" IS NULL');
  });

  it("selects the canonical academic lesson graph and validates assessment difficulty separately", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../scripts/audit-education-v2-p0-staging.ts", import.meta.url), "utf8"),
    );
    expect(source).toContain("metadata?.contractVersion === 2");
    expect(source).toContain("lesson.stages.every");
    expect(source).toContain("expectedDifficulty");
    expect(source).toContain('getProgramExercise("common-test").contract.difficulty');
  });
});
