export type MigrationFailure = {
  name: string;
  rolledBack: boolean;
};

export type MigrationRecord = {
  id: string;
  migrationName: string;
  checksum: string;
  startedAt: string | null;
  finishedAt: string | null;
  rolledBackAt: string | null;
  appliedStepsCount: number;
  logs: "PRESENT" | "NONE";
};

export type ApprovedHistoricalMigration = {
  name: string;
  checksum: string;
};

export type MigrationHealth = {
  repositoryMigrationNames: string[];
  activeAppliedMigrationNames: string[];
  rolledBackMigrationNames: string[];
  unresolvedFailedMigrationNames: string[];
  incompleteMigrationNames: string[];
  historicalRolledBackMigrationNames: string[];
  unresolvedRolledBackMigrationNames: string[];
  missingFromDb: string[];
  extraActiveInDb: string[];
  approvedHistoricalActiveMigrationNames: string[];
  unexpectedActiveMigrationNames: string[];
  duplicateActiveNames: string[];
};

export type MigrationGateInput = {
  health: MigrationHealth;
  pendingMigrations: readonly string[];
  allowedPendingMigrations: readonly string[];
  requireNoPending: boolean;
  fingerprintPass: boolean;
  identityPass: boolean;
  prismaStatusCurrent: boolean;
  schemaDiffClean: boolean;
};

export type MigrationGateResult = {
  pass: boolean;
  checks: Record<string, boolean>;
  failedChecks: string[];
  unexpectedPendingMigrations: string[];
};

export type MigrationFailureClassification = {
  historicalRolledBackMigrations: MigrationFailure[];
  unresolvedFailedMigrations: MigrationFailure[];
};

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

export function isMigrationRecord(value: unknown): value is MigrationRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MigrationRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.migrationName === "string" &&
    typeof record.checksum === "string" &&
    (record.startedAt === null || typeof record.startedAt === "string") &&
    (record.finishedAt === null || typeof record.finishedAt === "string") &&
    (record.rolledBackAt === null || typeof record.rolledBackAt === "string") &&
    typeof record.appliedStepsCount === "number" &&
    Number.isInteger(record.appliedStepsCount) &&
    (record.logs === "PRESENT" || record.logs === "NONE")
  );
}

/**
 * Normalizes Prisma migration rows into a name-set health view.
 * A rolled-back row is historical only when an active applied sibling exists.
 * The row itself never contributes to activeAppliedMigrationNames.
 */
export function evaluateMigrationHealth(
  rows: readonly MigrationRecord[],
  repositoryMigrationNames: readonly string[],
  approvedHistoricalMigrations: readonly ApprovedHistoricalMigration[] = [],
): MigrationHealth {
  const repositoryNames = uniqueSorted(repositoryMigrationNames);
  const repositoryNameSet = new Set(repositoryNames);
  const approvedHistoricalChecksums = new Map(
    approvedHistoricalMigrations.map((migration) => [migration.name, migration.checksum]),
  );
  const activeAppliedRows = rows.filter(
    (row) => row.finishedAt !== null && row.rolledBackAt === null,
  );
  const activeAppliedNames = uniqueSorted(activeAppliedRows.map((row) => row.migrationName));
  const activeAppliedNameSet = new Set(activeAppliedNames);
  const rolledBackRows = rows.filter((row) => row.rolledBackAt !== null);
  const rolledBackNames = uniqueSorted(rolledBackRows.map((row) => row.migrationName));
  const incompleteNames = uniqueSorted(
    rows
      .filter((row) => row.finishedAt === null && row.rolledBackAt === null)
      .map((row) => row.migrationName),
  );
  const historicalRolledBackNames = rolledBackNames.filter((name) =>
    activeAppliedNameSet.has(name),
  );
  const unresolvedRolledBackNames = rolledBackNames.filter(
    (name) => !activeAppliedNameSet.has(name),
  );
  const unresolvedFailedNames = uniqueSorted([...incompleteNames, ...unresolvedRolledBackNames]);
  const activeCounts = new Map<string, number>();
  for (const row of activeAppliedRows) {
    activeCounts.set(row.migrationName, (activeCounts.get(row.migrationName) ?? 0) + 1);
  }
  const duplicateActiveNames = uniqueSorted(
    [...activeCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name),
  );
  const missingFromDb = repositoryNames.filter((name) => !activeAppliedNameSet.has(name));
  const extraActiveInDb = activeAppliedNames.filter((name) => !repositoryNameSet.has(name));
  const approvedHistoricalActiveNames = extraActiveInDb.filter((name) => {
    const expectedChecksum = approvedHistoricalChecksums.get(name);
    const activeRowsForName = activeAppliedRows.filter((row) => row.migrationName === name);
    return (
      expectedChecksum !== undefined &&
      activeRowsForName.length > 0 &&
      activeRowsForName.every((row) => row.checksum === expectedChecksum)
    );
  });
  const unexpectedActiveNames = extraActiveInDb.filter(
    (name) => !approvedHistoricalActiveNames.includes(name),
  );

  return {
    repositoryMigrationNames: repositoryNames,
    activeAppliedMigrationNames: activeAppliedNames,
    rolledBackMigrationNames: rolledBackNames,
    unresolvedFailedMigrationNames: unresolvedFailedNames,
    incompleteMigrationNames: incompleteNames,
    historicalRolledBackMigrationNames: historicalRolledBackNames,
    unresolvedRolledBackMigrationNames: unresolvedRolledBackNames,
    missingFromDb,
    extraActiveInDb,
    approvedHistoricalActiveMigrationNames: approvedHistoricalActiveNames,
    unexpectedActiveMigrationNames: unexpectedActiveNames,
    duplicateActiveNames,
  };
}

/**
 * Applies the migration safety gate without comparing row counts.
 * Pending migrations are permitted only in the explicit precondition policy.
 */
export function evaluateMigrationGate(input: MigrationGateInput): MigrationGateResult {
  const allowedPendingNames = new Set(input.allowedPendingMigrations);
  const unexpectedPendingMigrations = input.pendingMigrations.filter(
    (name) => !allowedPendingNames.has(name),
  );
  const checks = {
    fingerprint: input.fingerprintPass,
    identity: input.identityPass,
    prismaStatusCurrent: input.prismaStatusCurrent,
    noPendingMigrations: !input.requireNoPending || input.pendingMigrations.length === 0,
    noUnresolvedFailedMigrations: input.health.unresolvedFailedMigrationNames.length === 0,
    pendingMigrationsAllowed: input.requireNoPending
      ? input.pendingMigrations.length === 0
      : unexpectedPendingMigrations.length === 0,
    noMissingMigrations: input.requireNoPending
      ? input.health.missingFromDb.length === 0
      : input.pendingMigrations.every((name) => input.health.missingFromDb.includes(name)),
    noUnexpectedActiveMigrations: input.health.unexpectedActiveMigrationNames.length === 0,
    noDuplicateActiveMigrations: input.health.duplicateActiveNames.length === 0,
    schemaDiffClean: input.schemaDiffClean,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  return {
    pass: failedChecks.length === 0,
    checks,
    failedChecks,
    unexpectedPendingMigrations,
  };
}

export function classifyMigrationFailures(
  failedMigrations: readonly MigrationFailure[],
  pendingMigrations: readonly string[],
  repositoryMigrationNames: ReadonlySet<string>,
  activeAppliedMigrationNames?: ReadonlySet<string>,
): MigrationFailureClassification {
  const historicalRolledBackMigrations: MigrationFailure[] = [];
  const unresolvedFailedMigrations: MigrationFailure[] = [];

  const activeNames =
    activeAppliedMigrationNames ??
    new Set([...repositoryMigrationNames].filter((name) => !pendingMigrations.includes(name)));

  for (const migration of failedMigrations) {
    const hasActiveAppliedSibling =
      migration.rolledBack &&
      repositoryMigrationNames.has(migration.name) &&
      activeNames.has(migration.name);

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
