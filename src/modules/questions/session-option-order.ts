import type { Prisma } from "@prisma/client";
import { createHmac } from "node:crypto";

type SessionOption = {
  id: string;
  [key: string]: unknown;
};

export type SessionQuestionOptionSet = {
  questionVersionId: string;
  questionType: string;
  options: Prisma.JsonValue | null;
  correctOptionIds?: readonly string[] | null;
};

export type StudentVisibleSessionContext = "INDIVIDUAL" | "ASSIGNMENT" | "ASSESSMENT";

/**
 * Option order is a presentation concern for student sessions only.  The
 * server still scores the immutable optionId, so teacher/admin views keep
 * their editorial order while every student-facing context gets a stable
 * per-session permutation.
 */
export function shouldReorderStudentOptions(
  platformRole: string | null,
  context: string,
  questionType: string,
): context is StudentVisibleSessionContext {
  return (
    platformRole === null &&
    questionType === "MULTIPLE_CHOICE" &&
    (context === "INDIVIDUAL" || context === "ASSIGNMENT" || context === "ASSESSMENT")
  );
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function assertEntropyKey(secret: string): void {
  if (secret.length < 32) throw new Error("Öğrenci seçenek sıralama anahtarı geçersiz");
}

function nextRandom(state: number): { state: number; value: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let value = next;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return {
    state: next,
    value: ((value ^ (value >>> 14)) >>> 0) / 4294967296,
  };
}

/**
 * Returns a deterministic permutation for one persisted exercise session.
 * The question/option ids stay untouched; only the response order changes.
 * This makes reopening a session stable without adding a database snapshot.
 */
export function reorderOptionsForSession<T extends SessionOption>(
  options: readonly T[],
  sessionKey: string,
): T[] {
  if (options.length < 2) return [...options];

  const reordered = [...options];
  let state = hashSeed(sessionKey);
  for (let index = reordered.length - 1; index > 0; index -= 1) {
    const random = nextRandom(state);
    state = random.state;
    const swapIndex = Math.floor(random.value * (index + 1));
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex]!, reordered[index]!];
  }
  return reordered;
}

function isSessionOption(value: Prisma.JsonValue): value is Prisma.JsonObject & { id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0
  );
}

/**
 * Reorders only valid option arrays. Invalid or non-option JSON is returned
 * unchanged so the existing validation path remains responsible for rejecting
 * malformed published question data.
 */
export function reorderJsonOptionsForSession(
  value: Prisma.JsonValue | null,
  sessionKey: string,
): Prisma.JsonValue | null {
  if (value === null || !Array.isArray(value) || !value.every(isSessionOption)) return value;

  return reorderOptionsForSession(value, sessionKey) as unknown as Prisma.JsonValue;
}

/** Extracts only a valid multiple-choice key for server-side ordering decisions. */
export function multipleChoiceCorrectOptionIds(value: unknown): string[] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const answer = value as { type?: unknown; correctOptionIds?: unknown };
  if (
    answer.type !== "MULTIPLE_CHOICE" ||
    !Array.isArray(answer.correctOptionIds) ||
    answer.correctOptionIds.length === 0 ||
    !answer.correctOptionIds.every((id) => typeof id === "string" && id.length > 0) ||
    new Set(answer.correctOptionIds).size !== answer.correctOptionIds.length
  ) {
    return null;
  }
  return answer.correctOptionIds as string[];
}

type RandomSource = { secret: string; scope: string; counter: number };

function randomUnit(random: RandomSource): number {
  const digest = createHmac("sha256", random.secret)
    .update(`${random.scope}:${random.counter++}`, "utf8")
    .digest();
  const mantissa = digest.readUInt32BE(0) * 0x20_0000 + (digest.readUInt32BE(4) >>> 11);
  return mantissa / 0x20_0000_0000_0000;
}

function weightedChoice<T>(
  values: readonly T[],
  weight: (value: T) => number,
  random: RandomSource,
): T {
  const weights = values.map((value) => Math.max(0.0001, weight(value)));
  const total = weights.reduce((sum, item) => sum + item, 0);
  let target = randomUnit(random) * total;
  for (let index = 0; index < values.length; index += 1) {
    target -= weights[index]!;
    if (target < 0) return values[index]!;
  }
  return values.at(-1)!;
}

function optionList(value: Prisma.JsonValue | null): SessionOption[] | null {
  if (value === null || !Array.isArray(value) || !value.every(isSessionOption)) return null;
  const ids = value.map((option) => option.id);
  if (new Set(ids).size !== ids.length) return null;
  return value as unknown as SessionOption[];
}

function shuffleForPrivateSession<T>(options: readonly T[], secret: string, scope: string): T[] {
  const shuffled = [...options];
  const random: RandomSource = { secret, scope, counter: 0 };
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(randomUnit(random) * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  return shuffled;
}

function modularStep(from: number, to: number, optionCount: number): number {
  return (to - from + optionCount) % optionCount;
}

function patternPenalty(
  history: readonly number[],
  candidate: number,
  optionCount: number,
): number {
  if (history.length >= 2) {
    const first = history.at(-2)!;
    const second = history.at(-1)!;
    if (first === second && second === candidate) return 100;
    const forward = second - first === 1 && candidate - second === 1;
    const backward = second - first === -1 && candidate - second === -1;
    const wraps =
      optionCount >= 4 &&
      ((modularStep(first, second, optionCount) === 1 &&
        modularStep(second, candidate, optionCount) === 1) ||
        (modularStep(first, second, optionCount) === optionCount - 1 &&
          modularStep(second, candidate, optionCount) === optionCount - 1));
    if (forward || backward || wraps) {
      return 100;
    }
  }
  if (history.length >= 3) {
    const first = history.at(-3)!;
    const second = history.at(-2)!;
    const third = history.at(-1)!;
    if (first === third && second === candidate) return 80;
  }
  return 0;
}

function combinations(optionCount: number, correctCount: number, random: RandomSource): number[][] {
  const output: number[][] = [];
  const current: number[] = [];
  const limit = 512;
  function visit(start: number): void {
    if (output.length >= limit) return;
    if (current.length === correctCount) {
      output.push([...current]);
      return;
    }
    const remaining = correctCount - current.length;
    for (let position = start; position <= optionCount - remaining; position += 1) {
      current.push(position);
      visit(position + 1);
      current.pop();
      if (output.length >= limit) return;
    }
  }
  visit(0);
  if (output.length < limit) return output;

  // Very large answer sets are unusual. Bound work while still sampling valid
  // distinct position sets deterministically for this persisted session.
  const sampled = new Map<string, number[]>();
  for (let attempt = 0; attempt < limit * 4 && sampled.size < limit; attempt += 1) {
    const positions = Array.from({ length: optionCount }, (_, index) => index);
    for (let index = positions.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(randomUnit(random) * (index + 1));
      [positions[index], positions[swap]] = [positions[swap]!, positions[index]!];
    }
    const selection = positions.slice(0, correctCount).sort((a, b) => a - b);
    sampled.set(selection.join(","), selection);
  }
  return [...sampled.values()];
}

function reorderAtPositions<T extends SessionOption>(
  options: readonly T[],
  correctOptionIds: readonly string[],
  correctPositions: readonly number[],
  sessionKey: string,
  questionVersionId: string,
  entropyKey: string,
): T[] {
  const correctIds = new Set(correctOptionIds);
  const correct = options.filter((option) => correctIds.has(option.id));
  const distractors = options.filter((option) => !correctIds.has(option.id));
  const shuffledCorrect = shuffleForPrivateSession(
    correct,
    entropyKey,
    `${sessionKey}:${questionVersionId}:key`,
  );
  const shuffledDistractors = shuffleForPrivateSession(
    distractors,
    entropyKey,
    `${sessionKey}:${questionVersionId}:distractors`,
  );
  const result = new Array<T>(options.length);
  const positions = [...correctPositions].sort((a, b) => a - b);
  positions.forEach((position, index) => {
    result[position] = shuffledCorrect[index]!;
  });
  let distractorIndex = 0;
  for (let position = 0; position < result.length; position += 1) {
    if (!result[position]) result[position] = shuffledDistractors[distractorIndex++]!;
  }
  return result.map((option, position) =>
    typeof option.position === "number" ? ({ ...option, position } as T) : option,
  );
}

/**
 * Determines correct answer positions for a whole persisted student session,
 * then orders each question's options around those positions. The session ID
 * makes reloads stable; the randomized, constrained sequence varies by session.
 */
export function reorderQuestionOptionSetsForSession(
  questions: readonly SessionQuestionOptionSet[],
  sessionKey: string,
  entropyKey: string,
): Map<string, Prisma.JsonValue | null> {
  assertEntropyKey(entropyKey);
  const outputs = new Map<string, Prisma.JsonValue | null>();
  const valid = questions.flatMap((question) => {
    const options = optionList(question.options);
    const ids = question.correctOptionIds;
    if (
      question.questionType !== "MULTIPLE_CHOICE" ||
      !options ||
      !ids ||
      ids.length === 0 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !options.some((option) => option.id === id))
    ) {
      outputs.set(question.questionVersionId, question.options);
      return [];
    }
    return [{ question, options, correctOptionIds: ids }];
  });

  const random: RandomSource = {
    secret: entropyKey,
    scope: `${sessionKey}:answer-positions`,
    counter: 0,
  };
  const singleHistory: number[] = [];
  const singleCounts = new Map<number, number[]>();
  const multipleHistory = new Map<string, number[][]>();
  const multipleCounts = new Map<number, number[]>();
  const targets = new Map<string, number[]>();

  for (const { question, options, correctOptionIds } of valid) {
    const optionCount = options.length;
    const targetCounts =
      correctOptionIds.length === 1
        ? (singleCounts.get(optionCount) ?? Array.from({ length: optionCount }, () => 0))
        : (multipleCounts.get(optionCount) ?? Array.from({ length: optionCount }, () => 0));

    if (correctOptionIds.length === 1) {
      const candidates = Array.from({ length: optionCount }, (_, index) => index);
      const lowestPenalty = Math.min(
        ...candidates.map((position) => patternPenalty(singleHistory, position, 4)),
      );
      const eligible = candidates.filter(
        (position) => patternPenalty(singleHistory, position, 4) === lowestPenalty,
      );
      const position = weightedChoice(
        eligible,
        (candidate) => 1 / (1 + targetCounts[candidate]! * 0.65),
        random,
      );
      targets.set(question.questionVersionId, [position]);
      singleHistory.push(position);
      targetCounts[position] = targetCounts[position]! + 1;
      singleCounts.set(optionCount, targetCounts);
    } else {
      const key = `${optionCount}:${correctOptionIds.length}`;
      const history = multipleHistory.get(key) ?? [];
      const candidates = combinations(optionCount, correctOptionIds.length, random);
      const last = history.at(-1);
      const nonRepeating = candidates.filter(
        (candidate) => !last || candidate.some((position, index) => position !== last[index]),
      );
      const eligible = nonRepeating.length > 0 ? nonRepeating : candidates;
      const positions = weightedChoice(
        eligible,
        (candidate) => {
          const frequency = candidate.reduce((sum, position) => sum + targetCounts[position]!, 0);
          return 1 / (1 + frequency * 0.45);
        },
        random,
      );
      targets.set(question.questionVersionId, positions);
      history.push(positions);
      for (const position of positions) targetCounts[position] = targetCounts[position]! + 1;
      multipleHistory.set(key, history);
      multipleCounts.set(optionCount, targetCounts);
    }
  }

  for (const { question, options, correctOptionIds } of valid) {
    const target = targets.get(question.questionVersionId);
    if (!target) continue;
    outputs.set(
      question.questionVersionId,
      reorderAtPositions(
        options,
        correctOptionIds,
        target,
        sessionKey,
        question.questionVersionId,
        entropyKey,
      ) as Prisma.JsonValue | null,
    );
  }
  return outputs;
}
