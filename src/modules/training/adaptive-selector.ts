import { createHash } from "node:crypto";

export const ADAPTIVE_TRAINING_COMPOSITION = [
  { position: 1, family: "ATTENTION_BURST", competency: "FAST_ATTENTION" },
  { position: 2, family: "RAPID_RECOGNITION", competency: "FAST_RECOGNITION" },
  { position: 3, family: "PHRASE_CHUNKING", competency: "FAST_CHUNKING" },
  { position: 4, family: "MAIN_IDEA", competency: "RC_MAIN_IDEA" },
  { position: 5, family: "DETAIL_EVIDENCE", competency: "RC_DETAIL" },
  { position: 6, family: "INFERENCE", competency: "RC_INFERENCE" },
] as const;

/**
 * The daily V1 composition keeps one deterministic item from each currently
 * supported training family. The signal model carries the same metadata used
 * by future adaptive routing, so composition changes do not require a second
 * analytics contract.
 */
export const ADAPTIVE_TRAINING_FAMILIES = [
  "MAIN_IDEA",
  "DETAIL_EVIDENCE",
  "INFERENCE",
  "ATTENTION_BURST",
  "RAPID_RECOGNITION",
  "PHRASE_CHUNKING",
] as const;

export type AdaptiveFamily = (typeof ADAPTIVE_TRAINING_FAMILIES)[number];
export type AdaptiveDifficulty = "FOUNDATION" | "DEVELOPING" | "CHALLENGING";
export type AdaptiveBand = "WEAK" | "NORMAL" | "STRETCH";
export type AdaptiveStatus =
  "NOT_STARTED" | "PRACTICING" | "DEVELOPING" | "STABLE" | "NEEDS_REVIEW";

export type AdaptiveCandidate = {
  templateVersionId: string;
  family: AdaptiveFamily;
  competency: string;
  difficulty: AdaptiveDifficulty;
  version?: number;
  publishedAt?: Date | string | null;
};

export type AdaptiveAttempt = {
  rawScore: number | null;
  isCorrect: boolean | null;
  timeSpentMs: number | null;
  answeredAt: Date | string;
};

export type AdaptiveSession = {
  sessionId: string;
  family: AdaptiveFamily;
  competency: string;
  difficulty: AdaptiveDifficulty;
  exposureId: string;
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | "EXPIRED";
  attempts: readonly AdaptiveAttempt[];
};

export type AdaptiveSignal = {
  family: AdaptiveFamily;
  competency: string;
  status: AdaptiveStatus;
  band: AdaptiveBand;
  scoredCount: number;
  accuracy: number | null;
  consecutiveFailures: number;
  highAccuracySessionCount: number;
  scoredSessionCount: number;
  exposureCount: number;
  completionCount: number;
  abandonmentCount: number;
  averageResponseTimeMs: number | null;
  recentExposureIds: string[];
  currentDifficulty: AdaptiveDifficulty;
  mastery: boolean;
};

export type AdaptivePerformanceState = Record<AdaptiveFamily, AdaptiveSignal>;

export type AdaptivePlanItem = AdaptiveCandidate & { position: number; band: AdaptiveBand };

export type AdaptivePlan = {
  version: 1;
  totalItems: 6;
  items: AdaptivePlanItem[];
};

const DIFFICULTY_ORDER: Record<AdaptiveDifficulty, number> = {
  FOUNDATION: 0,
  DEVELOPING: 1,
  CHALLENGING: 2,
};

function scoreOf(attempt: AdaptiveAttempt): number | null {
  if (typeof attempt.rawScore === "number" && Number.isFinite(attempt.rawScore)) {
    return Math.max(0, Math.min(1, attempt.rawScore));
  }
  if (attempt.isCorrect === true) return 1;
  if (attempt.isCorrect === false) return 0;
  return null;
}

function isFailure(attempt: AdaptiveAttempt): boolean {
  const score = scoreOf(attempt);
  return score !== null && score < 1;
}

function emptySignal(family: AdaptiveFamily, competency: string): AdaptiveSignal {
  return {
    family,
    competency,
    status: "NOT_STARTED",
    band: "NORMAL",
    scoredCount: 0,
    accuracy: null,
    consecutiveFailures: 0,
    highAccuracySessionCount: 0,
    scoredSessionCount: 0,
    exposureCount: 0,
    completionCount: 0,
    abandonmentCount: 0,
    averageResponseTimeMs: null,
    recentExposureIds: [],
    currentDifficulty: "FOUNDATION",
    mastery: false,
  };
}

function recentConsecutiveFailures(attempts: readonly AdaptiveAttempt[]): number {
  let count = 0;
  for (const attempt of [...attempts].reverse()) {
    if (!isFailure(attempt)) break;
    count += 1;
  }
  return count;
}

export function deriveAdaptiveSignal(
  sessions: readonly AdaptiveSession[],
  family: AdaptiveFamily,
  competency: string,
): AdaptiveSignal {
  const relevant = sessions
    .filter((session) => session.family === family && session.competency === competency)
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  if (relevant.length === 0) return emptySignal(family, competency);

  const orderedSessions = [...relevant].sort((a, b) => {
    const aTime = a.attempts.at(-1)?.answeredAt;
    const bTime = b.attempts.at(-1)?.answeredAt;
    return new Date(String(aTime ?? 0)).getTime() - new Date(String(bTime ?? 0)).getTime();
  });
  const allAttempts = orderedSessions.flatMap((session) => session.attempts);
  const scoredAttempts = allAttempts.filter((attempt) => scoreOf(attempt) !== null);
  const recentScored = scoredAttempts.slice(-10);
  const accuracy =
    scoredAttempts.length > 0
      ? scoredAttempts.reduce((total, attempt) => total + (scoreOf(attempt) ?? 0), 0) /
        scoredAttempts.length
      : null;
  const recentAccuracy =
    recentScored.length > 0
      ? recentScored.reduce((total, attempt) => total + (scoreOf(attempt) ?? 0), 0) /
        recentScored.length
      : null;
  const consecutiveFailures = recentConsecutiveFailures(scoredAttempts);
  const scoredSessions = orderedSessions
    .map((session) => ({
      session,
      attempts: session.attempts.filter((attempt) => scoreOf(attempt) !== null),
    }))
    .filter((entry) => entry.attempts.length > 0);
  const highAccuracySessionCount = scoredSessions.filter((entry) => {
    if (entry.session.status !== "COMPLETED") return false;
    const sessionAccuracy =
      entry.attempts.reduce((total, attempt) => total + (scoreOf(attempt) ?? 0), 0) /
      entry.attempts.length;
    return sessionAccuracy >= 0.85;
  }).length;
  const lastTwoSessions = scoredSessions.slice(-2);
  const lastTwoHaveNoRepeatFailure = lastTwoSessions.every(
    (entry) => recentConsecutiveFailures(entry.attempts) < 2,
  );
  const exposureIds = new Set(orderedSessions.map((session) => session.exposureId));
  const mastery =
    scoredAttempts.length >= 10 &&
    scoredSessions.length >= 3 &&
    recentScored.length === 10 &&
    (recentAccuracy ?? 0) >= 0.75 &&
    lastTwoSessions.length === 2 &&
    lastTwoHaveNoRepeatFailure &&
    exposureIds.size >= 2;
  const weak =
    (scoredAttempts.length >= 5 && (recentAccuracy ?? 0) < 0.6) || consecutiveFailures >= 2;
  const completionCount = orderedSessions.filter(
    (session) => session.status === "COMPLETED",
  ).length;
  const abandonmentCount = orderedSessions.filter((session) =>
    ["ABANDONED", "EXPIRED"].includes(session.status),
  ).length;
  const high = highAccuracySessionCount >= 2 && consecutiveFailures < 2 && abandonmentCount === 0;
  const status: AdaptiveStatus = weak
    ? "NEEDS_REVIEW"
    : mastery || high
      ? "STABLE"
      : scoredAttempts.length === 0
        ? "NOT_STARTED"
        : scoredSessions.length < 2 || scoredAttempts.length < 5
          ? "PRACTICING"
          : "DEVELOPING";
  const band: AdaptiveBand = weak ? "WEAK" : high ? "STRETCH" : "NORMAL";
  const recentSession = orderedSessions.at(-1);
  const responseTimes = scoredAttempts
    .map((attempt) => attempt.timeSpentMs)
    .filter((value): value is number => typeof value === "number" && value >= 0);

  return {
    family,
    competency,
    status,
    band,
    scoredCount: scoredAttempts.length,
    accuracy,
    consecutiveFailures,
    highAccuracySessionCount,
    scoredSessionCount: scoredSessions.length,
    exposureCount: exposureIds.size,
    completionCount,
    abandonmentCount,
    averageResponseTimeMs:
      responseTimes.length > 0
        ? responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length
        : null,
    recentExposureIds: orderedSessions.slice(-10).map((session) => session.exposureId),
    currentDifficulty: recentSession?.difficulty ?? "FOUNDATION",
    mastery,
  };
}

export function deriveAdaptivePerformance(
  sessions: readonly AdaptiveSession[],
): AdaptivePerformanceState {
  return {
    MAIN_IDEA: deriveAdaptiveSignal(sessions, "MAIN_IDEA", "RC_MAIN_IDEA"),
    DETAIL_EVIDENCE: deriveAdaptiveSignal(sessions, "DETAIL_EVIDENCE", "RC_DETAIL"),
    INFERENCE: deriveAdaptiveSignal(sessions, "INFERENCE", "RC_INFERENCE"),
    ATTENTION_BURST: deriveAdaptiveSignal(sessions, "ATTENTION_BURST", "FAST_ATTENTION"),
    RAPID_RECOGNITION: deriveAdaptiveSignal(sessions, "RAPID_RECOGNITION", "FAST_RECOGNITION"),
    PHRASE_CHUNKING: deriveAdaptiveSignal(sessions, "PHRASE_CHUNKING", "FAST_CHUNKING"),
  };
}

export function adaptiveBandFor(
  seed: string,
  position: number,
  family: AdaptiveFamily,
): AdaptiveBand {
  const digest = createHash("sha256").update(`${seed}:${family}:${position}`).digest("hex");
  const bucket = Number.parseInt(digest.slice(0, 8), 16) % 100;
  if (bucket < 50) return "WEAK";
  if (bucket < 85) return "NORMAL";
  return "STRETCH";
}

function candidateDate(candidate: AdaptiveCandidate): number {
  return candidate.publishedAt ? new Date(candidate.publishedAt).getTime() : 0;
}

function candidateOrder(
  a: AdaptiveCandidate,
  b: AdaptiveCandidate,
  targetDifficulty: number,
  recentExposureIds: ReadonlySet<string>,
): number {
  const aRecent = recentExposureIds.has(a.templateVersionId) ? 1 : 0;
  const bRecent = recentExposureIds.has(b.templateVersionId) ? 1 : 0;
  if (aRecent !== bRecent) return aRecent - bRecent;
  const aDistance = Math.abs(DIFFICULTY_ORDER[a.difficulty] - targetDifficulty);
  const bDistance = Math.abs(DIFFICULTY_ORDER[b.difficulty] - targetDifficulty);
  if (aDistance !== bDistance) return aDistance - bDistance;
  const publishedDifference = candidateDate(b) - candidateDate(a);
  if (publishedDifference !== 0) return publishedDifference;
  if ((b.version ?? 0) !== (a.version ?? 0)) return (b.version ?? 0) - (a.version ?? 0);
  return a.templateVersionId.localeCompare(b.templateVersionId);
}

export function selectAdaptiveCandidate(
  candidates: readonly AdaptiveCandidate[],
  signal: AdaptiveSignal,
  band: AdaptiveBand,
  excludedIds: ReadonlySet<string> = new Set(),
): AdaptiveCandidate | null {
  const available = candidates.filter((candidate) => !excludedIds.has(candidate.templateVersionId));
  if (available.length === 0) return null;
  const current = DIFFICULTY_ORDER[signal.currentDifficulty];
  const target =
    band === "WEAK"
      ? Math.max(0, current - 1)
      : band === "STRETCH"
        ? Math.min(2, current + 1)
        : current;
  const directional = available.filter((candidate) => {
    const difficulty = DIFFICULTY_ORDER[candidate.difficulty];
    if (band === "WEAK") return difficulty <= target;
    if (band === "STRETCH") return difficulty >= target;
    return difficulty === target;
  });
  const pool = directional.length > 0 ? directional : available;
  const nonRecent = pool.filter(
    (candidate) => !signal.recentExposureIds.includes(candidate.templateVersionId),
  );
  const preferredPool = nonRecent.length > 0 ? nonRecent : pool;
  return (
    [...preferredPool].sort((a, b) =>
      candidateOrder(a, b, target, new Set(signal.recentExposureIds)),
    )[0] ?? null
  );
}

export function planAdaptiveTraining(
  candidates: readonly AdaptiveCandidate[],
  performance: AdaptivePerformanceState,
  seed: string,
): AdaptivePlan {
  const items: AdaptivePlanItem[] = [];
  const usedByFamily = new Map<AdaptiveFamily, Set<string>>();
  for (const compositionItem of ADAPTIVE_TRAINING_COMPOSITION) {
    const signal = performance[compositionItem.family];
    const weightedBand = adaptiveBandFor(seed, compositionItem.position, compositionItem.family);
    const band =
      signal.band === "WEAK" && weightedBand === "STRETCH"
        ? "NORMAL"
        : signal.band === "STRETCH" && weightedBand === "WEAK"
          ? "NORMAL"
          : signal.status === "NOT_STARTED" && weightedBand === "STRETCH"
            ? "NORMAL"
            : weightedBand;
    const used = usedByFamily.get(compositionItem.family) ?? new Set<string>();
    const familyCandidates = candidates.filter(
      (candidate) =>
        candidate.family === compositionItem.family &&
        candidate.competency === compositionItem.competency,
    );
    const selected = selectAdaptiveCandidate(familyCandidates, signal, band, used);
    if (!selected) {
      throw new Error(`${compositionItem.family} için uygun adaptive egzersiz bulunamadı`);
    }
    used.add(selected.templateVersionId);
    usedByFamily.set(compositionItem.family, used);
    items.push({ ...selected, position: compositionItem.position, band });
  }
  return { version: 1, totalItems: 6, items };
}

/**
 * İlk antrenmanda öğrenciyi zorlamadan mevcut adaptive seçim sözleşmesini
 * kullanır. Boş performans profili FOUNDATION yönünü seçer; FOUNDATION
 * adayı yoksa selector yalnızca mevcut en yakın adaya güvenli biçimde düşer.
 * Placement sonucu burada level ataması yapmaz; yalnızca ilk gün bağlamı
 * üst katmanda kullanıcı deneyimi için taşınır.
 */
export function planFirstDayTraining(
  candidates: readonly AdaptiveCandidate[],
  seed: string,
): AdaptivePlan {
  return planAdaptiveTraining(candidates, deriveAdaptivePerformance([]), `${seed}:first-day`);
}
