import "dotenv/config";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { PrismaClient } from "@prisma/client";
import {
  assertCanonicalRuntimeMetadata,
  CANONICAL_CATALOG_MANIFEST,
  type CanonicalCatalogManifest,
} from "../src/curriculum/canonical-catalog.js";
import {
  applyCanonicalCatalogBootstrap,
  planCanonicalCatalogBootstrap,
  type CanonicalCatalogSnapshot,
} from "../src/curriculum/canonical-catalog-bootstrap.js";
import {
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
  targetFingerprint,
  type CatalogDbIdentity,
  type CatalogTarget,
} from "../src/curriculum/catalog-target-verification.js";
import { runFirstRealPackQa } from "../src/curriculum/first-real-pack-qa.js";
import { FIRST_REAL_CURRICULUM_PACK } from "../src/curriculum/first-real-pack.js";
import { catalogFixtureReason } from "../src/curriculum/catalog-validation.js";
import {
  assertIsolatedFirstRealPackTestTarget,
  ISOLATED_FIRST_REAL_PACK_TEST_DATABASE,
} from "./isolated-test-target.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACK_ID = FIRST_REAL_CURRICULUM_PACK.packId;
const LEVEL_CODE = "G8_12";
const SKILL_CODES = ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"] as const;
const EXPECTED_COUNTS = {
  content: 9,
  contentVersion: 9,
  question: 36,
  questionVersion: 36,
  exerciseTemplate: 9,
  exerciseTemplateVersion: 9,
  contentSkill: 9,
  templateContentRelation: 9,
  templateQuestionRelation: 36,
};

type Identity = CatalogDbIdentity & {
  server_addr: string | null;
  server_port: number | null;
};

type PackCounts = typeof EXPECTED_COUNTS;
type JsonRecord = Record<string, unknown>;
type CatalogSnapshot = CanonicalCatalogSnapshot;
type SeedPayload = JsonRecord & { status?: string; mode?: string };
type SeedRun = { exitCode: number; stdout: string; stderr: string; elapsedMs: number };

function fail(message: string): never {
  throw new Error(`isolated First Real Pack TEST harness FAIL: ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} object değil`);
  return value as JsonRecord;
}

function stableId(kind: string, slug: string, suffix = ""): string {
  return `8g8-${kind}-${slug}${suffix ? `-${suffix}` : ""}`;
}

function ids(): {
  contentIds: string[];
  contentVersionIds: string[];
  questionIds: string[];
  questionVersionIds: string[];
  templateIds: string[];
  templateVersionIds: string[];
} {
  const contentIds = FIRST_REAL_CURRICULUM_PACK.contents.map((item) =>
    stableId("content", item.slug),
  );
  const contentVersionIds = FIRST_REAL_CURRICULUM_PACK.contents.map((item) =>
    stableId("content-version", item.slug, "v1"),
  );
  const questionIds = FIRST_REAL_CURRICULUM_PACK.contents.flatMap((item) =>
    item.questions.map((_, index) => stableId("question", item.slug, String(index + 1))),
  );
  const questionVersionIds = FIRST_REAL_CURRICULUM_PACK.contents.flatMap((item) =>
    item.questions.map((_, index) => stableId("question-version", item.slug, `${index + 1}-v1`)),
  );
  const templateIds = FIRST_REAL_CURRICULUM_PACK.contents.map((item) =>
    stableId("template", item.slug),
  );
  const templateVersionIds = FIRST_REAL_CURRICULUM_PACK.contents.map((item) =>
    stableId("template-version", item.slug, "v1"),
  );
  return {
    contentIds,
    contentVersionIds,
    questionIds,
    questionVersionIds,
    templateIds,
    templateVersionIds,
  };
}

function parseLastJson(output: string): SeedPayload | null {
  const starts: number[] = [];
  const matcher = /(?:^|\r?\n)\{/gu;
  for (const match of output.matchAll(matcher)) {
    starts.push((match.index ?? 0) + match[0].lastIndexOf("{"));
  }
  const start = starts.at(-1);
  if (start === undefined) return null;
  try {
    return JSON.parse(output.slice(start).trim()) as SeedPayload;
  } catch {
    return null;
  }
}

function seedEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.DATABASE_URL;
  delete environment.DIRECT_DATABASE_URL;
  environment.CURRICULUM_PACK_DATABASE_URL = databaseUrl;
  environment.CURRICULUM_PACK_ENVIRONMENT = "TEST";
  environment.CURRICULUM_PACK_LEVEL_CODE = LEVEL_CODE;
  environment.CURRICULUM_PACK_SKILL_CODES = SKILL_CODES.join(",");
  environment.CURRICULUM_PACK_ALLOW_TEST_WRITE = "I_HAVE_VERIFIED_8G8_TEST_TARGET";
  environment.CURRICULUM_PACK_TEST_CANDIDATE_APPROVAL = "I_HAVE_APPROVED_8G8_TEST_CANDIDATE";
  environment.CURRICULUM_PACK_MEASURE_TIMING = "1";
  return environment;
}

async function runSeed(databaseUrl: string, args: string[]): Promise<SeedRun> {
  const command = process.execPath;
  const startedAt = performance.now();
  const child = spawn(
    command,
    [
      resolve(REPO_ROOT, "node_modules/tsx/dist/cli.mjs"),
      "scripts/seed-curriculum-pack.ts",
      "--isolated-test",
      ...args,
    ],
    { cwd: REPO_ROOT, env: seedEnvironment(databaseUrl), stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolveExit(code ?? 1));
  });
  return {
    exitCode,
    stdout,
    stderr,
    elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
  };
}

function seedError(run: SeedRun): string {
  const lines = `${run.stderr}\n${run.stdout}`.trim().split(/\r?\n/u).filter(Boolean);
  return lines.at(-1) ?? "seed sonucu ayrıntı vermedi";
}

function expectSeedPass(run: SeedRun, mode: string): SeedPayload {
  assert(run.exitCode === 0, `${mode} başarısız: ${seedError(run)}`);
  const payload = parseLastJson(run.stdout);
  assert(payload, `${mode} JSON sonucu okunamadı`);
  assert(payload.status === "PASS", `${mode} PASS değil`);
  assert(payload.mode === mode, `${mode} sonucu beklenen mode değil: ${String(payload.mode)}`);
  return payload;
}

async function readIdentity(prisma: PrismaClient): Promise<Identity> {
  const rows = await prisma.$queryRawUnsafe<Identity[]>(
    "select current_database() as database, current_user as db_user, inet_server_addr()::text as server_addr, inet_server_port() as server_port",
  );
  const identity = rows[0];
  if (!identity) fail("database identity okunamadı");
  return identity;
}

async function readMigrationState(
  prisma: PrismaClient,
): Promise<{ tableExists: boolean; total: number; unfinished: number }> {
  const tableRows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    "select to_regclass('public._prisma_migrations') is not null as exists",
  );
  const tableExists = tableRows[0]?.exists === true;
  if (!tableExists) return { tableExists: false, total: 0, unfinished: 0 };
  const [totalRows, unfinishedRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ count: number }>>(
      'select count(*)::int as count from public."_prisma_migrations"',
    ),
    prisma.$queryRawUnsafe<Array<{ count: number }>>(
      'select count(*)::int as count from public."_prisma_migrations" where finished_at is null and rolled_back_at is null',
    ),
  ]);
  return {
    tableExists,
    total: Number(totalRows[0]?.count ?? 0),
    unfinished: Number(unfinishedRows[0]?.count ?? 0),
  };
}

async function readCatalog(prisma: PrismaClient): Promise<CatalogSnapshot> {
  const [level, skills] = await Promise.all([
    prisma.level.findUnique({
      where: { code: LEVEL_CODE },
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
      where: { code: { in: [...SKILL_CODES] } },
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

async function assertCatalogState(
  prisma: PrismaClient,
  manifest: CanonicalCatalogManifest,
): Promise<CatalogSnapshot> {
  const [allLevels, allSkills, snapshot] = await Promise.all([
    prisma.level.findMany({ select: { id: true, code: true, name: true } }),
    prisma.skill.findMany({ select: { id: true, code: true, name: true } }),
    readCatalog(prisma),
  ]);
  const fixtures = [...allLevels, ...allSkills]
    .map((item) => catalogFixtureReason(item))
    .filter((reason): reason is string => reason !== null);
  assert(fixtures.length === 0, `fixture catalog bulundu: ${fixtures.join("; ")}`);
  assert(allLevels.length === manifest.levels.length, "beklenmeyen Level bulundu");
  assert(allSkills.length === manifest.skills.length, "beklenmeyen Skill bulundu");
  try {
    assertCanonicalRuntimeMetadata(manifest, snapshot.level, snapshot.skills);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  return snapshot;
}

async function readPackCounts(prisma: PrismaClient): Promise<PackCounts> {
  const pack = ids();
  const [
    content,
    contentVersion,
    question,
    questionVersion,
    exerciseTemplate,
    exerciseTemplateVersion,
    contentSkill,
    templateContentRelation,
    templateQuestionRelation,
  ] = await Promise.all([
    prisma.content.count({ where: { id: { in: pack.contentIds } } }),
    prisma.contentVersion.count({ where: { id: { in: pack.contentVersionIds } } }),
    prisma.question.count({ where: { id: { in: pack.questionIds } } }),
    prisma.questionVersion.count({ where: { id: { in: pack.questionVersionIds } } }),
    prisma.exerciseTemplate.count({ where: { id: { in: pack.templateIds } } }),
    prisma.exerciseTemplateVersion.count({ where: { id: { in: pack.templateVersionIds } } }),
    prisma.contentSkill.count({ where: { contentId: { in: pack.contentIds } } }),
    prisma.exerciseTemplateVersionContent.count({
      where: { templateVersionId: { in: pack.templateVersionIds } },
    }),
    prisma.exerciseTemplateVersionQuestion.count({
      where: { templateVersionId: { in: pack.templateVersionIds } },
    }),
  ]);
  return {
    content,
    contentVersion,
    question,
    questionVersion,
    exerciseTemplate,
    exerciseTemplateVersion,
    contentSkill,
    templateContentRelation,
    templateQuestionRelation,
  };
}

function assertCounts(actual: PackCounts, expected: PackCounts, label: string): void {
  for (const key of Object.keys(expected) as Array<keyof PackCounts>) {
    assert(actual[key] === expected[key], `${label} ${key}: ${actual[key]} !== ${expected[key]}`);
  }
}

async function assertPackEmpty(prisma: PrismaClient, label: string): Promise<PackCounts> {
  const counts = await readPackCounts(prisma);
  assert(
    Object.values(counts).every((value) => value === 0),
    `${label}: pack boş değil veya kısmi`,
  );
  return counts;
}

async function assertPackQuality(
  prisma: PrismaClient,
): Promise<{ sourceCount: number; warningCount: number }> {
  const manifestQa = runFirstRealPackQa();
  assert(manifestQa.errors.length === 0, `manifest QA: ${manifestQa.errors.join("; ")}`);
  const pack = ids();
  const [levels, skills, contents, templates] = await Promise.all([
    prisma.level.findMany({ select: { id: true, code: true, name: true } }),
    prisma.skill.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        description: true,
        displayOrder: true,
      },
    }),
    prisma.content.findMany({
      where: { id: { in: pack.contentIds } },
      select: {
        id: true,
        tenantId: true,
        title: true,
        status: true,
        currentVersionId: true,
        versions: {
          select: {
            id: true,
            version: true,
            title: true,
            body: true,
            wordCount: true,
            status: true,
          },
        },
        contentSkills: { select: { skillId: true, skill: { select: { code: true } } } },
        questions: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            contentId: true,
            position: true,
            type: true,
            skillId: true,
            status: true,
            versions: {
              select: {
                id: true,
                questionId: true,
                version: true,
                prompt: true,
                options: true,
                correctAnswer: true,
                status: true,
                publishedAt: true,
                generationMetadata: true,
              },
            },
          },
        },
      },
    }),
    prisma.exerciseTemplate.findMany({
      where: { id: { in: pack.templateIds } },
      select: {
        id: true,
        tenantId: true,
        skillId: true,
        contentId: true,
        config: true,
        status: true,
        versions: {
          select: {
            id: true,
            version: true,
            status: true,
            publishedAt: true,
            contents: { select: { contentVersionId: true, position: true } },
            questions: {
              orderBy: { position: "asc" },
              select: { questionVersionId: true, questionId: true, position: true },
            },
          },
        },
      },
    }),
  ]);
  assert(levels.length === 1 && levels[0]?.code === LEVEL_CODE, "Level binding exact değil");
  assert(skills.length === 3, "Skill count exact değil");
  const skillByCode = new Map(skills.map((skill) => [skill.code, skill]));
  const contentById = new Map(contents.map((content) => [content.id, content]));
  const templateById = new Map(templates.map((template) => [template.id, template]));
  assert(contents.length === 9 && templates.length === 9, "content/template count exact değil");
  assert(new Set(contents.map((content) => content.id)).size === 9, "duplicate content ID");
  assert(new Set(templates.map((template) => template.id)).size === 9, "duplicate template ID");

  for (const [contentIndex, item] of FIRST_REAL_CURRICULUM_PACK.contents.entries()) {
    const content = contentById.get(pack.contentIds[contentIndex]!);
    const template = templateById.get(pack.templateIds[contentIndex]!);
    assert(content && template, `stable kayıt eksik: ${item.slug}`);
    const trackIndex = FIRST_REAL_CURRICULUM_PACK.tracks.findIndex(
      (track) => track.id === item.trackId,
    );
    const skillCode = SKILL_CODES[trackIndex]!;
    const skill = skillByCode.get(skillCode);
    assert(skill, `skill eksik: ${skillCode}`);
    assert(
      content.tenantId === null && content.status === "PUBLISHED",
      `content publish: ${item.slug}`,
    );
    assert(
      content.currentVersionId === pack.contentVersionIds[contentIndex],
      `content pointer: ${item.slug}`,
    );
    const contentVersion = content.versions.find(
      (version) => version.id === content.currentVersionId,
    );
    assert(
      contentVersion?.version === 1 && contentVersion.status === "PUBLISHED",
      `content version: ${item.slug}`,
    );
    assert(
      contentVersion.title === item.title && contentVersion.body === item.body,
      `content editorial: ${item.slug}`,
    );
    assert(
      content.contentSkills.length === 1 && content.contentSkills[0]?.skillId === skill.id,
      `ContentSkill: ${item.slug}`,
    );
    assert(content.questions.length === 4, `question count: ${item.slug}`);
    for (const [questionIndex, manifestQuestion] of item.questions.entries()) {
      const question = content.questions[questionIndex]!;
      const questionId = pack.questionIds[contentIndex * 4 + questionIndex]!;
      const questionVersionId = pack.questionVersionIds[contentIndex * 4 + questionIndex]!;
      assert(
        question.id === questionId && question.position === questionIndex,
        `question identity: ${item.slug}/${questionIndex + 1}`,
      );
      assert(
        question.contentId === content.id &&
          question.skillId === skill.id &&
          question.status === "PUBLISHED",
        `question binding: ${item.slug}/${questionIndex + 1}`,
      );
      const questionVersion = question.versions.find((version) => version.id === questionVersionId);
      assert(
        questionVersion?.version === 1 && questionVersion.status === "PUBLISHED",
        `question version: ${item.slug}/${questionIndex + 1}`,
      );
      assert(
        questionVersion.questionId === question.id &&
          questionVersion.prompt === manifestQuestion.prompt,
        `question editorial: ${item.slug}/${questionIndex + 1}`,
      );
      assert(
        isDeepStrictEqual(questionVersion.options, manifestQuestion.options),
        `question options: ${item.slug}/${questionIndex + 1}`,
      );
      assert(
        isDeepStrictEqual(questionVersion.correctAnswer, manifestQuestion.correctAnswer),
        `question answer: ${item.slug}/${questionIndex + 1}`,
      );
      const metadata = record(
        questionVersion.generationMetadata,
        `question metadata: ${item.slug}/${questionIndex + 1}`,
      );
      assert(
        metadata.packId === PACK_ID && metadata.primarySkillRole === item.trackId,
        `question metadata binding: ${item.slug}/${questionIndex + 1}`,
      );
      assert(
        isDeepStrictEqual(metadata.sourceRefs, item.sourceIds),
        `question sources: ${item.slug}/${questionIndex + 1}`,
      );
    }
    assert(
      template.tenantId === null && template.status === "PUBLISHED",
      `template publish: ${item.slug}`,
    );
    assert(
      template.contentId === content.id && template.skillId === skill.id,
      `template binding: ${item.slug}`,
    );
    const config = record(template.config, `template config: ${item.slug}`);
    assert(
      config.packId === PACK_ID && config.levelCode === LEVEL_CODE,
      `level binding: ${item.slug}`,
    );
    const primarySkill = record(config.primarySkill, `primary skill: ${item.slug}`);
    assert(
      primarySkill.role === item.trackId && primarySkill.skillCode === skillCode,
      `skill mapping: ${item.slug}`,
    );
    assert(isDeepStrictEqual(config.sourceRefs, item.sourceIds), `template sources: ${item.slug}`);
    const templateVersion = template.versions.find(
      (version) => version.id === pack.templateVersionIds[contentIndex],
    );
    assert(
      templateVersion?.version === 1 && templateVersion.status === "PUBLISHED",
      `template version: ${item.slug}`,
    );
    assert(
      templateVersion.contents.length === 1 &&
        templateVersion.contents[0]?.contentVersionId === pack.contentVersionIds[contentIndex],
      `template content relation: ${item.slug}`,
    );
    assert(templateVersion.questions.length === 4, `template question relation: ${item.slug}`);
    for (const [questionIndex, relation] of templateVersion.questions.entries()) {
      assert(
        relation.questionId === pack.questionIds[contentIndex * 4 + questionIndex] &&
          relation.questionVersionId ===
            pack.questionVersionIds[contentIndex * 4 + questionIndex] &&
          relation.position === questionIndex,
        `template question relation: ${item.slug}/${questionIndex + 1}`,
      );
    }
  }
  return { sourceCount: manifestQa.metrics.sourceCount, warningCount: manifestQa.warnings.length };
}

async function main(): Promise<void> {
  const rawUrl = process.env.ISOLATED_TEST_DATABASE_URL?.trim();
  if (!rawUrl) fail("ISOLATED_TEST_DATABASE_URL verilmedi; DATABASE_URL fallback'i yok");
  let target: CatalogTarget;
  try {
    target = parseCatalogTargetUrl(rawUrl, "TEST");
    assertIsolatedFirstRealPackTestTarget(target);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  assert(
    target.database === ISOLATED_FIRST_REAL_PACK_TEST_DATABASE,
    "isolated database adı eşleşmiyor",
  );
  const prisma = new PrismaClient({
    datasources: { db: { url: target.url } },
    transactionOptions: { maxWait: 2_000, timeout: 15_000 },
  });
  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    assertLiveCatalogTargetIdentity(target, identity);
    const serverAddress = (identity.server_addr ?? "").replace(/\/\d+$/u, "");
    assert(["127.0.0.1", "::1"].includes(serverAddress), "server local değil");
    assert(identity.server_port === 5432, "server port 5432 değil");
    const migrations = await readMigrationState(prisma);
    assert(
      migrations.tableExists && migrations.total === 14 && migrations.unfinished === 0,
      "migration state 14/14 ve unfinished=0 değil",
    );
    const manifest = CANONICAL_CATALOG_MANIFEST;
    const initialCatalog = await readCatalog(prisma);
    const catalogPlan = planCanonicalCatalogBootstrap(manifest, initialCatalog);
    assert(
      catalogPlan.action !== "CONFLICT",
      `catalog conflict: ${catalogPlan.conflicts.join("; ")}`,
    );
    if (catalogPlan.action === "CREATE")
      await applyCanonicalCatalogBootstrap(prisma, manifest, initialCatalog);
    await assertCatalogState(prisma, manifest);
    const emptyBefore = await assertPackEmpty(prisma, "başlangıç");

    const dryRun = expectSeedPass(await runSeed(rawUrl, ["--dry-run"]), "DRY_RUN");
    const dryExpected = record(dryRun.expectedNewRecords, "dry-run expectedNewRecords");
    assert(
      dryExpected.content === 9 && dryExpected.question === 36,
      "dry-run 9 content/36 question planı değil",
    );

    const rollbackRun = await runSeed(rawUrl, ["--simulate-failure"]);
    assert(rollbackRun.exitCode !== 0, "rollback probe hata üretmedi");
    assert(
      `${rollbackRun.stderr}\n${rollbackRun.stdout}`.includes("simulated failure"),
      "rollback probe beklenen hata değil",
    );
    const afterRollback = await assertPackEmpty(prisma, "rollback sonrası");
    const dryAfterRollback = expectSeedPass(await runSeed(rawUrl, ["--dry-run"]), "DRY_RUN");

    const firstRun = await runSeed(rawUrl, []);
    const firstApply = expectSeedPass(firstRun, "WRITE");
    const firstCounts = await readPackCounts(prisma);
    assertCounts(firstCounts, EXPECTED_COUNTS, "first apply");
    const secondRun = await runSeed(rawUrl, []);
    const secondApply = expectSeedPass(secondRun, "NOOP");
    const secondCounts = await readPackCounts(prisma);
    assert(isDeepStrictEqual(firstCounts, secondCounts), "NOOP sonrası sayaçlar değişti");
    const quality = await assertPackQuality(prisma);

    const timeoutStartedAt = performance.now();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 'slept'::text AS status FROM pg_sleep(5.5)`;
    });
    const timeoutProbeMs = Number((performance.now() - timeoutStartedAt).toFixed(2));
    const seedSource = await readFile(
      resolve(REPO_ROOT, "scripts/seed-curriculum-pack.ts"),
      "utf8",
    );
    assert(
      seedSource.includes("maxWait: 2_000") && seedSource.includes("timeout: 15_000"),
      "seed timeout config source doğrulanamadı",
    );
    const fingerprint = targetFingerprint(target, identity);
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          harness: "ISOLATED_TEST_FIRST_REAL_PACK",
          isolatedDatabase: ISOLATED_FIRST_REAL_PACK_TEST_DATABASE,
          fingerprint,
          migrations,
          canonicalCatalog: { action: catalogPlan.action, level: LEVEL_CODE, skills: SKILL_CODES },
          dryRun: { mode: dryRun.mode, expectedNewRecords: dryExpected },
          rollback: { status: "PASS", elapsedMs: rollbackRun.elapsedMs, after: afterRollback },
          firstApply: {
            mode: firstApply.mode,
            elapsedMs: firstRun.elapsedMs,
            transactionDurationMs: firstApply.transactionDurationMs,
            counts: firstCounts,
          },
          secondApply: { mode: secondApply.mode, counts: secondCounts },
          noop: isDeepStrictEqual(firstCounts, secondCounts),
          idStability: "PASS",
          qa: {
            status: "PASS",
            sourceCount: quality.sourceCount,
            warningCount: quality.warningCount,
          },
          timeout: { maxWaitMs: 2_000, timeoutMs: 15_000, readOnlyProbeMs: timeoutProbeMs },
          initialPackCounts: emptyBefore,
          dryRunAfterRollback: dryAfterRollback.mode,
          dbChanged: true,
          stagingDbChanged: false,
          productionDbChanged: false,
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
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
