import { describe, expect, it } from "vitest";
import {
  evaluateCanonicalPlacementMigrationPolicy,
  type CanonicalPlacementMigrationPolicyInput,
} from "../src/lib/canonical-placement-migration-policy.js";

const target = "20260907170000_add_gp_achievement_metadata";
const init = "20260817000000_init";

const validSchema = {
  columns: [
    { table_name: "Badge", column_name: "category" },
    { table_name: "Badge", column_name: "kind" },
    { table_name: "Badge", column_name: "targetValue" },
  ],
  indexes: [{ indexname: "Badge_category_status_displayOrder_idx" }],
  enums: [
    ...["TRAINING", "READING", "COMPREHENSION", "CONSISTENCY", "MILESTONE"].map((enum_value) => ({
      type_name: "AchievementCategory",
      enum_value,
    })),
    ...["BADGE", "TROPHY"].map((enum_value) => ({ type_name: "AchievementKind", enum_value })),
    { type_name: "PointEventType", enum_value: "TRAINING_SESSION_COMPLETED" },
  ],
};

const appliedTarget = {
  migrationName: target,
  state: "APPLIED" as const,
  appliedStepsCount: 1,
  finishedAt: "2026-09-24T15:00:00.000Z",
  rolledBackAt: null,
};

const historicalRollback = {
  migrationName: target,
  state: "ROLLED_BACK" as const,
  appliedStepsCount: 0,
  finishedAt: null,
  rolledBackAt: "2026-09-24T14:58:55.491Z",
};

const baseInput: CanonicalPlacementMigrationPolicyInput = {
  targetIdentityMatch: true,
  migrationHistory: [appliedTarget, historicalRollback],
  pendingMigrations: [],
  repositoryOnlyMigrations: [],
  productionOnlyMigrations: [],
  checksumMismatches: [],
  historicalChecksumAcknowledgements: [],
  unresolvedChecksumMismatches: [],
  schemaDrift: false,
  partialSchemaState: "NO",
  partialDataState: "NO",
  initSchemaCompatibility: "PASS",
  schemaSummary: validSchema,
};

function evaluate(overrides: Partial<CanonicalPlacementMigrationPolicyInput> = {}) {
  return evaluateCanonicalPlacementMigrationPolicy({ ...baseInput, ...overrides });
}

describe("canonical placement migration history policy", () => {
  it("accepts an empty pending list with a fully applied migration history", () => {
    const result = evaluate({
      migrationHistory: [appliedTarget],
    });

    expect(result.allowed).toBe(true);
  });

  it("accepts only the explicit historical rollback shape for the target migration", () => {
    const result = evaluate();

    expect(result.allowed).toBe(true);
    expect(result.targetApplied).toBe(true);
    expect(result.targetHistoricalRollback).toBe(true);
  });

  it("rejects a missing applied target record", () => {
    const result = evaluate({ migrationHistory: [historicalRollback] });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("TARGET_APPLIED_RECORD_MISSING_OR_DUPLICATED");
  });

  it("rejects a target rollback with applied steps", () => {
    const result = evaluate({
      migrationHistory: [appliedTarget, { ...historicalRollback, appliedStepsCount: 1 }],
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("TARGET_ROLLBACK_RECORD_NOT_HISTORICAL_SAFE_FORM");
  });

  it("rejects any other failed, incomplete, or rolled-back migration", () => {
    const result = evaluate({
      migrationHistory: [
        ...baseInput.migrationHistory,
        {
          migrationName: "20260908110000_add_content_question_lifecycle",
          state: "FAILED_OR_INCOMPLETE",
          appliedStepsCount: 0,
          finishedAt: null,
          rolledBackAt: null,
        },
      ],
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("UNEXPECTED_FAILED_OR_ROLLED_BACK_MIGRATION");
  });

  it("rejects pending, repository-only, and production-only migrations", () => {
    const result = evaluate({
      pendingMigrations: ["20261008100000_add_adaptive_learning_path_routing"],
      repositoryOnlyMigrations: ["20261008100000_add_adaptive_learning_path_routing"],
      productionOnlyMigrations: ["legacy_migration"],
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "PENDING_MIGRATIONS_REMAIN",
        "REPOSITORY_ONLY_MIGRATION",
        "PRODUCTION_ONLY_MIGRATION",
      ]),
    );
  });

  it("rejects missing or non-canonical achievement schema objects", () => {
    const result = evaluate({
      schemaSummary: {
        ...validSchema,
        columns: validSchema.columns.slice(0, 2),
        indexes: [],
        enums: validSchema.enums.filter(({ type_name }) => type_name !== "AchievementKind"),
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "MISSING_SCHEMA_COLUMN:Badge.targetValue",
        "ACHIEVEMENT_KIND_ENUM_NOT_CANONICAL",
        "MISSING_BADGE_METADATA_INDEX",
      ]),
    );
  });

  it("accepts only an init-only historical checksum acknowledgement", () => {
    expect(
      evaluate({
        checksumMismatches: [init],
        historicalChecksumAcknowledgements: [{ migrationName: init }],
      }).allowed,
    ).toBe(true);

    const missingAck = evaluate({ checksumMismatches: [init] });
    expect(missingAck.reasons).toContain("INIT_CHECKSUM_MISMATCH_NOT_ACKNOWLEDGED");

    const unexpected = evaluate({ checksumMismatches: ["other_migration"] });
    expect(unexpected.reasons).toContain("UNEXPECTED_CHECKSUM_MISMATCH");
  });

  it("rejects target identity, schema conflict, partial state, and unresolved checksum failures", () => {
    const result = evaluate({
      targetIdentityMatch: false,
      schemaDrift: true,
      partialSchemaState: "YES",
      partialDataState: "YES",
      unresolvedChecksumMismatches: ["other_migration"],
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "TARGET_IDENTITY_MISMATCH",
        "SCHEMA_DRIFT",
        "PARTIAL_SCHEMA_STATE",
        "PARTIAL_DATA_STATE",
        "UNRESOLVED_CHECKSUM_MISMATCH",
      ]),
    );
  });
});
