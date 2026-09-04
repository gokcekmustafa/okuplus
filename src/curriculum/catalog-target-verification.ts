import { createHash } from "node:crypto";

export type CatalogTargetEnvironment = "TEST" | "STAGING" | "PRODUCTION";
export type CatalogTargetProvider = "NEON" | "POSTGRES";

export type CatalogTarget = {
  environment: CatalogTargetEnvironment;
  url: string;
  host: string;
  port: string;
  database: string;
  user: string;
  provider: CatalogTargetProvider;
};

export type CatalogDbIdentity = {
  database: string;
  db_user: string;
};

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

function decodeUrlPart(value: string, label: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`${label} URL encoding'i geçerli değil`);
  }
}

function parseDatabaseName(parsed: URL): string {
  const database = decodeUrlPart(
    parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "",
    "database",
  );
  if (!database) throw new Error("hedef database adı boş");
  return database;
}

/**
 * The hostname in a Neon pooled URL is the endpoint identity. The server
 * address returned by inet_server_addr() is deliberately not part of this
 * contract because it may be a PgBouncer/backend loopback address.
 */
export function parseCatalogTargetUrl(
  rawUrl: string,
  environment: CatalogTargetEnvironment,
): CatalogTarget {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("hedef URL geçerli değil");
  }
  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("hedef URL PostgreSQL olmalı");
  }
  if (!parsed.hostname) throw new Error("hedef URL hostname içermeli");
  if (!parsed.username) throw new Error("hedef URL kullanıcı adı içermeli");

  const database = parseDatabaseName(parsed);
  const host = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  return {
    environment,
    url: rawUrl,
    host,
    port: parsed.port || "5432",
    database,
    user: decodeUrlPart(parsed.username, "kullanıcı adı"),
    provider: /(?:^|\.)neon\.tech$/iu.test(host) ? "NEON" : "POSTGRES",
  };
}

export function targetFingerprint(
  target: Pick<CatalogTarget, "environment" | "host" | "port" | "provider">,
  identity: CatalogDbIdentity,
): string {
  const canonicalIdentity = [
    "oku-catalog-target-v1",
    target.environment,
    target.provider,
    target.host.toLowerCase().replace(/\.$/u, ""),
    target.port,
    identity.database,
    identity.db_user,
  ].join("\n");
  return createHash("sha256").update(canonicalIdentity, "utf8").digest("hex");
}

export function assertApprovedTargetFingerprint(
  target: Pick<CatalogTarget, "environment" | "host" | "port" | "provider">,
  identity: CatalogDbIdentity,
  approvedFingerprint: string | undefined,
): void {
  const expected = approvedFingerprint?.trim().toLowerCase();
  if (!expected || !/^[a-f0-9]{64}$/u.test(expected)) {
    throw new Error(
      "bağımsız approved target fingerprint gerekli (64 karakterlik lowercase SHA-256)",
    );
  }
  const actual = targetFingerprint(target, identity);
  if (actual !== expected) {
    throw new Error("approved target fingerprint hedef URL ile eşleşmiyor");
  }
}

export function assertCatalogEnvironmentSafety(
  target: Pick<CatalogTarget, "environment" | "host" | "database">,
  options: { rejectTestDatabase: boolean },
): void {
  if (options.rejectTestDatabase && /test|fixture/iu.test(target.database)) {
    throw new Error(`canonical catalog TEST/fixture database hedefleyemez: ${target.database}`);
  }
  if (
    target.environment === "STAGING" &&
    /prod(?:uction)?/iu.test(`${target.host}/${target.database}`)
  ) {
    throw new Error(
      `STAGING ortamı production işaretli hedefi kabul etmez: ${target.host}/${target.database}`,
    );
  }
}

export function assertLiveCatalogTargetIdentity(
  target: Pick<CatalogTarget, "database" | "user">,
  identity: CatalogDbIdentity,
): void {
  if (identity.database !== target.database) {
    throw new Error(
      `connection database doğrulaması başarısız: beklenen=${target.database}, gerçek=${identity.database}`,
    );
  }
  if (identity.db_user !== target.user) {
    throw new Error(
      `connection user doğrulaması başarısız: beklenen=${target.user}, gerçek=${identity.db_user}`,
    );
  }
}
