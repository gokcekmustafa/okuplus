export const INDEPENDENT_TRAINING_SOURCE = "INDEPENDENT_TRAINING" as const;
export const LEARNING_PATH_REPLAY_SOURCE = "LEARNING_PATH_REPLAY" as const;

export function independentTrainingDeviceInfo(activityId?: string) {
  return {
    source: INDEPENDENT_TRAINING_SOURCE,
    ...(activityId ? { activityId } : {}),
  } as const;
}

export function isIndependentTrainingSession(deviceInfo: unknown): boolean {
  return (
    Boolean(deviceInfo) &&
    typeof deviceInfo === "object" &&
    !Array.isArray(deviceInfo) &&
    (deviceInfo as { source?: unknown }).source === INDEPENDENT_TRAINING_SOURCE
  );
}

export function learningPathReplayDeviceInfo() {
  return { source: LEARNING_PATH_REPLAY_SOURCE } as const;
}

export function isLearningPathReplaySession(deviceInfo: unknown): boolean {
  return (
    Boolean(deviceInfo) &&
    typeof deviceInfo === "object" &&
    !Array.isArray(deviceInfo) &&
    (deviceInfo as { source?: unknown }).source === LEARNING_PATH_REPLAY_SOURCE
  );
}
