export type MigrationFailure = {
  name: string;
  rolledBack: boolean;
};

export type MigrationFailureClassification = {
  historicalRolledBackMigrations: MigrationFailure[];
  unresolvedFailedMigrations: MigrationFailure[];
};

export function classifyMigrationFailures(
  failedMigrations: readonly MigrationFailure[],
  pendingMigrations: readonly string[],
  repositoryMigrationNames: ReadonlySet<string>,
): MigrationFailureClassification {
  const historicalRolledBackMigrations: MigrationFailure[] = [];
  const unresolvedFailedMigrations: MigrationFailure[] = [];

  for (const migration of failedMigrations) {
    const hasActiveAppliedSibling =
      migration.rolledBack &&
      repositoryMigrationNames.has(migration.name) &&
      !pendingMigrations.includes(migration.name);

    if (hasActiveAppliedSibling) {
      historicalRolledBackMigrations.push(migration);
    } else {
      unresolvedFailedMigrations.push(migration);
    }
  }

  return { historicalRolledBackMigrations, unresolvedFailedMigrations };
}

export function classifyPendingMigrations(
  pendingMigrations: readonly string[],
  allowedPendingMigrations: ReadonlySet<string>,
) {
  return {
    allowedPendingMigrations: pendingMigrations.filter((name) =>
      allowedPendingMigrations.has(name),
    ),
    unexpectedPendingMigrations: pendingMigrations.filter(
      (name) => !allowedPendingMigrations.has(name),
    ),
  };
}
