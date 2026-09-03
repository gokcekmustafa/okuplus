import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  catalogFixtureReason,
  classifyCatalogRecord,
  type CatalogRecordIdentity,
} from "../src/curriculum/catalog-validation.js";

const QA_ENVIRONMENT = "TEST";
const QA_DATABASE = "oku_plus_test";
const QA_HOST = "127.0.0.1";
const QA_PORT = "5432";

type Identity = {
  database: string;
  db_user: string;
  host: string | null;
  port: number | null;
};

type CatalogRow = CatalogRecordIdentity & {
  category?: string;
};

function fail(message: string): never {
  throw new Error(`8G-9B fixture QA reddedildi: ${message}`);
}

function normalizeHost(value: string | null): string {
  return (value ?? "").replace(/\/\d+$/u, "").toLowerCase();
}

function parseTarget(): string {
  if (process.env.CURRICULUM_FIXTURE_QA_ENVIRONMENT?.trim().toUpperCase() !== QA_ENVIRONMENT) {
    fail("CURRICULUM_FIXTURE_QA_ENVIRONMENT=TEST açıkça verilmelidir");
  }
  const rawUrl = process.env.CURRICULUM_FIXTURE_QA_DATABASE_URL?.trim();
  if (!rawUrl) fail("CURRICULUM_FIXTURE_QA_DATABASE_URL verilmedi; fallback yok");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("fixture QA database URL'i geçerli değil");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== QA_HOST ||
    (parsed.port || QA_PORT) !== QA_PORT ||
    database !== QA_DATABASE
  ) {
    fail(`fixture QA yalnızca ${QA_HOST}:${QA_PORT}/${QA_DATABASE} hedefini okuyabilir`);
  }
  return rawUrl;
}

async function readIdentity(prisma: PrismaClient): Promise<Identity> {
  const rows = await prisma.$queryRawUnsafe<Identity[]>(
    "select current_database() as database, current_user as db_user, inet_server_addr()::text as host, inet_server_port() as port",
  );
  const identity = rows[0];
  if (!identity) fail("database identity okunamadı");
  if (
    identity.database !== QA_DATABASE ||
    normalizeHost(identity.host) !== QA_HOST ||
    String(identity.port) !== QA_PORT
  ) {
    fail(`connection identity TEST hedefi değil: ${JSON.stringify(identity)}`);
  }
  return identity;
}

function fixtureRows(rows: CatalogRow[]): CatalogRow[] {
  return rows.filter((row) => classifyCatalogRecord(row) === "TEST_FIXTURE");
}

async function main(): Promise<void> {
  const url = parseTarget();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    const [levels, skills] = await Promise.all([
      prisma.level.findMany({
        orderBy: { displayOrder: "asc" },
        select: { id: true, code: true, name: true },
      }),
      prisma.skill.findMany({
        orderBy: { displayOrder: "asc" },
        select: { id: true, code: true, name: true, category: true },
      }),
    ]);
    const allRows = [...levels, ...skills];
    const fixtureLevels = fixtureRows(levels);
    const fixtureSkills = fixtureRows(skills);
    const unclassified = allRows.filter((row) => classifyCatalogRecord(row) !== "TEST_FIXTURE");
    const errors: string[] = [];
    if (levels.length === 0) errors.push("TEST'te Level fixture kaydı yok");
    if (skills.length === 0) errors.push("TEST'te Skill fixture kaydı yok");
    if (fixtureLevels.length !== levels.length) {
      errors.push(`Level fixture sınıflandırması eksik: ${fixtureLevels.length}/${levels.length}`);
    }
    if (fixtureSkills.length !== skills.length) {
      errors.push(`Skill fixture sınıflandırması eksik: ${fixtureSkills.length}/${skills.length}`);
    }
    if (unclassified.length > 0) {
      errors.push(
        `fixture olmayan catalog kaydı bulundu: ${unclassified.map((row) => row.code).join(", ")}`,
      );
    }
    const status = errors.length > 0 ? "FAIL" : "PASS";
    console.log(
      JSON.stringify(
        {
          status,
          scope: "TEST_FIXTURE_READ_ONLY",
          target: { environment: QA_ENVIRONMENT, ...identity },
          counts: {
            level: levels.length,
            skill: skills.length,
            fixtureLevel: fixtureLevels.length,
            fixtureSkill: fixtureSkills.length,
            unclassified: unclassified.length,
          },
          fixtureCatalog: {
            levels: fixtureLevels.map((row) => ({
              id: row.id,
              code: row.code,
              name: row.name,
              reason: catalogFixtureReason(row),
            })),
            skills: fixtureSkills.map((row) => ({
              id: row.id,
              code: row.code,
              name: row.name,
              reason: catalogFixtureReason(row),
            })),
          },
          productionCatalog: "NOT_EVALUATED_BY_FIXTURE_QA",
          errors,
          productionWrite: "NO",
        },
        null,
        2,
      ),
    );
    if (status === "FAIL") process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`8G-9B fixture QA FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
