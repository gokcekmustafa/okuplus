import type { Prisma } from "@prisma/client";

type SessionOption = {
  id: string;
  [key: string]: unknown;
};

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
