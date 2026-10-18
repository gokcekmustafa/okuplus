import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import {
  draftQuestionEntityId,
  draftQuestionSourceFingerprint,
  draftQuestionSourceVersionId,
  prismaDraftQuestionRevisionStore,
  type DraftQuestionFields,
  type DraftQuestionIdentity,
} from "../src/modules/curriculum-drafts/question-revisions.js";
import { withTenantContext } from "../src/modules/tenant/index.js";

describe.skipIf(!process.env.DATABASE_URL)("curriculum draft revision PostgreSQL store", () => {
  const actorId = randomUUID();
  const context = { userId: actorId, tenantId: null, platformRole: "SUPER_ADMIN" as const };
  let actorCreated = false;
  const identity: DraftQuestionIdentity = {
    routeFamily: "A",
    sequence: 999,
    stationKey: `revision-test-${randomUUID()}`,
    questionKey: "question-1",
  };
  const sourceFields: DraftQuestionFields = {
    prompt: "Kaynak soru metni",
    options: [
      { id: "a", text: "Seçenek A" },
      { id: "b", text: "Seçenek B" },
      { id: "c", text: "Seçenek C" },
      { id: "d", text: "Seçenek D" },
    ],
    correctOptionId: "b",
    hint: null,
    explanation: "Kaynak açıklama",
    sourceReference: "Kaynak kaydı",
  };

  beforeAll(async () => {
    await prisma.$connect();
    await withTenantContext(context, async (tx) => {
      await tx.user.create({
        data: {
          id: actorId,
          email: `${actorId}@curriculum-draft.test`,
          displayName: "Taslak Sürüm Test Yöneticisi",
          platformRole: "SUPER_ADMIN",
        },
      });
    });
    actorCreated = true;
  });

  afterAll(async () => {
    if (actorCreated) {
      await withTenantContext(context, async (tx) => {
        await tx.user.delete({ where: { id: actorId } });
      });
    }
    await prisma.$disconnect();
  });

  it("persists append-only revisions, reloads the latest draft, and rejects stale writes", async () => {
    const entityId = draftQuestionEntityId(identity);
    const sourceFingerprint = draftQuestionSourceFingerprint(sourceFields);
    const sourceVersionId = draftQuestionSourceVersionId(identity, sourceFields);
    const base = {
      identity,
      sourceVersionId,
      sourceFingerprint,
      sourceFields,
      actor: { userId: actorId },
    };
    expect(await prismaDraftQuestionRevisionStore.listLatest([identity], base.actor)).toEqual(
      new Map(),
    );

    const firstFields = { ...sourceFields, prompt: "İlk kaydedilen taslak" };
    const first = await prismaDraftQuestionRevisionStore.append({
      ...base,
      expectedVersionId: sourceVersionId,
      fields: firstFields,
    });
    expect(first.revision).toBe(1);

    const secondFields = { ...firstFields, prompt: "İkinci kaydedilen taslak" };
    const second = await prismaDraftQuestionRevisionStore.append({
      ...base,
      expectedVersionId: first.versionId,
      fields: secondFields,
    });
    expect(second.revision).toBe(2);
    await expect(
      prismaDraftQuestionRevisionStore.append({
        ...base,
        expectedVersionId: first.versionId,
        fields: { ...secondFields, prompt: "Eski sekmeden yazma" },
      }),
    ).rejects.toThrow("başka bir sekmede değiştirildi");

    const latest = await prismaDraftQuestionRevisionStore.listLatest([identity], base.actor);
    expect(latest.get(entityId)).toEqual(second);
    const history = await withTenantContext(context, (tx) =>
      tx.auditLog.findMany({
        where: { entityType: "CURRICULUM_DRAFT_QUESTION", entityId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { before: true, after: true },
      }),
    );
    expect(history).toHaveLength(2);
    expect(history[0]?.after).toMatchObject({ fields: firstFields, revision: 1 });
    expect(history[1]?.before).toEqual(firstFields);
  });
});
