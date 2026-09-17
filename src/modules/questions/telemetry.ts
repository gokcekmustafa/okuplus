const MAX_MEASUREMENT_MS = 24 * 60 * 60 * 1000;

export type AttemptTelemetryInput = {
  exposureStartedAt?: string;
  answerStartedAt?: string;
  hintUsed?: boolean;
  isFinal?: boolean;
};

export type AttemptTelemetry = {
  exposureStartedAt: Date | null;
  answerStartedAt: Date | null;
  submittedAt: Date;
  interactionDurationMs: number | null;
  answerDurationMs: number | null;
  hintUsed: boolean;
  finalResult: boolean | null;
};

function parseTimestamp(value: string | undefined, label: string): Date | null {
  if (value === undefined) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} geçerli bir zaman olmalı`);
  return date;
}

function duration(now: Date, start: Date | null, label: string): number | null {
  if (!start) return null;
  const value = now.getTime() - start.getTime();
  if (value < 0 || value > MAX_MEASUREMENT_MS) throw new Error(`${label} ölçümü geçersiz`);
  return value;
}

export function validateAttemptTelemetry(
  input: AttemptTelemetryInput,
  sessionStartedAt: Date,
  now = new Date(),
  responseOrder = 1,
  isCorrect: boolean | null = null,
): AttemptTelemetry {
  const exposureStartedAt = parseTimestamp(input.exposureStartedAt, "Soru başlangıcı");
  const answerStartedAt = parseTimestamp(input.answerStartedAt, "Cevap başlangıcı");
  if (exposureStartedAt && exposureStartedAt < sessionStartedAt) {
    throw new Error("Soru başlangıcı oturum başlangıcından önce olamaz");
  }
  if (answerStartedAt && answerStartedAt < sessionStartedAt) {
    throw new Error("Cevap başlangıcı oturum başlangıcından önce olamaz");
  }
  if (exposureStartedAt && answerStartedAt && answerStartedAt < exposureStartedAt) {
    throw new Error("Cevap başlangıcı soru başlangıcından önce olamaz");
  }
  if (exposureStartedAt && exposureStartedAt > now) {
    throw new Error("Soru başlangıcı gelecekte olamaz");
  }
  if (answerStartedAt && answerStartedAt > now) {
    throw new Error("Cevap başlangıcı gelecekte olamaz");
  }
  return {
    exposureStartedAt,
    answerStartedAt,
    submittedAt: now,
    interactionDurationMs: duration(now, exposureStartedAt, "Etkileşim süresi"),
    answerDurationMs: duration(now, answerStartedAt, "Cevap süresi"),
    hintUsed: input.hintUsed === true,
    finalResult:
      input.isFinal === true || responseOrder > 1 || isCorrect === true ? isCorrect : null,
  };
}
