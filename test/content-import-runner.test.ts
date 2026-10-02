import { describe, expect, it } from "vitest";
import type { ContentImportManifest } from "../src/modules/content-import/manifest-schema.js";
import type {
  ContentImportActor,
  ContentImportPlan,
  ExistingContentImportIndex,
} from "../src/modules/content-import/types.js";
import { buildContentImportPlan } from "../src/modules/content-import/index.js";
import { runContentImport } from "../src/modules/content-import/runner.js";
import type {
  ContentImportAuditInput,
  ContentImportRepository,
  ContentImportTransaction,
} from "../src/modules/content-import/repository.js";

function manifest(): ContentImportManifest {
  return {
    manifestVersion: 1,
    manifestId: "OKU-IMPORT-RUNNER-V1",
    target: { scope: "GLOBAL", tenantId: null, allowGlobal: true },
    content: {
      externalKey: "runner-passage",
      title: "Küçük Bir Keşif",
      contentType: "PASSAGE",
      competency: "RC_MAIN_IDEA",
      difficulty: 0.45,
      passage: "Bir grup öğrenci, okul bahçesindeki küçük gölgeliği birlikte düzenledi.",
    },
    questions: [
      {
        externalKey: "runner-question-1",
        type: "MULTIPLE_CHOICE",
        stem: "Bu pasajın ana düşüncesi nedir?",
        options: [
          { key: "A", text: "Öğrenciler ortak bir alanı iyileştirdi." },
          { key: "B", text: "Bahçe tamamen kapatıldı." },
          { key: "C", text: "Öğrenciler geziye çıktı." },
          { key: "D", text: "Gölgelik kaldırıldı." },
        ],
        correctAnswer: "A",
        explanation: "Pasaj, öğrencilerin gölgeliği birlikte düzenlediğini anlatıyor.",
        competency: "RC_MAIN_IDEA",
        difficulty: 0.45,
      },
      {
        externalKey: "runner-question-2",
        type: "TRUE_FALSE",
        stem: "Öğrenciler gölgeliği birlikte düzenlemiştir.",
        options: [
          { key: "T", text: "Doğru" },
          { key: "F", text: "Yanlış" },
        ],
        correctAnswer: true,
        competency: "RC_MAIN_IDEA",
        difficulty: 0.35,
      },
    ],
  };
}

const actor: ContentImportActor = {
  userId: "actor-1",
  tenantId: null,
  platformRole: "SUPER_ADMIN",
  allowGlobal: true,
};

class MockTransaction implements ContentImportTransaction {
  readonly audits: ContentImportAuditInput[] = [];
  readonly created: string[] = [];
  readonly events: string[] = [];
  readonly lockKeys: string[] = [];
  lockFailure: Error | null = null;
  failQuestionVersion = false;
  existing: ExistingContentImportIndex = { contents: [], questions: [] };

  async lockImportScope(stableKey: string): Promise<void> {
    this.events.push(`LOCK:${stableKey}`);
    if (this.lockFailure) throw this.lockFailure;
    this.lockKeys.push(stableKey);
  }

  async loadExistingImportIndex(): Promise<ExistingContentImportIndex> {
    return this.existing;
  }

  async assertDependencies(): Promise<void> {}

  async createContent(): Promise<{ id: string }> {
    this.created.push("CONTENT");
    this.events.push("CONTENT");
    return { id: "content-1" };
  }

  async createContentVersion(): Promise<{ id: string }> {
    this.created.push("CONTENT_VERSION");
    this.events.push("CONTENT_VERSION");
    return { id: "content-version-1" };
  }

  async createQuestion(input: { question: { externalKey: string } }): Promise<{ id: string }> {
    this.created.push(`QUESTION:${input.question.externalKey}`);
    this.events.push(`QUESTION:${input.question.externalKey}`);
    return { id: `question-${this.created.length}` };
  }

  async createQuestionVersion(input: {
    question: { externalKey: string };
  }): Promise<{ id: string }> {
    if (this.failQuestionVersion && input.question.externalKey === "runner-question-2") {
      throw new Error("simulated question version failure");
    }
    this.created.push(`QUESTION_VERSION:${input.question.externalKey}`);
    this.events.push(`QUESTION_VERSION:${input.question.externalKey}`);
    return { id: `question-version-${this.created.length}` };
  }

  async ensureQuestionVersionContentLink(): Promise<void> {}

  async writeAudit(input: ContentImportAuditInput): Promise<void> {
    this.audits.push(input);
  }
}

class MockRepository implements ContentImportRepository {
  readonly tx = new MockTransaction();
  committed = false;
  rolledBack = false;

  async runInTransaction<T>(
    _actor: ContentImportActor,
    callback: (tx: ContentImportTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      const result = await callback(this.tx);
      this.committed = true;
      return result;
    } catch (error) {
      this.rolledBack = true;
      throw error;
    }
  }
}

function existingForPlan(
  input: ContentImportManifest,
  plan: ContentImportPlan,
  changed = false,
): ExistingContentImportIndex {
  const contentVersion = plan.operations.find((entry) => entry.entityType === "CONTENT_VERSION")!;
  return {
    contents: [
      {
        id: "content-existing",
        externalKey: input.content.externalKey,
        stableIdentity: `${input.manifestId}:CONTENT:${input.content.externalKey}`,
        normalizedPassage: "farklı pasaj",
        currentVersion: {
          id: "content-version-existing",
          version: 1,
          status: "PUBLISHED",
          fingerprint: changed ? "old-content-fingerprint" : contentVersion.payloadFingerprint!,
        },
      },
    ],
    questions: input.questions.map((question, index) => {
      const questionVersion = plan.operations.find(
        (entry) =>
          entry.entityType === "QUESTION_VERSION" && entry.externalKey === question.externalKey,
      )!;
      return {
        id: `question-existing-${index}`,
        externalKey: question.externalKey,
        stableIdentity: `${input.manifestId}:QUESTION:${question.externalKey}`,
        normalizedStem: "farklı soru",
        currentVersion: {
          id: `question-version-existing-${index}`,
          version: 1,
          status: "PUBLISHED",
          fingerprint: changed
            ? `old-question-fingerprint-${index}`
            : questionVersion.payloadFingerprint!,
          contentExternalKey: input.content.externalKey,
          contentVersion: 1,
        },
      };
    }),
  };
}

describe("content import runner", () => {
  it("imports a multi-question plan atomically and writes metadata-only audit entries", async () => {
    const repository = new MockRepository();
    const result = await runContentImport(manifest(), actor, { repository });

    expect(result.status).toBe("IMPORTED");
    expect(result.createdCount).toBe(6);
    expect(result.reusedCount).toBe(0);
    expect(result.auditCount).toBe(6);
    expect(result.planFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.committed).toBe(true);
    expect(repository.tx.audits.every((audit) => audit.entityType !== "RELATION")).toBe(true);
  });

  it("acquires the deterministic scope lock before any mutation", async () => {
    const repository = new MockRepository();
    const result = await runContentImport(manifest(), actor, { repository });

    expect(result.status).toBe("IMPORTED");
    expect(repository.tx.lockKeys).toEqual(["content-import:GLOBAL:global"]);
    expect(repository.tx.events.indexOf("LOCK:content-import:GLOBAL:global")).toBeLessThan(
      repository.tx.events.indexOf("CONTENT"),
    );
  });

  it("propagates lock failures and rolls back before mutations", async () => {
    const repository = new MockRepository();
    repository.tx.lockFailure = new Error("simulated advisory lock failure");

    const result = await runContentImport(manifest(), actor, { repository });

    expect(result.status).toBe("FAILED");
    expect(result.errors[0]?.code).toBe("IMPORT_TRANSACTION_FAILED");
    expect(repository.rolledBack).toBe(true);
    expect(repository.committed).toBe(false);
    expect(repository.tx.created).toEqual([]);
    expect(repository.tx.events).toEqual(["LOCK:content-import:GLOBAL:global"]);
  });

  it("uses the same lock key for the same scope and different keys for different scopes", async () => {
    const sameScopeFirst = new MockRepository();
    const sameScopeSecond = new MockRepository();
    await runContentImport(manifest(), actor, { repository: sameScopeFirst });
    await runContentImport(manifest(), actor, { repository: sameScopeSecond });

    const tenantManifest = (tenantId: string): ContentImportManifest => ({
      ...manifest(),
      manifestId: `OKU-IMPORT-RUNNER-${tenantId.toUpperCase()}`,
      target: { scope: "TENANT", tenantId, allowGlobal: false },
    });
    const tenantActor = (tenantId: string): ContentImportActor => ({
      userId: "actor-1",
      tenantId,
      platformRole: "CONTENT_EDITOR",
      allowGlobal: false,
    });
    const tenantFirst = new MockRepository();
    const tenantSecond = new MockRepository();
    await runContentImport(tenantManifest("tenant-a"), tenantActor("tenant-a"), {
      repository: tenantFirst,
    });
    await runContentImport(tenantManifest("tenant-b"), tenantActor("tenant-b"), {
      repository: tenantSecond,
    });

    expect(sameScopeFirst.tx.lockKeys[0]).toBe("content-import:GLOBAL:global");
    expect(sameScopeSecond.tx.lockKeys[0]).toBe("content-import:GLOBAL:global");
    expect(tenantFirst.tx.lockKeys[0]).toBe("content-import:TENANT:tenant-a");
    expect(tenantSecond.tx.lockKeys[0]).toBe("content-import:TENANT:tenant-b");
    expect(tenantFirst.tx.lockKeys[0]).not.toBe(tenantSecond.tx.lockKeys[0]);
  });

  it("performs no mutations in dry-run mode", async () => {
    const repository = new MockRepository();
    const result = await runContentImport(manifest(), actor, { repository, dryRun: true });

    expect(result.status).toBe("DRY_RUN");
    expect(result.dryRun).toBe(true);
    expect(result.createdCount).toBe(0);
    expect(result.auditCount).toBe(0);
    expect(repository.tx.created).toEqual([]);
    expect(repository.tx.audits).toEqual([]);
    expect(repository.committed).toBe(true);
  });

  it("rolls back the transaction when a later question fails", async () => {
    const repository = new MockRepository();
    repository.tx.failQuestionVersion = true;
    const result = await runContentImport(manifest(), actor, { repository });

    expect(result.status).toBe("FAILED");
    expect(result.errors[0]?.code).toBe("IMPORT_TRANSACTION_FAILED");
    expect(repository.rolledBack).toBe(true);
    expect(repository.committed).toBe(false);
    expect(repository.tx.lockKeys).toEqual(["content-import:GLOBAL:global"]);
    expect(repository.tx.events.indexOf("LOCK:content-import:GLOBAL:global")).toBeLessThan(
      repository.tx.events.indexOf("CONTENT"),
    );
  });

  it("reuses exact identities without creating duplicate rows", async () => {
    const input = manifest();
    const firstPlan = buildContentImportPlan(input);
    const repository = new MockRepository();
    repository.tx.existing = existingForPlan(input, firstPlan);
    const result = await runContentImport(input, actor, { repository });

    expect(result.status).toBe("NOOP");
    expect(result.reusedCount).toBe(6);
    expect(repository.tx.created).toEqual([]);
    expect(repository.tx.audits).toEqual([]);
  });

  it("returns NOOP on the second run of the same manifest", async () => {
    const input = manifest();
    const first = await runContentImport(input, actor, { repository: new MockRepository() });
    expect(first.status).toBe("IMPORTED");

    const firstPlan = buildContentImportPlan(input);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const repository = new MockRepository();
      repository.tx.existing = existingForPlan(input, firstPlan);
      const repeated = await runContentImport(input, actor, { repository });

      expect(repeated.status).toBe("NOOP");
      expect(repeated.reusedCount).toBe(6);
      expect(repository.tx.created).toEqual([]);
    }
  });

  it("creates new draft versions instead of overwriting published versions", async () => {
    const input = manifest();
    const firstPlan = buildContentImportPlan(input);
    const repository = new MockRepository();
    repository.tx.existing = existingForPlan(input, firstPlan, true);
    const result = await runContentImport(input, actor, { repository });

    expect(result.status).toBe("IMPORTED");
    expect(result.createdCount).toBe(3);
    expect(result.newVersionCount).toBe(3);
    expect(result.reusedCount).toBe(3);
    expect(result.errors).toEqual([]);
  });

  it("rejects a global import without explicit platform authorization", async () => {
    const repository = new MockRepository();
    const result = await runContentImport(
      manifest(),
      { ...actor, platformRole: "CONTENT_EDITOR", allowGlobal: false },
      { repository },
    );

    expect(result.status).toBe("REJECTED");
    expect(result.errors[0]?.code).toBe("GLOBAL_IMPORT_FORBIDDEN");
    expect(repository.tx.created).toEqual([]);
  });

  it("rejects changed content when the existing version is still a draft", async () => {
    const input = manifest();
    const firstPlan = buildContentImportPlan(input);
    const repository = new MockRepository();
    repository.tx.existing = existingForPlan(input, firstPlan, true);
    repository.tx.existing.contents![0]!.currentVersion!.status = "DRAFT";

    const result = await runContentImport(input, actor, { repository });

    expect(result.status).toBe("REJECTED");
    expect(result.errors[0]?.code).toBe("CONTENT_CONFLICT");
    expect(repository.tx.created).toEqual([]);
  });
});
