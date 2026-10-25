export function createForegroundReadingTimer(clock = () => performance.now()) {
  let accumulatedMs = 0;
  let startedAt = null;
  let finished = false;

  function pause() {
    if (startedAt === null) return;
    accumulatedMs += Math.max(0, clock() - startedAt);
    startedAt = null;
  }

  return {
    resume() {
      if (!finished && startedAt === null) startedAt = clock();
    },
    pause,
    elapsedMs() {
      return accumulatedMs + (startedAt === null ? 0 : Math.max(0, clock() - startedAt));
    },
    finish() {
      pause();
      finished = true;
      return Math.round(accumulatedMs);
    },
    isRunning() {
      return startedAt !== null;
    },
  };
}
