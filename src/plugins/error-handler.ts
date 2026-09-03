import type { FastifyInstance } from "fastify";
import { isApiError } from "../lib/errors.js";
import { fail } from "../lib/response.js";
import { ZodError } from "zod";

/**
 * Merkezi hata yakalayıcı. ApiError/ZodError için standart format, bilinmeyen
 * hatalar için güvenli generic mesaj (detay log'a yazılır).
 */
export async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
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

    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 0;
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
    void request;
    return reply.status(404).send(fail("NOT_FOUND", "Rota bulunamadı"));
  });
}
