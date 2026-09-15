export const MAX_TRAINING_ATTEMPTS_PER_QUESTION = 2;

export function assertTrainingAttemptAllowed(existingAttemptCount: number): void {
  if (!Number.isInteger(existingAttemptCount) || existingAttemptCount < 0) {
    throw new Error("Mevcut cevap sayısı geçersiz");
  }
  if (existingAttemptCount >= MAX_TRAINING_ATTEMPTS_PER_QUESTION) {
    throw new Error("Bu soruya en fazla iki kez cevap verilebilir");
  }
}
