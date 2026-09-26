import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260922120000_add_guest_diagnostic_models/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const tokenLookupMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260922123000_add_guest_diagnostic_token_lookup_policy/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const claimMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260924100000_add_guest_diagnostic_claim/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

function enumBody(name: string): string {
  const match = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing enum ${name}`);
  return match[1];
}

function modelBody(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing model ${name}`);
  return match[1];
}

describe("guest diagnostic Prisma contract", () => {
  it("defines only the required guest enums", () => {
    expect(enumBody("GuestDiagnosticSessionStatus")).toContain("IN_PROGRESS");
    expect(enumBody("GuestDiagnosticSessionStatus")).toContain("COMPLETED");
    expect(enumBody("GuestDiagnosticSessionStatus")).toContain("EXPIRED");

    expect(enumBody("GuestDiagnosticResultState")).toContain("INSUFFICIENT_DATA");
    expect(enumBody("GuestDiagnosticResultState")).toContain("PARTIAL_LOW_SIGNAL");
    expect(enumBody("GuestDiagnosticResultState")).toContain("BALANCED_PERFORMANCE");
    expect(enumBody("GuestDiagnosticResultState")).toContain("DISTINCT_SKILL_SIGNAL");
    expect(enumBody("GuestDiagnosticResultState")).toContain("RECOMMENDATION_UNAVAILABLE");
    expect(enumBody("GuestDiagnosticResultState")).toContain("RECOMMENDATION_AVAILABLE");

    expect(enumBody("GuestDiagnosticConfidenceState")).toContain("INSUFFICIENT_DATA");
    expect(enumBody("GuestDiagnosticConfidenceState")).toContain("LOW_SIGNAL");
    expect(enumBody("GuestDiagnosticConfidenceState")).toContain("USABLE_SIGNAL");
    expect(enumBody("GuestDiagnosticConfidenceState")).toContain("BOUNDARY_SENSITIVE");
    expect(enumBody("GuestDiagnosticConfidenceState")).toContain("NOT_AVAILABLE");

    expect(enumBody("GuestDiagnosticRecommendationMode")).toContain("RECOMMENDATION_ONLY");
  });

  it("keeps guest sessions independent from authenticated tenant data", () => {
    const session = modelBody("GuestDiagnosticSession");
    const result = modelBody("GuestDiagnosticResult");

    for (const forbiddenField of ["tenantId", "membershipId", "studentId"]) {
      expect(session).not.toMatch(new RegExp(`\\b${forbiddenField}\\b`));
      expect(result).not.toMatch(new RegExp(`\\b${forbiddenField}\\b`));
    }
    expect(session).toMatch(/claimedUserId\s+String\?/);
    expect(session).toMatch(/claimedAt\s+DateTime\?/);
    expect(session).not.toContain("claimedUser         User");
  });

  it("preserves the required graph and immutable source references", () => {
    expect(modelBody("GuestDiagnosticSession")).toContain("items   GuestDiagnosticItem[]");
    expect(modelBody("GuestDiagnosticSession")).toContain("answers GuestDiagnosticAnswer[]");
    expect(modelBody("GuestDiagnosticSession")).toContain("result  GuestDiagnosticResult?");
    expect(modelBody("GuestDiagnosticItem")).toContain("questionVersion   QuestionVersion");
    expect(modelBody("GuestDiagnosticAnswer")).toContain("answerFingerprint String");
    expect(modelBody("GuestDiagnosticResult")).toContain("skillSubscores         Json");
    expect(modelBody("GuestDiagnosticRecommendationConfig")).toContain(
      "status                   VersionStatus @default(DRAFT)",
    );
    expect(modelBody("GuestDiagnosticRecommendationConfig")).toContain(
      "enabled                  Boolean       @default(false)",
    );
    expect(schema).toContain(
      "questionVersion   QuestionVersion        @relation(fields: [questionVersionId], references: [id], onDelete: Restrict)",
    );
  });

  it("declares the required uniqueness rules", () => {
    expect(modelBody("GuestDiagnosticSession")).toContain(
      "tokenHash               String                              @unique",
    );
    expect(modelBody("GuestDiagnosticItem")).toContain("@@unique([sessionId, position])");
    expect(modelBody("GuestDiagnosticItem")).toContain("@@unique([sessionId, questionVersionId])");
    expect(modelBody("GuestDiagnosticItem")).toContain("@@unique([id, sessionId])");
    expect(modelBody("GuestDiagnosticAnswer")).toContain("@@unique([sessionId, itemId])");
    expect(modelBody("GuestDiagnosticAnswer")).toContain("@@unique([sessionId, clientAnswerId])");
    expect(modelBody("GuestDiagnosticResult")).toContain(
      "sessionId              String                              @unique",
    );
    expect(modelBody("GuestDiagnosticRecommendationConfig")).toContain(
      "@@unique([configKey, version])",
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "GuestDiagnosticRecommendationConfig_active_key"',
    );
    expect(migration).toContain('WHERE "status" = \'PUBLISHED\' AND "enabled" = true');
  });

  it("does not persist raw client answers or client-provided scoring", () => {
    const answer = modelBody("GuestDiagnosticAnswer");
    expect(answer).not.toMatch(/rawAnswer|answerText|answerJson|answer Json/i);
    expect(answer).toMatch(/isCorrect\s+Boolean/);
    expect(answer).toMatch(/rawScore\s+Float/);
    expect(answer).toMatch(/answerFingerprint\s+String/);
  });
});

describe("guest diagnostic migration and RLS contract", () => {
  const guestTables = [
    "GuestDiagnosticRecommendationConfig",
    "GuestDiagnosticSession",
    "GuestDiagnosticItem",
    "GuestDiagnosticAnswer",
    "GuestDiagnosticResult",
  ];

  it("is additive and contains no DML or destructive table operation", () => {
    expect(migration).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/gim);
    expect(migration).not.toMatch(/^\s*DROP\s+(TABLE|TYPE|INDEX)\b/gim);
    for (const table of guestTables) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(migration.match(/"id" TEXT NOT NULL DEFAULT uuidv7\(\)/g)).toHaveLength(5);
  });

  it("enables and forces RLS on every guest table", () => {
    for (const table of guestTables) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    }
  });

  it("requires the server-side guest context and operation for guest writes", () => {
    expect(migration).toContain("current_setting('app.guest_session_id', true)");
    expect(migration).toContain("current_setting('app.guest_operation', true) = 'CREATE'");
    expect(migration).toContain("current_setting('app.guest_operation', true) = 'ANSWER'");
    expect(migration).toContain("current_setting('app.guest_operation', true) = 'COMPLETE'");
    expect(migration).toContain('"status" = \'PUBLISHED\' AND "enabled" = true');
    expect(migration).not.toMatch(/guest_diagnostic_[^\n]+app\.platform_role/i);
  });

  it("supports server-side token lookup without opening an unauthenticated session read", () => {
    expect(tokenLookupMigration).toContain("app.guest_token_hash");
    expect(tokenLookupMigration).toContain("app.guest_operation");
    expect(tokenLookupMigration).toContain("= 'LOOKUP'");
    expect(tokenLookupMigration).toContain('"tokenHash" = NULLIF');
    expect(tokenLookupMigration).not.toMatch(/app\.platform_role/i);
  });

  it("keeps QuestionVersion and template references restrictive", () => {
    expect(migration).toContain('CONSTRAINT "GuestDiagnosticItem_questionVersionId_fkey"');
    expect(migration).toMatch(/REFERENCES "QuestionVersion"\("id"\)\s+ON DELETE RESTRICT/);
    expect(migration).toContain('CONSTRAINT "GuestDiagnosticSession_sourceTemplateVersionId_fkey"');
    expect(migration).toMatch(/REFERENCES "ExerciseTemplateVersion"\("id"\)\s+ON DELETE RESTRICT/);
  });

  it("keeps result claims server-controlled and tenant-independent", () => {
    expect(claimMigration).toContain('ADD COLUMN "claimedUserId" TEXT');
    expect(claimMigration).toContain('ADD COLUMN "claimedAt" TIMESTAMP(3)');
    expect(claimMigration).toContain("'CLAIM'");
    expect(claimMigration).toContain("current_setting('app.guest_operation', true) = 'USER_READ'");
    expect(claimMigration).toContain("current_setting('app.guest_user_id', true)");
    expect(claimMigration).not.toContain('REFERENCES "User"');
    expect(claimMigration).not.toContain('REFERENCES "Tenant"');
  });
});
