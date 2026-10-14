import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformOrOrganizationManagement } from "../../middleware/require-management-scope.js";
import type { OrganizationActorInput } from "../organization-admin/policy.js";
import { resolveOrganizationScope } from "../organization-admin/policy.js";
import {
  getAnalyticsOverview,
  getAnalyticsStudentDetail,
  listAnalyticsStudents,
  normalizeAnalyticsRange,
  type AnalyticsScope,
} from "./service.js";
import { analyticsListQuerySchema, analyticsRangeSchema } from "./schemas.js";

function actor(request: FastifyRequest): OrganizationActorInput {
  return {
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    role: request.tenantContext?.role ?? null,
    platformRole: null,
  };
}

function readStudentId(request: FastifyRequest): string {
  const id = (request.params as { studentId?: string }).studentId;
  if (!id?.trim()) throw validationError("Öğrenci kimliği gerekli");
  return id;
}

async function scope(request: FastifyRequest) {
  if (request.authUser?.platformRole === "SUPER_ADMIN") {
    const platformScope: AnalyticsScope = { kind: "PLATFORM", userId: request.authUser.id };
    return platformScope;
  }
  return {
    kind: "ORGANIZATION",
    organization: await resolveOrganizationScope(actor(request)),
  } satisfies AnalyticsScope;
}

function readRange(input: unknown) {
  try {
    return normalizeAnalyticsRange(analyticsRangeSchema.parse(input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tarih aralığı geçersiz";
    throw validationError(message);
  }
}

export async function analyticsAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
) {
  const preHandler = [
    requireAuth(opts.authProvider),
    requirePlatformOrOrganizationManagement(["SUPER_ADMIN"]),
  ];

  app.get("/admin/analytics/overview", { preHandler }, async (request) => {
    const range = readRange(request.query);
    return ok(await getAnalyticsOverview(await scope(request), range));
  });

  app.get("/admin/analytics/students", { preHandler }, async (request) => {
    const query = analyticsListQuerySchema.parse(request.query);
    const range = readRange(query);
    return ok(
      await listAnalyticsStudents(await scope(request), range, query.page, query.pageSize, {
        search: query.search,
        tenantType: query.tenantType,
      }),
    );
  });

  app.get("/admin/analytics/students/:studentId", { preHandler }, async (request) => {
    const range = readRange(request.query);
    return ok(await getAnalyticsStudentDetail(await scope(request), readStudentId(request), range));
  });
}
