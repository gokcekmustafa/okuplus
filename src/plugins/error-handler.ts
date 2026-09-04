import type { FastifyInstance } from "fastify";
import { isApiError } from "../lib/errors.js";
import { fail } from "../lib/response.js";
import { setNoStore } from "../modules/auth/cookies.js";
import { ZodError } from "zod";

function requestPath(url: string): string {
  return url.split("?", 1)[0] ?? url;
}

function isAuthPath(url: string): boolean {
  const path = requestPath(url);
  return path === "/auth" || path.startsWith("/auth/");
}

function errorStatusCode(error: unknown): number {
  if (isApiError(error)) return error.statusCode;
  if (error instanceof ZodError) return 400;
  if (
    typeof error === "object" &&
    error !== null &&
    "validation" in error &&
    Array.isArray((error as { validation: unknown }).validation)
  ) {
    return 400;
  }
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    return Number((error as { statusCode?: unknown }).statusCode);
  }
  return 0;
}

function markSecurityResponse(
  requestUrl: string,
  error: unknown,
  reply: Parameters<typeof setNoStore>[0],
): void {
  const statusCode = errorStatusCode(error);
  if (isAuthPath(requestUrl) || statusCode === 401 || statusCode === 403) {
    setNoStore(reply);
  }
}

/**
 * Merkezi hata yakalayıcı. ApiError/ZodError için standart format, bilinmeyen
 * hatalar için güvenli generic mesaj (detay log'a yazılır).
 */
export async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    markSecurityResponse(request.url, error, reply);

    if (isApiError(error)) {
      return reply.status(error.statusCode).send(fail(error.code, error.message, error.details));
    }

    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send(fail("VALIDATION_ERROR", "Geçersiz istek verisi", error.issues));
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "validation" in error &&
      Array.isArray((error as { validation: unknown }).validation)
    ) {
      return reply
        .status(400)
        .send(
          fail(
            "VALIDATION_ERROR",
            "Geçersiz istek verisi",
            (error as { validation: unknown }).validation,
          ),
        );
    }

    const statusCode = errorStatusCode(error);
    if (statusCode >= 400 && statusCode < 500) {
      const isTooLarge =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "FST_ERR_CTP_BODY_TOO_LARGE";
      return reply
        .status(statusCode)
        .send(
          fail(
            isTooLarge ? "PAYLOAD_TOO_LARGE" : "REQUEST_ERROR",
            isTooLarge ? "İstek gövdesi çok büyük" : "Geçersiz istek",
          ),
        );
    }

    request.log.error({ err: error }, "Beklenmeyen hata");
    return reply.status(500).send(fail("INTERNAL_ERROR", "Beklenmeyen hata"));
  });

  app.setNotFoundHandler((request, reply) => {
    if (isAuthPath(request.url)) setNoStore(reply);
    return reply.status(404).send(fail("NOT_FOUND", "Rota bulunamadı"));
  });
}
