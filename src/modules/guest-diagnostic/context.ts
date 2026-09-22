import { createHash, randomBytes, randomUUID } from "node:crypto";

import { PrismaClient, type Prisma } from "@prisma/client";

export type GuestDiagnosticOperation =
  "LOOKUP" | "CREATE" | "READ" | "ANSWER" | "COMPLETE" | "EXPIRE";

type GuestTransaction = Prisma.TransactionClient;

type GuestRoleRow = {
  role_name: string;
  is_superuser: boolean;
  has_bypassrls: boolean;
};

type GuestSessionRow = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED" | "EXPIRED";
  expiresAt: Date;
};

export class GuestDiagnosticSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuestDiagnosticSecurityError";
  }
}

/**
 * A session object is created only after the restricted connection has looked
 * up an active session by its server-derived token hash. Its private
 * constructor prevents callers from manufacturing a context from a raw
 * client-supplied session ID.
 */
export interface ValidatedGuestSession {
  readonly id: string;
  readonly expiresAt: Date;
}

const validatedGuestSessions = new WeakSet<object>();

function createValidatedGuestSession(
  row: GuestSessionRow,
  allowCompleted = false,
): ValidatedGuestSession {
  if (
    (!allowCompleted && row.status !== "IN_PROGRESS") ||
    (allowCompleted && !["IN_PROGRESS", "COMPLETED"].includes(row.status)) ||
    row.expiresAt.getTime() <= Date.now()
  ) {
    throw new GuestDiagnosticSecurityError("Guest session is not active");
  }

  const session = Object.freeze({ id: row.id, expiresAt: row.expiresAt });
  validatedGuestSessions.add(session);
  return session;
}

const globalForGuestPrisma = globalThis as unknown as {
  guestPrisma?: PrismaClient;
  guestDatabaseIdentity?: string;
};

function databaseIdentity(rawUrl: string): string {
  const url = new URL(rawUrl);
  return [
    url.protocol,
    decodeURIComponent(url.username),
    url.hostname.toLowerCase(),
    url.port || (url.protocol === "postgres:" || url.protocol === "postgresql:" ? "5432" : ""),
    url.pathname,
  ].join("|");
}

export function guestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const rawUrl = env.GUEST_DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new GuestDiagnosticSecurityError(
      "GUEST_DATABASE_URL is required; the BYPASSRLS DATABASE_URL cannot be used for guest data",
    );
  }

  let guestIdentity: string;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }
    guestIdentity = databaseIdentity(rawUrl);
  } catch {
    throw new GuestDiagnosticSecurityError("GUEST_DATABASE_URL must be a PostgreSQL URL");
  }

  const primaryUrl = env.DATABASE_URL?.trim();
  if (primaryUrl) {
    try {
      if (guestIdentity === databaseIdentity(primaryUrl)) {
        throw new GuestDiagnosticSecurityError(
          "GUEST_DATABASE_URL must target a separate restricted database role",
        );
      }
    } catch (error) {
      if (error instanceof GuestDiagnosticSecurityError) throw error;
      // An invalid primary URL is handled by the normal application config;
      // it must not make this helper silently fall back to that URL.
    }
  }

  return rawUrl;
}

export function getGuestDbClient(env: NodeJS.ProcessEnv = process.env): PrismaClient {
  const rawUrl = guestDatabaseUrl(env);
  const identity = databaseIdentity(rawUrl);

  if (globalForGuestPrisma?.guestPrisma) {
    if (globalForGuestPrisma.guestDatabaseIdentity !== identity) {
      throw new GuestDiagnosticSecurityError(
        "Guest database client identity cannot change during process lifetime",
      );
    }
    return globalForGuestPrisma.guestPrisma;
  }

  const client = new PrismaClient({ datasources: { db: { url: rawUrl } } });
  globalForGuestPrisma.guestPrisma = client;
  globalForGuestPrisma.guestDatabaseIdentity = identity;
  return client;
}

/** Repository convention: high-entropy tokens are persisted as SHA-256 hashes. */
export function hashGuestToken(token: string): string {
  if (!token.trim()) {
    throw new GuestDiagnosticSecurityError("Guest token is required");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

async function assertRestrictedDatabaseRole(tx: GuestTransaction): Promise<void> {
  const rows = await tx.$queryRaw<GuestRoleRow[]>`
    SELECT current_user::text AS role_name,
           rol.rolsuper AS is_superuser,
           rol.rolbypassrls AS has_bypassrls
    FROM pg_catalog.pg_roles AS rol
    WHERE rol.rolname = current_user
  `;
  const role = rows[0];

  if (!role || role.is_superuser || role.has_bypassrls) {
    throw new GuestDiagnosticSecurityError(
      "Guest database connection must use a non-superuser role without BYPASSRLS",
    );
  }
}

async function setGuestContext(
  tx: GuestTransaction,
  sessionId: string,
  operation: GuestDiagnosticOperation,
): Promise<void> {
  await tx.$executeRaw`
    SELECT set_config('app.guest_session_id', ${sessionId}, true)
  `;
  await tx.$executeRaw`
    SELECT set_config('app.guest_operation', ${operation}, true)
  `;
}

async function setGuestTokenLookupContext(tx: GuestTransaction, tokenHash: string): Promise<void> {
  await tx.$executeRaw`
    SELECT set_config('app.guest_token_hash', ${tokenHash}, true)
  `;
  await tx.$executeRaw`
    SELECT set_config('app.guest_operation', 'LOOKUP', true)
  `;
}

async function clearGuestTokenLookupContext(tx: GuestTransaction): Promise<void> {
  await tx.$executeRaw`
    SELECT set_config('app.guest_token_hash', '', true)
  `;
}

/**
 * Establishes the CREATE context for a brand-new session. The session ID is
 * generated inside this server-side boundary and is never accepted from the
 * request. The caller must insert the session row and its snapshot records in
 * the callback while the same transaction-local context is active.
 */
export async function withNewGuestSessionContext<T>(
  expiresAt: Date,
  callback: (tx: GuestTransaction, session: ValidatedGuestSession) => Promise<T>,
  client: PrismaClient = getGuestDbClient(),
): Promise<T> {
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new GuestDiagnosticSecurityError("Guest session expiry must be in the future");
  }

  const sessionId = randomUUID();
  return client.$transaction(async (tx) => {
    await assertRestrictedDatabaseRole(tx);
    await setGuestContext(tx, sessionId, "CREATE");
    const session = createValidatedGuestSession({
      id: sessionId,
      status: "IN_PROGRESS",
      expiresAt,
    });
    return callback(tx, session);
  });
}

/**
 * Runs a callback under a transaction-local guest session context. The
 * session object must have been produced by withGuestSessionContext; callers
 * cannot manufacture it from an HTTP session ID.
 */
export async function withGuestDbContext<T>(
  session: ValidatedGuestSession,
  operation: GuestDiagnosticOperation,
  callback: (tx: GuestTransaction) => Promise<T>,
  client: PrismaClient = getGuestDbClient(),
): Promise<T> {
  if (!validatedGuestSessions.has(session) || session.expiresAt.getTime() <= Date.now()) {
    throw new GuestDiagnosticSecurityError("Guest session has expired");
  }

  return client.$transaction(async (tx) => {
    await assertRestrictedDatabaseRole(tx);
    await setGuestContext(tx, session.id, operation);
    return callback(tx);
  });
}

/**
 * Server-side credential boundary for future Guest Diagnostic routes.
 * The raw token is hashed before the lookup; the resulting session ID comes
 * only from the database row and is then placed in the transaction-local GUC.
 */
export async function withGuestSessionContext<T>(
  token: string,
  operation: GuestDiagnosticOperation,
  callback: (tx: GuestTransaction, session: ValidatedGuestSession) => Promise<T>,
  client: PrismaClient = getGuestDbClient(),
): Promise<T> {
  const tokenHash = hashGuestToken(token);

  return client.$transaction(async (tx) => {
    await assertRestrictedDatabaseRole(tx);
    await setGuestTokenLookupContext(tx, tokenHash);

    const rows = await tx.$queryRaw<GuestSessionRow[]>`
      SELECT "id", "status", "expiresAt"
      FROM "GuestDiagnosticSession"
      WHERE "tokenHash" = ${tokenHash}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      throw new GuestDiagnosticSecurityError("Guest session was not found");
    }

    const session = createValidatedGuestSession(row, operation === "READ");
    await clearGuestTokenLookupContext(tx);
    await setGuestContext(tx, session.id, operation);
    return callback(tx, session);
  });
}
