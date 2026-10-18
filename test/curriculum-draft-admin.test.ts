import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AuthProvider,
  AuthenticatedUser,
  VerifiedSession,
} from "../src/modules/auth/index.js";
import { curriculumDraftAdminRoutes } from "../src/modules/curriculum-drafts/admin-routes.js";
import { EDUCATION_V2_P1_800_DRAFT_CYCLES } from "../src/curriculum/education-v2-p1-800-draft-cycles.js";

describe("read-only curriculum draft preview", () => {
  let app: FastifyInstance;

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
    await app.register(curriculumDraftAdminRoutes, { authProvider });
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
});
