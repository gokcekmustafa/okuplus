export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function ok<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

export function fail(code: string, message: string, details?: unknown): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}
