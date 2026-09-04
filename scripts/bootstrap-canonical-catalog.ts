import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  CANONICAL_CATALOG_MANIFEST,
  validateFirstRealPackCanonicalCatalogManifest,
  type CanonicalCatalogManifest,
} from "../src/curriculum/canonical-catalog.js";
import {
  applyCanonicalCatalogBootstrap,
  planCanonicalCatalogBootstrap,
  type CanonicalCatalogSnapshot,
} from "../src/curriculum/canonical-catalog-bootstrap.js";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
  type CatalogDbIdentity,
  type CatalogTarget,
} from "../src/curriculum/catalog-target-verification.js";

const STAGING_WRITE_CONFIRMATION = "I_HAVE_VERIFIED_8G8_CATALOG_STAGING_TARGET";
const PRODUCTION_WRITE_CONFIRMATION = "I_HAVE_VERIFIED_8G8_CATALOG_PRODUCTION_TARGET";
const EDITORIAL_APPROVAL = "I_HAVE_APPROVED_8G8_CANONICAL_CATALOG";

const args = new Set(process.argv.slice(2));
const isValidateOnly = args.has("--validate-only");
const isDryRun = args.has("--dry-run");
const isApply = args.has("--apply");

type Environment = "STAGING" | "PRODUCTION";

type Target = Omit<CatalogTarget, "environment"> & { environment: Environment };
type Identity = CatalogDbIdentity;
type CatalogSnapshot = CanonicalCatalogSnapshot;

function fail(message: string): never {
  throw new Error(`canonical catalog bootstrap reddedildi: ${message}`);
}

function assertMode(): void {
  const modeCount = [isValidateOnly, isDryRun, isApply].filter(Boolean).length;
  if (modeCount !== 1) {
    fail("tam olarak bir mod seçilmeli: --validate-only, --dry-run veya --apply");
  }
}

function readTarget(): Target {
  const rawUrl = process.env.CANONICAL_CATALOG_DATABASE_URL?.trim();
  if (!rawUrl) fail("CANONICAL_CATALOG_DATABASE_URL verilmedi; DATABASE_URL fallback'i yok");

  const environment = process.env.CANONICAL_CATALOG_ENVIRONMENT?.trim().toUpperCase();
  if (environment !== "STAGING" && environment !== "PRODUCTION") {
    fail("CANONICAL_CATALOG_ENVIRONMENT STAGING veya PRODUCTION olmalı");
  }

  let target: Target;
  try {
    target = parseCatalogTargetUrl(rawUrl, environment as Environment) as Target;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const expectedDatabase = process.env.CANONICAL_CATALOG_EXPECTED_DATABASE?.trim();
  if (!expectedDatabase) {
    fail("CANONICAL_CATALOG_EXPECTED_DATABASE açıkça verilmelidir");
  }
  if (expectedDatabase !== target.database) {
    fail(
      `URL database ile beklenen database eşleşmiyor: ${target.database} !== ${expectedDatabase}`,
    );
  }
  try {
    assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (isApply) {
    const expectedConfirmation =
      environment === "STAGING" ? STAGING_WRITE_CONFIRMATION : PRODUCTION_WRITE_CONFIRMATION;
    if (process.env.CANONICAL_CATALOG_ALLOW_WRITE !== expectedConfirmation) {
      fail(`yazma onayı için CANONICAL_CATALOG_ALLOW_WRITE=${expectedConfirmation} gerekli`);
    }
    if (process.env.CANONICAL_CATALOG_EDITORIAL_APPROVAL !== EDITORIAL_APPROVAL) {
      fail(
        `editorial onay için CANONICAL_CATALOG_EDITORIAL_APPROVAL=${EDITORIAL_APPROVAL} gerekli`,
      );
    }
    if (
      environment === "PRODUCTION" &&
      process.env.CANONICAL_CATALOG_PRODUCTION_APPROVAL !==
        "I_HAVE_APPROVED_8G8_CANONICAL_CATALOG_PRODUCTION"
    ) {
      fail(
        "production için CANONICAL_CATALOG_PRODUCTION_APPROVAL=I_HAVE_APPROVED_8G8_CANONICAL_CATALOG_PRODUCTION gerekli",
      );
    }
  }

  return target;
}

function safeTarget(target: Target, identity?: Identity): Record<string, unknown> {
  return {
    environment: target.environment,
    provider: target.provider,
    host: target.host,
    port: target.port,
    database: identity?.database ?? target.database,
    user: identity?.db_user ?? "<not-connected>",
  };
}

async function readIdentity(prisma: PrismaClient): Promise<Identity> {
  const rows = await prisma.$queryRawUnsafe<Identity[]>(
    "select current_database() as database, current_user as db_user",
  );
  const identity = rows[0];
  if (!identity) fail("database identity okunamadı");
  return identity;
}

function assertIdentity(target: Target, identity: Identity): void {
  try {
    assertLiveCatalogTargetIdentity(target, identity);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function assertManifestReady(): CanonicalCatalogManifest {
  const manifest = validateFirstRealPackCanonicalCatalogManifest(CANONICAL_CATALOG_MANIFEST);
  if (manifest.lifecycle !== "ACTIVE") {
    fail("pilot canonical catalog manifest ACTIVE değil");
  }
  return manifest;
}

async function readSnapshot(
  prisma: PrismaClient,
  manifest: CanonicalCatalogManifest,
): Promise<CatalogSnapshot> {
  const expectedLevel = manifest.levels[0]!;
  const skillCodes = manifest.skills.map((skill) => skill.code);
  const [level, skills] = await Promise.all([
    prisma.level.findUnique({
      where: { code: expectedLevel.code },
      select: {
        id: true,
        code: true,
        name: true,
        minScore: true,
        maxScore: true,
        gradeBand: true,
        difficultyMin: true,
        difficultyMax: true,
        displayOrder: true,
      },
    }),
    prisma.skill.findMany({
      where: { code: { in: skillCodes } },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        description: true,
        displayOrder: true,
      },
    }),
  ]);
  return { level, skills };
}

function validateSnapshot(manifest: CanonicalCatalogManifest, snapshot: CatalogSnapshot): void {
  const plan = planCanonicalCatalogBootstrap(manifest, snapshot);
  if (plan.action === "CONFLICT") fail(plan.conflicts.join("; "));
  if (plan.action !== "NOOP") {
    fail("bootstrap doğrulaması tamamlanmadı; canonical kayıtların tamamı mevcut değil");
  }
}

async function main(): Promise<void> {
  assertMode();
  const manifest = assertManifestReady();

  if (isValidateOnly) {
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: "VALIDATE_ONLY",
          manifestId: manifest.manifestId,
          manifestVersion: manifest.manifestVersion,
          levelCount: manifest.levels.length,
          skillCount: manifest.skills.length,
          packBindings: manifest.packBindings,
          dbChanged: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const target = readTarget();
  const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    assertIdentity(target, identity);
    try {
      assertApprovedTargetFingerprint(
        target,
        identity,
        process.env.CANONICAL_CATALOG_APPROVED_TARGET_FINGERPRINT,
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    const snapshot = await readSnapshot(prisma, manifest);
    const plan = planCanonicalCatalogBootstrap(manifest, snapshot);
    if (plan.action === "CONFLICT") {
      console.log(
        JSON.stringify(
          {
            status: "BLOCKED",
            mode: isDryRun ? "DRY_RUN" : "APPLY",
            target: safeTarget(target, identity),
            action: plan.action,
            conflicts: plan.conflicts,
            dbChanged: false,
          },
          null,
          2,
        ),
      );
      fail(plan.conflicts.join("; "));
    }

    if (isDryRun || plan.action === "NOOP") {
      console.log(
        JSON.stringify(
          {
            status: "PASS",
            mode: isDryRun ? "DRY_RUN" : "NOOP",
            target: safeTarget(target, identity),
            action: plan.action,
            missingLevel: plan.missingLevel,
            missingSkills: plan.missingSkills,
            manifestId: manifest.manifestId,
            dbChanged: false,
          },
          null,
          2,
        ),
      );
      return;
    }

    const created = await applyCanonicalCatalogBootstrap(prisma, manifest, snapshot);
    const after = await readSnapshot(prisma, manifest);
    validateSnapshot(manifest, after);
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: "APPLY",
          target: safeTarget(target, identity),
          action: plan.action,
          created,
          dbChanged: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    `canonical catalog bootstrap FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
