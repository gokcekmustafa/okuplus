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

function safeTimestamp(value: Date | null, sessionStartedAt: Date, now: Date): Date | null {
  if (!value) return null;
  const timestamp = value.getTime();
  const sessionStart = sessionStartedAt.getTime();
  const current = now.getTime();
  // Client clocks can be ahead of the server clock. Telemetry is optional and
  // must never prevent the authoritative answer from being stored.
  if (timestamp < sessionStart || timestamp > current) return null;
  return value;
}

function duration(now: Date, start: Date | null): number | null {
  if (!start) return null;
  const value = now.getTime() - start.getTime();
  if (value < 0 || value > MAX_MEASUREMENT_MS) return null;
  return value;
}

export function validateAttemptTelemetry(
  input: AttemptTelemetryInput,
  sessionStartedAt: Date,
  now = new Date(),
  responseOrder = 1,
  isCorrect: boolean | null = null,
): AttemptTelemetry {
  const exposureStartedAt = safeTimestamp(
    parseTimestamp(input.exposureStartedAt, "Soru başlangıcı"),
    sessionStartedAt,
    now,
  );
  let answerStartedAt = safeTimestamp(
    parseTimestamp(input.answerStartedAt, "Cevap başlangıcı"),
    sessionStartedAt,
    now,
  );
  if (exposureStartedAt && answerStartedAt && answerStartedAt < exposureStartedAt) {
    answerStartedAt = null;
  }
  return {
    exposureStartedAt,
    answerStartedAt,
    submittedAt: now,
    interactionDurationMs: duration(now, exposureStartedAt),
    answerDurationMs: duration(now, answerStartedAt),
    hintUsed: input.hintUsed === true,
    finalResult:
      input.isFinal === true || responseOrder > 1 || isCorrect === true ? isCorrect : null,
  };
}
