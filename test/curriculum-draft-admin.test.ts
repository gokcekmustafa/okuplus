import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AuthProvider,
  AuthenticatedUser,
  VerifiedSession,
} from "../src/modules/auth/index.js";
import { curriculumDraftAdminRoutes } from "../src/modules/curriculum-drafts/admin-routes.js";
import { EDUCATION_V2_P1_800_DRAFT_CYCLES } from "../src/curriculum/education-v2-p1-800-draft-cycles.js";
import {
  draftQuestionEntityId,
  type DraftQuestionFields,
  type DraftQuestionIdentity,
  type DraftQuestionRevision,
  type DraftQuestionRevisionStore,
} from "../src/modules/curriculum-drafts/question-revisions.js";
import { conflictError } from "../src/lib/errors.js";

class MemoryDraftQuestionRevisionStore implements DraftQuestionRevisionStore {
  readonly revisions = new Map<string, DraftQuestionRevision>();
  readonly history = new Map<string, DraftQuestionRevision[]>();

  async listLatest(identities: DraftQuestionIdentity[]) {
    return new Map(
      identities.flatMap((identity) => {
        const key = draftQuestionEntityId(identity);
        const revision = this.revisions.get(key);
        return revision ? [[key, revision] as const] : [];
      }),
    );
  }

  async append(input: {
    identity: DraftQuestionIdentity;
    expectedVersionId: string;
    sourceVersionId: string;
    sourceFingerprint: string;
    sourceFields: DraftQuestionFields;
    fields: DraftQuestionFields;
  }) {
    const key = draftQuestionEntityId(input.identity);
    const current = this.revisions.get(key);
    if ((current?.versionId ?? input.sourceVersionId) !== input.expectedVersionId) {
      throw conflictError("Taslak başka bir sekmede değiştirildi. Güncel sürümü yeniden yükleyin.");
    }
    const revision: DraftQuestionRevision = {
      fields: input.fields,
      versionId: `edit:${(current?.revision ?? 0) + 1}`,
      revision: (current?.revision ?? 0) + 1,
      sourceFingerprint: input.sourceFingerprint,
    };
    this.revisions.set(key, revision);
    this.history.set(key, [...(this.history.get(key) ?? []), revision]);
    return revision;
  }
}

describe("protected curriculum draft preview and question editing", () => {
  let app: FastifyInstance;
  let revisionStore: MemoryDraftQuestionRevisionStore;

  beforeEach(async () => {
    const users: Record<string, AuthenticatedUser> = {
      super: {
        id: "super-admin",
        email: "super@example.test",
        displayName: "Super Admin",
        platformRole: "SUPER_ADMIN",
      },
      editor: {
        id: "content-editor",
        email: "editor@example.test",
        displayName: "İçerik Editörü",
        platformRole: "CONTENT_EDITOR",
      },
      student: {
        id: "student",
        email: "student@example.test",
        displayName: "Öğrenci",
        platformRole: null,
      },
    };
    const authProvider = {
      verifyAccessToken: async (token: string): Promise<VerifiedSession> => {
        const user = users[token];
        if (!user) throw new Error("Geçersiz test erişim anahtarı");
        return {
          user,
          tenantContext: {
            tenantId: null,
            tenantType: null,
            tenantName: null,
            role: null,
            platformRole: user.platformRole,
          },
        } as VerifiedSession;
      },
    } as AuthProvider;
    app = Fastify({ logger: false });
    revisionStore = new MemoryDraftQuestionRevisionStore();
    await app.register(curriculumDraftAdminRoutes, {
      authProvider,
      questionRevisionStore: revisionStore,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires a SUPER_ADMIN and returns no-store responses", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/admin/curriculum-drafts" });
    expect(anonymous.statusCode).toBe(401);

    for (const token of ["student", "editor"]) {
      const denied = await app.inject({
        method: "GET",
        url: "/admin/curriculum-drafts",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(denied.statusCode).toBe(403);
    }

    const allowed = await app.inject({
      method: "GET",
      url: "/admin/curriculum-drafts",
      headers: { authorization: "Bearer super" },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers["cache-control"]).toContain("no-store");
    expect(allowed.headers.vary).toContain("Authorization");
  });

  it("lists searchable draft metadata without returning question answer keys", async () => {
    const cycle = EDUCATION_V2_P1_800_DRAFT_CYCLES[0]!;
    const station = cycle.sourceStations[0]!;
    const response = await app.inject({
      method: "GET",
      url: `/admin/curriculum-drafts?routeFamily=${cycle.routeFamily}&sequence=${cycle.sequence}&search=${encodeURIComponent(station.title)}`,
      headers: { authorization: "Bearer super" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.cycles).toHaveLength(1);
    expect(body.cycles[0].stations).toHaveLength(1);
    expect(body.cycles[0].stations[0].title).toBe(station.title);
    expect(body.cycles[0].stations[0].provenanceStatus).toBe(station.provenanceStatus);
    expect(body.cycles[0].stations[0]).not.toHaveProperty("questions");
    expect(body.cycles[0].questionQuality.questionCount).toBeGreaterThan(0);
    expect(body.cycles[0].questionQuality.clearLengthOutlierCount).toBeGreaterThanOrEqual(0);
    expect(body.cycles[0].questionQuality).not.toHaveProperty("questionReports");
  });

  it("makes reused source pages visible without treating reuse as duplicate content", async () => {
    const duplicate = EDUCATION_V2_P1_800_DRAFT_CYCLES.flatMap((cycle) =>
      cycle.sourceStations.map((station) => ({ cycle, station })),
    ).find(({ station }) => {
      const sourceUrl = station.sourceEvidence?.url;
      if (!sourceUrl) return false;
      const path = new URL(sourceUrl).pathname.replace(/\/$/u, "");
      const host = new URL(sourceUrl).hostname.replace(/^www\./u, "").toLowerCase();
      return (
        EDUCATION_V2_P1_800_DRAFT_CYCLES.flatMap((item) => item.sourceStations).filter(
          (candidate) => {
            if (!candidate.sourceEvidence?.url) return false;
            const candidateUrl = new URL(candidate.sourceEvidence.url);
            return (
              candidateUrl.hostname.replace(/^www\./u, "").toLowerCase() === host &&
              candidateUrl.pathname.replace(/\/$/u, "") === path
            );
          },
        ).length > 1
      );
    });
    expect(duplicate).toBeDefined();
    const { cycle, station } = duplicate!;
    const response = await app.inject({
      method: "GET",
      url: `/admin/curriculum-drafts?routeFamily=${cycle.routeFamily}&sequence=${cycle.sequence}&search=${encodeURIComponent(station.title)}`,
      headers: { authorization: "Bearer super" },
    });
    expect(response.statusCode).toBe(200);
    const listed = response.json().data.cycles[0].stations[0];
    expect(listed.sourcePageUseCount).toBeGreaterThan(1);

    const detail = await app.inject({
      method: "GET",
      url: `/admin/curriculum-drafts/${cycle.routeFamily}/${cycle.sequence}/${encodeURIComponent(station.key)}`,
      headers: { authorization: "Bearer super" },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.station.sourcePageUseCount).toBe(listed.sourcePageUseCount);
  });

  it("shows full text and answer key only on the protected station detail route", async () => {
    const cycle = EDUCATION_V2_P1_800_DRAFT_CYCLES[0]!;
    const station = cycle.sourceStations[0]!;
    const response = await app.inject({
      method: "GET",
      url: `/admin/curriculum-drafts/${cycle.routeFamily}/${cycle.sequence}/${encodeURIComponent(station.key)}`,
      headers: { authorization: "Bearer super" },
    });
    expect(response.statusCode).toBe(200);
    const returned = response.json().data.station;
    expect(returned.text).toBe(station.text);
    expect(returned.questions).toHaveLength(3);
    expect(returned.questions[0].correctOption).toBe(
      station.questions[0]!.options.find(
        (option) => option.id === station.questions[0]!.correctOptionId,
      )?.text,
    );
    expect(response.json().data.cycle.questionQuality.questionCount).toBeGreaterThan(0);
    expect(response.json().data.cycle.questionQuality.correctPositionCounts).toBeDefined();
    expect(response.headers["cache-control"]).toContain("no-store");

    const denied = await app.inject({
      method: "GET",
      url: `/admin/curriculum-drafts/${cycle.routeFamily}/${cycle.sequence}/${encodeURIComponent(station.key)}`,
      headers: { authorization: "Bearer editor" },
    });
    expect(denied.statusCode).toBe(403);

    const missing = await app.inject({
      method: "GET",
      url: `/admin/curriculum-drafts/${cycle.routeFamily}/${cycle.sequence}/unknown-station`,
      headers: { authorization: "Bearer super" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("saves a new unpublished question revision and returns it after reopening the preview", async () => {
    const cycle = EDUCATION_V2_P1_800_DRAFT_CYCLES[0]!;
    const station = cycle.sourceStations[0]!;
    const question = station.questions[0]!;
    const detailUrl = `/admin/curriculum-drafts/${cycle.routeFamily}/${cycle.sequence}/${encodeURIComponent(station.key)}`;
    const headers = { authorization: "Bearer super" };
    const initialResponse = await app.inject({ method: "GET", url: detailUrl, headers });
    expect(initialResponse.statusCode).toBe(200);
    const initial = initialResponse.json().data.station.questions[0];
    const updated = {
      expectedVersionId: initial.versionId,
      prompt: `${question.prompt} (taslak düzenleme)`,
      options: question.options.map((option, index) => ({
        ...option,
        text: index === 0 ? `${option.text} — düzenlendi` : option.text,
      })),
      correctOptionId: question.correctOptionId,
      hint: question.hint ?? null,
      explanation: question.explanation,
      sourceReference: `${station.sourceReference} · editoryal not`,
    };
    const editUrl = `${detailUrl}/questions/${encodeURIComponent(question.key)}`;
    const saved = await app.inject({ method: "PATCH", url: editUrl, headers, payload: updated });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().data.publicationChanged).toBe(false);
    expect(saved.json().data.question.versionId).not.toBe(initial.versionId);

    const reopened = await app.inject({ method: "GET", url: detailUrl, headers });
    expect(reopened.statusCode).toBe(200);
    const persisted = reopened.json().data.station.questions[0];
    expect(persisted.prompt).toBe(updated.prompt);
    expect(persisted.options).toEqual(updated.options);
    expect(persisted.correctOptionId).toBe(question.correctOptionId);
    expect(persisted.sourceReference).toBe(updated.sourceReference);
    expect(persisted.revision).toBe(1);
    expect(persisted.versionId).toBe(saved.json().data.question.versionId);
    expect(persisted.correctOption).toBe(
      updated.options.find((option) => option.id === question.correctOptionId)?.text,
    );
    expect(question.prompt).not.toBe(updated.prompt);
    expect(question.options[0]?.text).not.toBe(updated.options[0]?.text);
    expect(
      revisionStore.history.get(
        draftQuestionEntityId({
          routeFamily: cycle.routeFamily,
          sequence: cycle.sequence,
          stationKey: station.key,
          questionKey: question.key,
        }),
      ),
    ).toHaveLength(1);

    const secondSave = await app.inject({
      method: "PATCH",
      url: editUrl,
      headers,
      payload: {
        ...updated,
        expectedVersionId: persisted.versionId,
        prompt: `${updated.prompt} — ikinci düzenleme`,
      },
    });
    expect(secondSave.statusCode).toBe(200);
    expect(
      revisionStore.history.get(
        draftQuestionEntityId({
          routeFamily: cycle.routeFamily,
          sequence: cycle.sequence,
          stationKey: station.key,
          questionKey: question.key,
        }),
      ),
    ).toHaveLength(2);
    expect(
      revisionStore.history.get(
        draftQuestionEntityId({
          routeFamily: cycle.routeFamily,
          sequence: cycle.sequence,
          stationKey: station.key,
          questionKey: question.key,
        }),
      )?.[0]?.fields.prompt,
    ).toBe(updated.prompt);
    const finalPreview = await app.inject({ method: "GET", url: detailUrl, headers });
    expect(finalPreview.json().data.station.questions[0].prompt).toBe(
      `${updated.prompt} — ikinci düzenleme`,
    );
  });

  it("denies draft saves to non-Super-Admin roles and rejects stale revisions", async () => {
    const cycle = EDUCATION_V2_P1_800_DRAFT_CYCLES[0]!;
    const station = cycle.sourceStations[0]!;
    const question = station.questions[0]!;
    const detailUrl = `/admin/curriculum-drafts/${cycle.routeFamily}/${cycle.sequence}/${encodeURIComponent(station.key)}`;
    const detail = await app.inject({
      method: "GET",
      url: detailUrl,
      headers: { authorization: "Bearer super" },
    });
    const baseQuestion = detail.json().data.station.questions[0];
    const editUrl = `${detailUrl}/questions/${encodeURIComponent(question.key)}`;
    const payload = {
      expectedVersionId: baseQuestion.versionId,
      prompt: question.prompt,
      options: question.options,
      correctOptionId: question.correctOptionId,
      hint: question.hint ?? null,
      explanation: question.explanation,
      sourceReference: station.sourceReference,
    };
    const anonymous = await app.inject({ method: "PATCH", url: editUrl, payload });
    expect(anonymous.statusCode).toBe(401);

    const denied = await app.inject({
      method: "PATCH",
      url: editUrl,
      headers: { authorization: "Bearer editor" },
      payload,
    });
    expect(denied.statusCode).toBe(403);
    expect(revisionStore.revisions.size).toBe(0);

    const changedIdentity = await app.inject({
      method: "PATCH",
      url: editUrl,
      headers: { authorization: "Bearer super" },
      payload: {
        ...payload,
        options: payload.options.map((option, index) =>
          index === 0 ? { ...option, id: "different-option-id" } : option,
        ),
      },
    });
    expect(changedIdentity.statusCode).toBe(400);
    expect(revisionStore.revisions.size).toBe(0);

    const firstSave = await app.inject({
      method: "PATCH",
      url: editUrl,
      headers: { authorization: "Bearer super" },
      payload,
    });
    expect(firstSave.statusCode).toBe(200);
    const staleSave = await app.inject({
      method: "PATCH",
      url: editUrl,
      headers: { authorization: "Bearer super" },
      payload,
    });
    expect(staleSave.statusCode).toBe(409);
  });
});
