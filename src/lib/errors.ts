export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

export function validationError(message: string, details?: unknown): ApiError {
  return new ApiError("VALIDATION_ERROR", message, 400, details);
}

export function unauthorizedError(message = "Kimlik doğrulaması gerekli"): ApiError {
  return new ApiError("UNAUTHORIZED", message, 401);
}

export function forbiddenError(
  message = "Bu işlem için yetkiniz yok",
  details?: unknown,
): ApiError {
  return new ApiError("FORBIDDEN", message, 403, details);
}

export function notFoundError(message = "Kaynak bulunamadı"): ApiError {
  return new ApiError("NOT_FOUND", message, 404);
}

export function conflictError(message = "Kaynak çakışması"): ApiError {
  return new ApiError("CONFLICT", message, 409);
}

export function serviceUnavailableError(message = "Servis geçici olarak kullanılamıyor"): ApiError {
  return new ApiError("SERVICE_UNAVAILABLE", message, 503);
}

export function internalError(message = "Beklenmeyen hata"): ApiError {
  return new ApiError("INTERNAL_ERROR", message, 500);
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
