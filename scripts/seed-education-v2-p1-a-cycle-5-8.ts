import "dotenv/config";
import { readFileSync } from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  parseTrainingExerciseVersionConfig,
  type TrainingExerciseVersionConfig,
} from "../src/modules/training/exercise-contract.js";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  assertSameCatalogDatabaseTarget,
  parseCatalogTargetUrl,
  type CatalogTarget,
} from "../src/curriculum/catalog-target-verification.js";
import {
  expectedContentSkillLinks,
  inspectContentSkillLinks,
} from "../src/curriculum/content-skill-link-repair.js";
import {
  mapCurriculumSkillCodesToStoredSkillCodes,
  singleStoredSkillCodeForOutcome,
} from "../src/curriculum/learning-step-skill-link.js";
import {
  educationV2P1ACycle5To8ProductionApproval,
  educationV2P1ACycle5To8ScopeSequences,
  EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_ID,
  type EducationV2P1ACycle5To8GraphScope,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-release.js";
import {
  isEducationV2P1ACycle9To12ProductionAssignmentEnabled,
  educationV2P1ACycle9To12ProductionApproval,
  EDUCATION_V2_P1_A_CYCLE_9_12_RELEASE_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-9-12-release.js";
import {
  isEducationV2P1ACycle13To16ProductionAssignmentEnabled,
  educationV2P1ACycle13To16ProductionApproval,
  EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-13-16-release.js";
import {
  isEducationV2P1ACycle17To20ProductionAssignmentEnabled,
  educationV2P1ACycle17To20ProductionApproval,
  EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-17-20-release.js";
import {
  isEducationV2P1ACycle21To24ProductionAssignmentEnabled,
  educationV2P1ACycle21To24ProductionApproval,
  EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-21-24-release.js";
import {
  isEducationV2P1ACycle25To28ProductionAssignmentEnabled,
  educationV2P1ACycle25To28ProductionApproval,
  EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-25-28-release.js";
import {
  isEducationV2P1ACycle29To32ProductionAssignmentEnabled,
  educationV2P1ACycle29To32ProductionApproval,
  EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-29-32-release.js";
import {
  educationV2P1ACycle33To36OrFallbackProductionApproval,
  EDUCATION_V2_P1_A_CYCLE_33_36_RELEASE_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-33-36-release.js";
import {
  educationV2P1ACycle37To40ProductionApproval,
  EDUCATION_V2_P1_A_CYCLE_37_40_RELEASE_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-37-40-release.js";
import {
  educationV2P1ACycle5To8AnswerKey,
  getEducationV2P1ACycle,
  p1ACycle5To8AssessmentId,
  p1ACycle5To8ContentVersionId,
  p1ACycle5To8Id,
  p1ACycle5To8QuestionId,
  p1ACycle5To8QuestionVersionId,
  p1ACycle5To8TemplateId,
  p1ACycle5To8TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import type { P1AProgram } from "../src/curriculum/education-v2-p1-a-program.js";
import type { EducationV2P1ExpansionDraftCycle } from "../src/curriculum/education-v2-p1-800-draft-cycles.js";
import {
  educationV2P1ACycle5To8SeedAction,
  isEducationV2P1ACycle5To8SeedRequestAuthorized,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-seed-policy.js";
import {
  compareContentSkillLinks,
  ensureContentSkillLinks,
  expectedContentSkillLinks,
} from "../src/curriculum/content-skill-link-repair.js";
import {
  isCycle5To8PitrEvidenceValid,
  isCycle9To12PitrEvidenceValid,
  isCycle13To16PitrEvidenceValid,
  isCycle17To20PitrEvidenceValid,
  isCycle21To24PitrEvidenceValid,
  isCycle25To28PitrEvidenceValid,
  isCycle29To32PitrEvidenceValid,
  isCycle33To36PitrEvidenceValid,
  isCycle37To40PitrEvidenceValid,
  type Cycle5To8PitrEvidenceExpectation,
  type Cycle9To12PitrEvidenceExpectation,
  type Cycle13To16PitrEvidenceExpectation,
  type Cycle17To20PitrEvidenceExpectation,
  type Cycle21To24PitrEvidenceExpectation,
  type Cycle25To28PitrEvidenceExpectation,
  type Cycle29To32PitrEvidenceExpectation,
  type Cycle33To36PitrEvidenceExpectation,
  type Cycle37To40PitrEvidenceExpectation,
} from "./production-cycle4-pitr-restore-evidence.js";

const ACTIVE_SEQUENCE = Number(
  process.env.CYCLE3740_SEQUENCE ??
    process.env.CYCLE3336_SEQUENCE ??
    process.env.CYCLE2932_SEQUENCE ??
    process.env.CYCLE2528_SEQUENCE ??
    process.env.CYCLE2124_SEQUENCE ??
    process.env.CYCLE1720_SEQUENCE ??
    process.env.CYCLE1316_SEQUENCE ??
    process.env.CYCLE912_SEQUENCE ??
    process.env.CYCLE58_SEQUENCE ??
    "5",
);
if (
  ![
    5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
    30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  ].includes(ACTIVE_SEQUENCE)
) {
  throw new Error("Döngü sıra numarası 5–40 aralığında olmalı");
}
const ACTIVE_CYCLE = getEducationV2P1ACycle(ACTIVE_SEQUENCE);
if (!ACTIVE_CYCLE) throw new Error(`Cycle ${ACTIVE_SEQUENCE} programı bulunamadı`);
const ACTIVE_SOURCE_CYCLE = ACTIVE_CYCLE.sourceCycle;
const ACTIVE_PROGRAM = ACTIVE_CYCLE.program;
const ACTIVE_PROGRAM_ID = ACTIVE_PROGRAM.programId;
const ACTIVE_VERSION = ACTIVE_CYCLE.manifest.cycleVersion;
function activeId(kind: Parameters<typeof p1ACycle5To8Id>[1], key: string): string {
  return p1ACycle5To8Id(ACTIVE_SEQUENCE, kind, key);
}
const activeContentVersionId = (key: string) => p1ACycle5To8ContentVersionId(ACTIVE_SEQUENCE, key);
const activeTemplateId = (key: string) => p1ACycle5To8TemplateId(ACTIVE_SEQUENCE, key);
const activeTemplateVersionId = (key: string) =>
  p1ACycle5To8TemplateVersionId(ACTIVE_SEQUENCE, key);
const activeQuestionId = (exerciseKey: string, questionKey: string) =>
  p1ACycle5To8QuestionId(ACTIVE_SEQUENCE, `${exerciseKey}-${questionKey}`);
const activeQuestionVersionId = (exerciseKey: string, questionKey: string) =>
  p1ACycle5To8QuestionVersionId(ACTIVE_SEQUENCE, `${exerciseKey}-${questionKey}`);
const activeAssessmentId = (key: string) => p1ACycle5To8AssessmentId(ACTIVE_SEQUENCE, key);

const rawGraphScope =
  process.env.CYCLE3740_GRAPH_SCOPE?.trim() ??
  process.env.CYCLE3336_GRAPH_SCOPE?.trim() ??
  process.env.CYCLE2932_GRAPH_SCOPE?.trim() ??
  process.env.CYCLE2528_GRAPH_SCOPE?.trim() ??
  process.env.CYCLE2124_GRAPH_SCOPE?.trim() ??
  process.env.CYCLE1720_GRAPH_SCOPE?.trim() ??
  process.env.CYCLE1316_GRAPH_SCOPE?.trim() ??
  process.env.CYCLE912_GRAPH_SCOPE?.trim() ??
  process.env.CYCLE58_GRAPH_SCOPE?.trim() ??
  (ACTIVE_SEQUENCE <= 8
    ? "CYCLES_5_TO_8"
    : ACTIVE_SEQUENCE <= 12
      ? "CYCLES_9_TO_12"
      : ACTIVE_SEQUENCE <= 16
        ? "CYCLES_13_TO_16"
        : ACTIVE_SEQUENCE <= 20
          ? "CYCLES_17_TO_20"
          : ACTIVE_SEQUENCE <= 24
            ? "CYCLES_21_TO_24"
            : ACTIVE_SEQUENCE <= 28
              ? "CYCLES_25_TO_28"
              : ACTIVE_SEQUENCE <= 32
                ? "CYCLES_29_TO_32"
                : ACTIVE_SEQUENCE <= 36
                  ? "CYCLES_33_TO_36"
                  : "CYCLES_37_TO_40");
if (
  rawGraphScope !== "CYCLE_5_ONLY" &&
  rawGraphScope !== "CYCLES_5_TO_8" &&
  rawGraphScope !== "CYCLES_9_TO_12" &&
  rawGraphScope !== "CYCLES_13_TO_16" &&
  rawGraphScope !== "CYCLES_17_TO_20" &&
  rawGraphScope !== "CYCLES_21_TO_24" &&
  rawGraphScope !== "CYCLES_25_TO_28" &&
  rawGraphScope !== "CYCLES_29_TO_32" &&
  rawGraphScope !== "CYCLES_33_TO_36" &&
  rawGraphScope !== "CYCLES_37_TO_40"
) {
  throw new Error("Cycle grafik kapsamı geçersiz");
}
const ACTIVE_GRAPH_SCOPE = rawGraphScope as EducationV2P1ACycle5To8GraphScope;
const IS_CYCLE_9_TO_12 = ACTIVE_GRAPH_SCOPE === "CYCLES_9_TO_12";
const IS_CYCLE_13_TO_16 = ACTIVE_GRAPH_SCOPE === "CYCLES_13_TO_16";
const IS_CYCLE_17_TO_20 = ACTIVE_GRAPH_SCOPE === "CYCLES_17_TO_20";
const IS_CYCLE_21_TO_24 = ACTIVE_GRAPH_SCOPE === "CYCLES_21_TO_24";
const IS_CYCLE_25_TO_28 = ACTIVE_GRAPH_SCOPE === "CYCLES_25_TO_28";
const IS_CYCLE_29_TO_32 = ACTIVE_GRAPH_SCOPE === "CYCLES_29_TO_32";
const IS_CYCLE_33_TO_36 = ACTIVE_GRAPH_SCOPE === "CYCLES_33_TO_36";
const IS_CYCLE_37_TO_40 = ACTIVE_GRAPH_SCOPE === "CYCLES_37_TO_40";
const BASE_ACTIVE_OPERATION_ENV = IS_CYCLE_29_TO_32
  ? "CYCLE2932_OPERATION"
  : IS_CYCLE_25_TO_28
    ? "CYCLE2528_OPERATION"
    : IS_CYCLE_21_TO_24
      ? "CYCLE2124_OPERATION"
      : IS_CYCLE_17_TO_20
        ? "CYCLE1720_OPERATION"
        : IS_CYCLE_13_TO_16
          ? "CYCLE1316_OPERATION"
          : IS_CYCLE_9_TO_12
            ? "CYCLE912_OPERATION"
            : "CYCLE58_OPERATION";
const ACTIVE_OPERATION_ENV = IS_CYCLE_37_TO_40
  ? "CYCLE3740_OPERATION"
  : IS_CYCLE_33_TO_36
    ? "CYCLE3336_OPERATION"
    : BASE_ACTIVE_OPERATION_ENV;
const BASE_ACTIVE_CONFIRMATION_ENV = IS_CYCLE_29_TO_32
  ? "CYCLE2932_CONFIRMATION"
  : IS_CYCLE_25_TO_28
    ? "CYCLE2528_CONFIRMATION"
    : IS_CYCLE_21_TO_24
      ? "CYCLE2124_CONFIRMATION"
      : IS_CYCLE_17_TO_20
        ? "CYCLE1720_CONFIRMATION"
        : IS_CYCLE_13_TO_16
          ? "CYCLE1316_CONFIRMATION"
          : IS_CYCLE_9_TO_12
            ? "CYCLE912_CONFIRMATION"
            : "CYCLE58_CONFIRMATION";
const ACTIVE_CONFIRMATION_ENV = IS_CYCLE_37_TO_40
  ? "CYCLE3740_CONFIRMATION"
  : IS_CYCLE_33_TO_36
    ? "CYCLE3336_CONFIRMATION"
    : BASE_ACTIVE_CONFIRMATION_ENV;
const BASE_ACTIVE_RELEASE_INPUT_ID_ENV = IS_CYCLE_29_TO_32
  ? "CYCLE2932_RELEASE_ID"
  : IS_CYCLE_25_TO_28
    ? "CYCLE2528_RELEASE_ID"
    : IS_CYCLE_21_TO_24
      ? "CYCLE2124_RELEASE_ID"
      : IS_CYCLE_17_TO_20
        ? "CYCLE1720_RELEASE_ID"
        : IS_CYCLE_13_TO_16
          ? "CYCLE1316_RELEASE_ID"
          : IS_CYCLE_9_TO_12
            ? "CYCLE912_RELEASE_ID"
            : "CYCLE58_RELEASE_ID";
const ACTIVE_RELEASE_INPUT_ID_ENV = IS_CYCLE_37_TO_40
  ? "CYCLE3740_RELEASE_ID"
  : IS_CYCLE_33_TO_36
    ? "CYCLE3336_RELEASE_ID"
    : BASE_ACTIVE_RELEASE_INPUT_ID_ENV;
const BASE_ACTIVE_RELEASE_INPUT_COMMIT_ENV = IS_CYCLE_29_TO_32
  ? "CYCLE2932_RELEASE_COMMIT"
  : IS_CYCLE_25_TO_28
    ? "CYCLE2528_RELEASE_COMMIT"
    : IS_CYCLE_21_TO_24
      ? "CYCLE2124_RELEASE_COMMIT"
      : IS_CYCLE_17_TO_20
        ? "CYCLE1720_RELEASE_COMMIT"
        : IS_CYCLE_13_TO_16
          ? "CYCLE1316_RELEASE_COMMIT"
          : IS_CYCLE_9_TO_12
            ? "CYCLE912_RELEASE_COMMIT"
            : "CYCLE58_RELEASE_COMMIT";
const ACTIVE_RELEASE_INPUT_COMMIT_ENV = IS_CYCLE_37_TO_40
  ? "CYCLE3740_RELEASE_COMMIT"
  : IS_CYCLE_33_TO_36
    ? "CYCLE3336_RELEASE_COMMIT"
    : BASE_ACTIVE_RELEASE_INPUT_COMMIT_ENV;
const BASE_ACTIVE_PRODUCTION_WORKFLOW = IS_CYCLE_29_TO_32
  ? "Manual Education V2 P1-A Cycles 29–32 production provision"
  : IS_CYCLE_25_TO_28
    ? "Manual Education V2 P1-A Cycles 25–28 production provision"
    : IS_CYCLE_21_TO_24
      ? "Manual Education V2 P1-A Cycles 21–24 production provision"
      : IS_CYCLE_17_TO_20
        ? "Manual Education V2 P1-A Cycles 17–20 production provision"
        : IS_CYCLE_13_TO_16
          ? "Manual Education V2 P1-A Cycles 13–16 production provision"
          : IS_CYCLE_9_TO_12
            ? "Manual Education V2 P1-A Cycles 9–12 production provision"
            : "Manual Education V2 P1-A Cycles 5–8 production provision";
const ACTIVE_PRODUCTION_WORKFLOW = IS_CYCLE_37_TO_40
  ? "Manual Education V2 P1-A Cycles 37–40 production provision"
  : IS_CYCLE_33_TO_36
    ? "Manual Education V2 P1-A Cycles 33–36 production provision"
    : BASE_ACTIVE_PRODUCTION_WORKFLOW;
const BASE_ACTIVE_SCOPE_LABEL = IS_CYCLE_29_TO_32
  ? "Cycle 29–32"
  : IS_CYCLE_25_TO_28
    ? "Cycle 25–28"
    : IS_CYCLE_21_TO_24
      ? "Cycle 21–24"
      : IS_CYCLE_17_TO_20
        ? "Cycle 17–20"
        : IS_CYCLE_13_TO_16
          ? "Cycle 13–16"
          : IS_CYCLE_9_TO_12
            ? "Cycle 9–12"
            : "Cycle 5–8";
const ACTIVE_SCOPE_LABEL = IS_CYCLE_37_TO_40
  ? "Cycle 37–40"
  : IS_CYCLE_33_TO_36
    ? "Cycle 33–36"
    : BASE_ACTIVE_SCOPE_LABEL;
const ACTIVE_SOURCE_RELEASE_COMMIT = process.env.GITHUB_SHA?.trim().toLowerCase() ?? "";
const BASE_ACTIVE_RELEASE_ID = IS_CYCLE_29_TO_32
  ? EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_ID
  : IS_CYCLE_25_TO_28
    ? EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_ID
    : IS_CYCLE_21_TO_24
      ? EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_ID
      : IS_CYCLE_17_TO_20
        ? EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_ID
        : IS_CYCLE_13_TO_16
          ? EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_ID
          : IS_CYCLE_9_TO_12
            ? EDUCATION_V2_P1_A_CYCLE_9_12_RELEASE_ID
            : EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_ID;
const ACTIVE_RELEASE_ID = IS_CYCLE_37_TO_40
  ? EDUCATION_V2_P1_A_CYCLE_37_40_RELEASE_ID
  : IS_CYCLE_33_TO_36
    ? EDUCATION_V2_P1_A_CYCLE_33_36_RELEASE_ID
    : BASE_ACTIVE_RELEASE_ID;
const BASE_ACTIVE_PRODUCTION_CONFIRMATION = (): string => {
  if (IS_CYCLE_29_TO_32)
    return educationV2P1ACycle29To32ProductionApproval(ACTIVE_SOURCE_RELEASE_COMMIT);
  if (IS_CYCLE_25_TO_28)
    return educationV2P1ACycle25To28ProductionApproval(ACTIVE_SOURCE_RELEASE_COMMIT);
  if (IS_CYCLE_21_TO_24)
    return educationV2P1ACycle21To24ProductionApproval(ACTIVE_SOURCE_RELEASE_COMMIT);
  if (IS_CYCLE_17_TO_20)
    return educationV2P1ACycle17To20ProductionApproval(ACTIVE_SOURCE_RELEASE_COMMIT);
  if (IS_CYCLE_13_TO_16)
    return educationV2P1ACycle13To16ProductionApproval(ACTIVE_SOURCE_RELEASE_COMMIT);
  if (IS_CYCLE_9_TO_12)
    return educationV2P1ACycle9To12ProductionApproval(ACTIVE_SOURCE_RELEASE_COMMIT);
  return educationV2P1ACycle5To8ProductionApproval(
    ACTIVE_GRAPH_SCOPE,
    ACTIVE_SOURCE_RELEASE_COMMIT,
  );
};
const ACTIVE_PRODUCTION_CONFIRMATION = IS_CYCLE_37_TO_40
  ? educationV2P1ACycle37To40ProductionApproval(ACTIVE_SOURCE_RELEASE_COMMIT)
  : educationV2P1ACycle33To36OrFallbackProductionApproval(
      IS_CYCLE_33_TO_36,
      ACTIVE_SOURCE_RELEASE_COMMIT,
      BASE_ACTIVE_PRODUCTION_CONFIRMATION,
    );

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply") || args.has("--dry-run");
if ([...args].some((arg) => arg !== "--apply" && arg !== "--dry-run")) {
  throw new Error("yalnızca --dry-run veya --apply kullanılabilir");
}
if (args.has("--apply") && args.has("--dry-run")) {
  throw new Error("--apply ve --dry-run birlikte kullanılamaz");
}
const BASE_ENVIRONMENT_SUFFIX = IS_CYCLE_29_TO_32
  ? "29_32"
  : IS_CYCLE_25_TO_28
    ? "25_28"
    : IS_CYCLE_21_TO_24
      ? "21_24"
      : IS_CYCLE_17_TO_20
        ? "17_20"
        : IS_CYCLE_13_TO_16
          ? "13_16"
          : IS_CYCLE_9_TO_12
            ? "9_12"
            : "5_8";
const ENVIRONMENT_SUFFIX = IS_CYCLE_37_TO_40
  ? "37_40"
  : IS_CYCLE_33_TO_36
    ? "33_36"
    : BASE_ENVIRONMENT_SUFFIX;
const ENVIRONMENT_PREFIX = `EDUCATION_V2_P1_A_CYCLE_${ENVIRONMENT_SUFFIX}`;
const TARGET_ENV = `${ENVIRONMENT_PREFIX}_ENVIRONMENT`;
const DATABASE_ENV = `${ENVIRONMENT_PREFIX}_DATABASE_URL`;
const PRODUCTION_DATABASE_ENV = `${ENVIRONMENT_PREFIX}_PRODUCTION_DATABASE_URL`;
const PRODUCTION_DATABASE_NAME_ENV = `${ENVIRONMENT_PREFIX}_PRODUCTION_DATABASE_NAME`;
const PRODUCTION_DATABASE_HOST_ENV = `${ENVIRONMENT_PREFIX}_PRODUCTION_DATABASE_HOST`;
const PRODUCTION_RELEASE_ID_ENV = `${ENVIRONMENT_PREFIX}_PRODUCTION_RELEASE_ID`;
const PRODUCTION_RELEASE_COMMIT_ENV = `${ENVIRONMENT_PREFIX}_PRODUCTION_RELEASE_COMMIT`;
const PRODUCTION_APPROVAL_ENV = `${ENVIRONMENT_PREFIX}_PRODUCTION_APPROVAL`;
const APPROVED_FINGERPRINT_ENV = `${ENVIRONMENT_PREFIX}_APPROVED_TARGET_FINGERPRINT`;
const BASE_PITR_EVIDENCE_PATH_ENV = IS_CYCLE_29_TO_32
  ? "CYCLE2932_PITR_EVIDENCE_PATH"
  : IS_CYCLE_25_TO_28
    ? "CYCLE2528_PITR_EVIDENCE_PATH"
    : IS_CYCLE_21_TO_24
      ? "CYCLE2124_PITR_EVIDENCE_PATH"
      : IS_CYCLE_13_TO_16
        ? "CYCLE1316_PITR_EVIDENCE_PATH"
        : IS_CYCLE_17_TO_20
          ? "CYCLE1720_PITR_EVIDENCE_PATH"
          : IS_CYCLE_9_TO_12
            ? "CYCLE912_PITR_EVIDENCE_PATH"
            : "CYCLE58_PITR_EVIDENCE_PATH";
const PITR_EVIDENCE_PATH_ENV = IS_CYCLE_37_TO_40
  ? "CYCLE3740_PITR_EVIDENCE_PATH"
  : IS_CYCLE_33_TO_36
    ? "CYCLE3336_PITR_EVIDENCE_PATH"
    : BASE_PITR_EVIDENCE_PATH_ENV;
const APPROVED_RELEASE_ID = ACTIVE_RELEASE_ID;
const PRODUCTION_CONFIRMATION = ACTIVE_PRODUCTION_CONFIRMATION;
type TargetEnvironment = "TEST" | "PRODUCTION";
type Target = CatalogTarget & { approvedTarget: CatalogTarget; approvedFingerprint: string };
type Program = P1AProgram;
type Plan = {
  content: Program["content"][number];
  sourceStation: EducationV2P1ExpansionDraftCycle["sourceStations"][number];
  contentId: string;
  contentVersionId: string;
  skillId: string;
  curriculumSkills: Array<{ code: string; id: string }>;
  exercise?: Program["exercises"][number];
  exerciseTemplateId?: string;
  exerciseTemplateVersionId?: string;
  questions: Array<{
    id: string;
    versionId: string;
    question: Program["exercises"][number]["questions"][number];
    position: number;
  }>;
};
type Identity = { database: string; db_user: string; host: string | null; port: number | null };

function fail(message: string): never {
  throw new Error(`Education V2 P1-A Cycle ${ACTIVE_SEQUENCE} seed reddedildi: ${message}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} gerekli`);
  return value;
}

function assertPitrRestoreEvidence(): void {
  const evidencePath = required(PITR_EVIDENCE_PATH_ENV);
  let evidence: Record<string, unknown>;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as Record<string, unknown>;
  } catch {
    fail("aynı korumalı workflow çalışmasına ait PITR kanıt dosyası okunamadı");
  }
  const expectedBase = {
    runId: process.env.GITHUB_RUN_ID ?? "",
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || "1",
    sha: process.env.GITHUB_SHA?.toLowerCase() ?? "",
    database: required(PRODUCTION_DATABASE_NAME_ENV),
    role: required("PRODUCTION_DB_APPROVED_USER"),
    port: required("PRODUCTION_DB_APPROVED_PORT"),
  };
  const baseValid = IS_CYCLE_29_TO_32
    ? isCycle29To32PitrEvidenceValid(evidence, {
        ...expectedBase,
        scope: "cycle29-32",
        graphScope: "CYCLES_29_TO_32",
      } satisfies Cycle29To32PitrEvidenceExpectation)
    : IS_CYCLE_25_TO_28
      ? isCycle25To28PitrEvidenceValid(evidence, {
          ...expectedBase,
          scope: "cycle25-28",
          graphScope: "CYCLES_25_TO_28",
        } satisfies Cycle25To28PitrEvidenceExpectation)
      : IS_CYCLE_21_TO_24
        ? isCycle21To24PitrEvidenceValid(evidence, {
            ...expectedBase,
            scope: "cycle21-24",
            graphScope: "CYCLES_21_TO_24",
          } satisfies Cycle21To24PitrEvidenceExpectation)
        : IS_CYCLE_17_TO_20
          ? isCycle17To20PitrEvidenceValid(evidence, {
              ...expectedBase,
              scope: "cycle17-20",
              graphScope: "CYCLES_17_TO_20",
            } satisfies Cycle17To20PitrEvidenceExpectation)
          : IS_CYCLE_13_TO_16
            ? isCycle13To16PitrEvidenceValid(evidence, {
                ...expectedBase,
                scope: "cycle13-16",
                graphScope: "CYCLES_13_TO_16",
              } satisfies Cycle13To16PitrEvidenceExpectation)
            : IS_CYCLE_9_TO_12
              ? isCycle9To12PitrEvidenceValid(evidence, {
                  ...expectedBase,
                  scope: "cycle9-12",
                  graphScope: "CYCLES_9_TO_12",
                } satisfies Cycle9To12PitrEvidenceExpectation)
              : isCycle5To8PitrEvidenceValid(evidence, {
                  ...expectedBase,
                  scope: "cycle5-8",
                  graphScope: ACTIVE_GRAPH_SCOPE,
                } satisfies Cycle5To8PitrEvidenceExpectation);
  const valid = IS_CYCLE_37_TO_40
    ? isCycle37To40PitrEvidenceValid(evidence, {
        ...expectedBase,
        scope: "cycle37-40",
        graphScope: "CYCLES_37_TO_40",
      } satisfies Cycle37To40PitrEvidenceExpectation)
    : IS_CYCLE_33_TO_36
      ? isCycle33To36PitrEvidenceValid(evidence, {
          ...expectedBase,
          scope: "cycle33-36",
          graphScope: "CYCLES_33_TO_36",
        } satisfies Cycle33To36PitrEvidenceExpectation)
      : baseValid;
  if (!valid) {
    fail("geçerli, başarılı ve aynı çalışmaya bağlı PITR geri yükleme kanıtı gerekli");
  }
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return candidate;
  };
  return JSON.stringify(normalize(value)) ?? "undefined";
}

function contentVersionMetadata(plan: Plan): Prisma.InputJsonValue {
  return {
    programId: ACTIVE_PROGRAM_ID,
    contractVersion: ACTIVE_VERSION,
    lessonType: plan.content.lesson ? "LEARNING_LESSON" : "LEARNING_EXERCISE",
    skillCode: plan.content.skillCode,
    objective: plan.content.lesson?.objective ?? plan.content.body,
    explanation: plan.content.lesson?.explanation ?? plan.content.body,
    workedExample: plan.content.lesson?.workedExample ?? "Metindeki kanıtı soruyla eşleştir.",
    guidedPractice: plan.content.lesson?.guidedPractice ?? "Soruyu oku, metne dön ve kanıtı seç.",
    exerciseTemplateVersionId: plan.exerciseTemplateVersionId ?? null,
    completionLabel: "Dersi tamamladım",
    area: "READING_COMPREHENSION",
    routeFamily: `P1-A-CYCLE-${ACTIVE_SEQUENCE}`,
    contentOrigin: plan.sourceStation.contentOrigin,
    provenanceStatus: plan.sourceStation.provenanceStatus,
    sourceReference: plan.sourceStation.sourceReference,
    sourceEvidence: plan.sourceStation.sourceEvidence ?? null,
  };
}

function wordCount(body: string): number {
  return body.trim().split(/\s+/u).filter(Boolean).length;
}

function readTarget(): Target | null {
  const environment = process.env[TARGET_ENV]?.trim().toUpperCase();
  const rawUrl =
    process.env[environment === "PRODUCTION" ? PRODUCTION_DATABASE_ENV : DATABASE_ENV]?.trim();
  if (dryRun && !rawUrl && environment !== "PRODUCTION") return null;
  if (environment !== "TEST" && environment !== "PRODUCTION") {
    fail(`${TARGET_ENV}=TEST veya açıkça korunan PRODUCTION olmalı`);
  }
  if (!rawUrl) {
    fail(`${environment === "PRODUCTION" ? PRODUCTION_DATABASE_ENV : DATABASE_ENV} gerekli`);
  }

  const target = parseCatalogTargetUrl(rawUrl, environment as TargetEnvironment);
  const approvedUrl = required("DB_FINGERPRINT_DATABASE_URL");
  const approvedFingerprint = required(APPROVED_FINGERPRINT_ENV);
  const approvedTarget = parseCatalogTargetUrl(approvedUrl, environment as TargetEnvironment);
  assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  assertCatalogEnvironmentSafety(approvedTarget, { rejectTestDatabase: true });
  assertSameCatalogDatabaseTarget(approvedTarget, target);

  if (environment === "TEST" && target.database !== "oku_plus_test") {
    fail(`TEST hedefi oku_plus_test olmalı: ${target.database}`);
  }
  if (environment === "PRODUCTION") {
    const expectedDatabase = required(PRODUCTION_DATABASE_NAME_ENV);
    const expectedHost = required(PRODUCTION_DATABASE_HOST_ENV).toLowerCase().replace(/\.$/u, "");
    const releaseId = required(PRODUCTION_RELEASE_ID_ENV);
    const releaseCommit = required(PRODUCTION_RELEASE_COMMIT_ENV).toLowerCase();
    if (
      releaseId !== APPROVED_RELEASE_ID ||
      process.env[ACTIVE_RELEASE_INPUT_ID_ENV] !== APPROVED_RELEASE_ID ||
      !/^[0-9a-f]{40}$/u.test(ACTIVE_SOURCE_RELEASE_COMMIT) ||
      releaseCommit !== ACTIVE_SOURCE_RELEASE_COMMIT ||
      process.env[ACTIVE_RELEASE_INPUT_COMMIT_ENV]?.trim().toLowerCase() !==
        ACTIVE_SOURCE_RELEASE_COMMIT
    ) {
      fail(
        `production release id/commit güncel ${ACTIVE_SCOPE_LABEL} kaynak içeriğiyle eşleşmiyor`,
      );
    }
    if (target.database !== expectedDatabase || target.host !== expectedHost) {
      fail(`production database kimliği beklenen ${ACTIVE_SCOPE_LABEL} hedefiyle eşleşmiyor`);
    }
    if (!educationV2P1ACycle5To8ScopeSequences(ACTIVE_GRAPH_SCOPE).includes(ACTIVE_SEQUENCE)) {
      fail(`Cycle ${ACTIVE_SEQUENCE} istenen grafik kapsamına dahil değil`);
    }
    const releaseGateClosed = (sequence: number): boolean => {
      if (IS_CYCLE_29_TO_32)
        return !isEducationV2P1ACycle29To32ProductionAssignmentEnabled(sequence);
      if (IS_CYCLE_25_TO_28)
        return !isEducationV2P1ACycle25To28ProductionAssignmentEnabled(sequence);
      if (IS_CYCLE_21_TO_24)
        return !isEducationV2P1ACycle21To24ProductionAssignmentEnabled(sequence);
      if (IS_CYCLE_17_TO_20)
        return !isEducationV2P1ACycle17To20ProductionAssignmentEnabled(sequence);
      if (IS_CYCLE_13_TO_16)
        return !isEducationV2P1ACycle13To16ProductionAssignmentEnabled(sequence);
      return !isEducationV2P1ACycle9To12ProductionAssignmentEnabled(sequence);
    };
    // Cycle-specific exact release/commit approval gates graph preparation; learner assignment remains gated by its explicit source decision.
    if (
      !dryRun &&
      (IS_CYCLE_9_TO_12 ||
        IS_CYCLE_13_TO_16 ||
        IS_CYCLE_17_TO_20 ||
        IS_CYCLE_21_TO_24 ||
        IS_CYCLE_25_TO_28 ||
        IS_CYCLE_29_TO_32) &&
      educationV2P1ACycle5To8ScopeSequences(ACTIVE_GRAPH_SCOPE).some(releaseGateClosed)
    ) {
      fail(`${ACTIVE_SCOPE_LABEL} için açık ürün sahibi yayın kapısı etkin değil`);
    }
    const protectedProductionWorkflow =
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.GITHUB_REF === "refs/heads/master" &&
      process.env.GITHUB_WORKFLOW === ACTIVE_PRODUCTION_WORKFLOW;
    if (
      !isEducationV2P1ACycle5To8SeedRequestAuthorized({
        dryRun,
        operation: process.env[ACTIVE_OPERATION_ENV],
        confirmation: process.env[ACTIVE_CONFIRMATION_ENV],
        graphScope: ACTIVE_GRAPH_SCOPE,
        productionApproval: process.env[PRODUCTION_APPROVAL_ENV],
        expectedProductionApproval: PRODUCTION_CONFIRMATION,
        protectedProductionWorkflow: protectedProductionWorkflow,
      })
    ) {
      fail(
        dryRun
          ? "read-only plan için PLAN_ONLY onayı veya korumalı APPLY ön onayı gerekli"
          : `${ACTIVE_SCOPE_LABEL} APPLY için korumalı workflow ve açık yayın onayı gerekli`,
      );
    }
    if (!dryRun) assertPitrRestoreEvidence();
  }
  return { ...target, approvedTarget, approvedFingerprint };
}

async function readIdentity(prisma: PrismaClient): Promise<Identity> {
  const rows = await prisma.$queryRaw<Identity[]>`
    SELECT current_database() AS database,
           current_user AS db_user,
           inet_server_addr()::text AS host,
           inet_server_port() AS port
  `;
  const identity = rows[0];
  if (!identity) fail("database kimliği okunamadı");
  return identity;
}

async function verifyTarget(
  prisma: PrismaClient,
  target: Target,
  identity: Identity,
): Promise<void> {
  assertLiveCatalogTargetIdentity(target, identity);
  const approvedPrisma = new PrismaClient({
    datasources: { db: { url: target.approvedTarget.url } },
  });
  try {
    await approvedPrisma.$connect();
    const approvedIdentity = await readIdentity(approvedPrisma);
    assertLiveCatalogTargetIdentity(target.approvedTarget, approvedIdentity);
    assertApprovedTargetFingerprint(
      target.approvedTarget,
      approvedIdentity,
      target.approvedFingerprint,
    );
  } finally {
    await approvedPrisma.$disconnect();
  }
}

function planRecords(skills: Array<{ id: string; code: string }>): Plan[] {
  const skillByCode = new Map(skills.map((skill) => [skill.code, skill.id]));
  return ACTIVE_PROGRAM.content.map((content) => {
    const skillId = skillByCode.get(content.skillCode);
    if (!skillId) fail(`gerekli mevcut skill bulunamadı: ${content.skillCode}`);
    const sourceStation = ACTIVE_SOURCE_CYCLE.sourceStations.find(
      (candidate) => candidate.key === content.key,
    );
    if (!sourceStation) fail(`kaynak taslak istasyonu bulunamadı: ${content.key}`);
    const mappedCurriculumSkills = mapCurriculumSkillCodesToStoredSkillCodes(
      sourceStation.skillCodes,
    );
    if (mappedCurriculumSkills.unmappedSkillCodes.length > 0)
      fail(
        `kaynak kazanım becerileri uygulama kataloğuna eşlenemiyor: ${mappedCurriculumSkills.unmappedSkillCodes.join(", ")}`,
      );
    const curriculumSkills = [
      ...new Map(
        [content.skillCode, ...mappedCurriculumSkills.storedSkillCodes]
          .map((code) => {
            const id = skillByCode.get(code);
            if (!id) fail(`kazanım için mevcut uygulama becerisi bulunamadı: ${code}`);
            return { code, id };
          })
          .map((skill) => [skill.id, skill]),
      ).values(),
    ];
    const exercise = ACTIVE_PROGRAM.exercises.find(
      (candidate) => candidate.contentKey === content.key,
    );
    const questions = exercise
      ? exercise.questions.map((candidate, position) => ({
          id: activeQuestionId(exercise.key, candidate.key),
          versionId: activeQuestionVersionId(exercise.key, candidate.key),
          question: candidate,
          position,
        }))
      : [];
    return {
      content,
      sourceStation,
      contentId: activeId("content", content.key),
      contentVersionId: activeContentVersionId(content.key),
      skillId,
      curriculumSkills,
      exercise,
      exerciseTemplateId: exercise ? activeTemplateId(exercise.key) : undefined,
      exerciseTemplateVersionId: exercise ? activeTemplateVersionId(exercise.key) : undefined,
      questions,
    };
  });
}

function answerFor(question: Plan["questions"][number]["question"]): Prisma.InputJsonValue {
  return educationV2P1ACycle5To8AnswerKey(question) as Prisma.InputJsonValue;
}

function runtimeVersionConfig(
  exercise: NonNullable<Plan["exercise"]>,
): TrainingExerciseVersionConfig {
  try {
    return parseTrainingExerciseVersionConfig(exercise.contract);
  } catch {
    fail(
      `Cycle ${ACTIVE_SEQUENCE} exercise version config veya renderer tanımı geçersiz: ${exercise.key}`,
    );
  }
}

function templateConfig(exercise: NonNullable<Plan["exercise"]>): Prisma.InputJsonValue {
  const config = runtimeVersionConfig(exercise);
  return {
    programId: ACTIVE_PROGRAM_ID,
    stableKey: `EDU-V2-P1-A-CYCLE-${ACTIVE_SEQUENCE}-${exercise.key.toUpperCase().replaceAll("-", "_")}`,
    version: ACTIVE_VERSION,
    competency: config.competency,
    rendererKey: config.rendererKey,
    contentKey: exercise.contentKey,
  };
}

function assessmentConfig(assessment: Program["assessments"][number]): Prisma.InputJsonValue {
  const exercise = ACTIVE_PROGRAM.exercises.find(
    (candidate) => candidate.key === assessment.templateExerciseKey,
  );
  if (!exercise) fail(`assessment template bulunamadı: ${assessment.key}`);
  return {
    programId: ACTIVE_PROGRAM_ID,
    templateId: activeTemplateId(exercise.key),
    templateVersionId: activeTemplateVersionId(exercise.key),
    questionCount: assessment.config.questionCount,
    minimumScorableCount: assessment.config.minimumScorableCount,
    minimumAnsweredCount: assessment.config.minimumAnsweredCount,
    completionMinimumScore: assessment.config.completionMinimumScore,
  };
}

function flattenedSteps() {
  return ACTIVE_PROGRAM.path.units.flatMap((unit) => unit.steps);
}

async function graphState(
  tx: Prisma.TransactionClient,
  plans: Plan[],
): Promise<"MISSING" | "EXISTING" | "SKILL_LINKS_MISSING" | "CONFLICT"> {
  const contentIds = plans.map((plan) => plan.contentId);
  const contentVersionIds = plans.map((plan) => plan.contentVersionId);
  const templateIds = plans.flatMap((plan) =>
    plan.exerciseTemplateId ? [plan.exerciseTemplateId] : [],
  );
  const templateVersionIds = plans.flatMap((plan) =>
    plan.exerciseTemplateVersionId ? [plan.exerciseTemplateVersionId] : [],
  );
  const questionIds = plans.flatMap((plan) => plan.questions.map((question) => question.id));
  const questionVersionIds = plans.flatMap((plan) =>
    plan.questions.map((question) => question.versionId),
  );
  const assessmentIds = ACTIVE_PROGRAM.assessments.map((assessment) =>
    activeAssessmentId(assessment.key),
  );
  const pathId = activeId("path", ACTIVE_PROGRAM.path.code);
  const unitIds = ACTIVE_PROGRAM.path.units.map((unit) => activeId("unit", unit.code));
  const stepIds = flattenedSteps().map((step) => activeId("step", step.key));

  const [
    contents,
    versions,
    contentSkills,
    templates,
    templateVersions,
    templateContents,
    templateQuestions,
    questions,
    questionVersions,
    assessments,
    paths,
    units,
    steps,
  ] = await Promise.all([
    tx.content.findMany({
      where: { id: { in: contentIds } },
      select: {
        id: true,
        tenantId: true,
        status: true,
        currentVersionId: true,
        type: true,
        title: true,
        difficulty: true,
        metadata: true,
      },
    }),
    tx.contentVersion.findMany({
      where: { id: { in: contentVersionIds } },
      select: {
        id: true,
        contentId: true,
        version: true,
        title: true,
        body: true,
        wordCount: true,
        license: true,
        changelog: true,
        metadata: true,
        status: true,
        publishedAt: true,
      },
    }),
    tx.contentSkill.findMany({
      where: { contentId: { in: contentIds } },
      select: { contentId: true, skillId: true },
    }),
    tx.exerciseTemplate.findMany({
      where: { id: { in: templateIds } },
      select: {
        id: true,
        tenantId: true,
        title: true,
        type: true,
        skillId: true,
        contentId: true,
        config: true,
        status: true,
      },
    }),
    tx.exerciseTemplateVersion.findMany({
      where: { id: { in: templateVersionIds } },
      select: {
        id: true,
        templateId: true,
        version: true,
        config: true,
        status: true,
        publishedAt: true,
      },
    }),
    tx.exerciseTemplateVersionContent.findMany({
      where: { templateVersionId: { in: templateVersionIds } },
      select: { templateVersionId: true, contentVersionId: true, position: true },
    }),
    tx.exerciseTemplateVersionQuestion.findMany({
      where: { templateVersionId: { in: templateVersionIds } },
      select: {
        templateVersionId: true,
        questionVersionId: true,
        questionId: true,
        position: true,
      },
    }),
    tx.question.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true,
        contentId: true,
        position: true,
        type: true,
        skillId: true,
        status: true,
        metadata: true,
      },
    }),
    tx.questionVersion.findMany({
      where: { id: { in: questionVersionIds } },
      select: {
        id: true,
        questionId: true,
        contentVersionId: true,
        version: true,
        prompt: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        hint: true,
        difficulty: true,
        generationMetadata: true,
        status: true,
        publishedAt: true,
      },
    }),
    tx.assessment.findMany({
      where: { id: { in: assessmentIds } },
      select: { id: true, tenantId: true, title: true, type: true, config: true, status: true },
    }),
    tx.learningPath.findMany({
      where: { id: pathId },
      select: {
        id: true,
        tenantId: true,
        code: true,
        title: true,
        area: true,
        levelId: true,
        status: true,
        version: true,
      },
    }),
    tx.learningUnit.findMany({
      where: { id: { in: unitIds } },
      select: {
        id: true,
        tenantId: true,
        pathId: true,
        code: true,
        title: true,
        position: true,
        status: true,
      },
    }),
    tx.learningStep.findMany({
      where: { id: { in: stepIds } },
      select: {
        id: true,
        tenantId: true,
        unitId: true,
        stableKey: true,
        title: true,
        position: true,
        type: true,
        source: true,
        status: true,
        isActive: true,
        skillId: true,
        contentVersionId: true,
        exerciseTemplateVersionId: true,
        assessmentId: true,
        prerequisiteStepId: true,
        completionRule: true,
        metadata: true,
      },
    }),
  ]);
  const existingCount =
    contents.length +
    versions.length +
    templates.length +
    templateVersions.length +
    questions.length +
    questionVersions.length +
    assessments.length +
    paths.length +
    units.length +
    steps.length;
  if (existingCount === 0) return "MISSING";

  const expectedCount =
    contentIds.length +
    contentVersionIds.length +
    templateIds.length +
    templateVersionIds.length +
    questionIds.length +
    questionVersionIds.length +
    assessmentIds.length +
    1 +
    unitIds.length +
    stepIds.length;
  if (existingCount !== expectedCount) return "CONFLICT";

  const skillLinkComparison = compareContentSkillLinks(
    expectedContentSkillLinks(plans),
    contentSkills,
  );
  if (skillLinkComparison.state === "CONFLICT") return "CONFLICT";

  const contentById = new Map(contents.map((item) => [item.id, item]));
  const versionById = new Map(versions.map((item) => [item.id, item]));
  const templateById = new Map(templates.map((item) => [item.id, item]));
  const templateVersionById = new Map(templateVersions.map((item) => [item.id, item]));
  const questionById = new Map(questions.map((item) => [item.id, item]));
  const questionVersionById = new Map(questionVersions.map((item) => [item.id, item]));
  const unitById = new Map(units.map((item) => [item.id, item]));
  const stepByKey = new Map(steps.map((item) => [item.stableKey, item]));
  const sourceStationByKey = new Map(
    ACTIVE_SOURCE_CYCLE.sourceStations.map((station) => [station.key, station]),
  );
  const expectedStepByKey = new Map(flattenedSteps().map((step) => [step.key, step]));
  const path = paths[0];
  const graphIsPublished =
    path?.version === ACTIVE_VERSION &&
    path.tenantId === null &&
    path.code === ACTIVE_PROGRAM.path.code &&
    path.title === ACTIVE_PROGRAM.path.title &&
    path.area === "READING_COMPREHENSION" &&
    path.levelId === null &&
    path.status === "PUBLISHED" &&
    contents.every((item) => {
      const plan = plans.find((candidate) => candidate.contentId === item.id);
      return (
        plan !== undefined &&
        item.tenantId === null &&
        item.type === "PASSAGE" &&
        item.title === plan.content.title &&
        item.difficulty === plan.content.difficulty &&
        item.status === "PUBLISHED" &&
        item.currentVersionId === plan.contentVersionId &&
        canonicalJson(item.metadata) ===
          canonicalJson({
            programId: ACTIVE_PROGRAM_ID,
            contentKey: plan.content.key,
            contentOrigin: plan.sourceStation.contentOrigin,
            provenanceStatus: plan.sourceStation.provenanceStatus,
          })
      );
    }) &&
    versions.every((item) => {
      const plan = plans.find((candidate) => candidate.contentVersionId === item.id);
      return (
        plan !== undefined &&
        item.contentId === plan.contentId &&
        item.version === 1 &&
        item.title === plan.content.title &&
        item.body === plan.content.body &&
        item.wordCount === wordCount(plan.content.body) &&
        item.license === "Özgün OkuPratik eğitim içeriği." &&
        item.changelog === `${ACTIVE_PROGRAM_ID}; contentKey=${plan.content.key}` &&
        canonicalJson(item.metadata) === canonicalJson(contentVersionMetadata(plan)) &&
        item.status === "PUBLISHED" &&
        item.publishedAt !== null
      );
    }) &&
    templates.every((item) => {
      const plan = plans.find((candidate) => candidate.exerciseTemplateId === item.id);
      return (
        plan?.exercise !== undefined &&
        item.tenantId === null &&
        item.title === plan.exercise.title &&
        item.type === plan.exercise.templateType &&
        item.skillId === plan.skillId &&
        item.contentId === plan.contentId &&
        canonicalJson(item.config) === canonicalJson(templateConfig(plan.exercise)) &&
        item.status === "PUBLISHED"
      );
    }) &&
    templateVersions.every((item) => {
      const plan = plans.find((candidate) => candidate.exerciseTemplateVersionId === item.id);
      return (
        plan?.exercise !== undefined &&
        item.templateId === plan.exerciseTemplateId &&
        item.version === 1 &&
        canonicalJson(item.config) === canonicalJson(runtimeVersionConfig(plan.exercise)) &&
        item.status === "PUBLISHED" &&
        item.publishedAt !== null
      );
    }) &&
    questions.every((item) => {
      const plan = plans.find((candidate) => candidate.contentId === item.contentId);
      const expected = plan?.questions.find((candidate) => candidate.id === item.id);
      return (
        plan !== undefined &&
        expected !== undefined &&
        item.position === expected.position &&
        item.type === "MULTIPLE_CHOICE" &&
        item.skillId === plan.skillId &&
        item.status === "PUBLISHED" &&
        canonicalJson(item.metadata) ===
          canonicalJson({
            programId: ACTIVE_PROGRAM_ID,
            contentOrigin: plan.sourceStation.contentOrigin,
            provenanceStatus: plan.sourceStation.provenanceStatus,
          })
      );
    }) &&
    questionVersions.every((item) => {
      const plan = plans.find((candidate) =>
        candidate.questions.some((question) => question.versionId === item.id),
      );
      const expected = plan?.questions.find((question) => question.versionId === item.id);
      return (
        plan !== undefined &&
        expected !== undefined &&
        item.questionId === expected.id &&
        item.contentVersionId === plan.contentVersionId &&
        item.version === 1 &&
        item.prompt === expected.question.prompt &&
        canonicalJson(item.options) === canonicalJson(expected.question.options) &&
        canonicalJson(item.correctAnswer) === canonicalJson(answerFor(expected.question)) &&
        item.explanation === expected.question.explanation &&
        item.hint === expected.question.hint &&
        item.difficulty === expected.question.difficulty &&
        canonicalJson(item.generationMetadata) ===
          canonicalJson({
            programId: ACTIVE_PROGRAM_ID,
            contentOrigin: plan.sourceStation.contentOrigin,
            provenanceStatus: plan.sourceStation.provenanceStatus,
          }) &&
        item.status === "PUBLISHED" &&
        item.publishedAt !== null
      );
    }) &&
    assessments.every((item) => {
      const plan = ACTIVE_PROGRAM.assessments.find(
        (assessment) => activeAssessmentId(assessment.key) === item.id,
      );
      return (
        plan !== undefined &&
        item.tenantId === null &&
        item.title === plan.title &&
        item.type === "DIAGNOSTIC" &&
        canonicalJson(item.config) === canonicalJson(assessmentConfig(plan)) &&
        item.status === "PUBLISHED"
      );
    }) &&
    units.every((item) => {
      const expected = ACTIVE_PROGRAM.path.units.find(
        (unit) => activeId("unit", unit.code) === item.id,
      );
      return (
        expected !== undefined &&
        item.tenantId === null &&
        item.pathId === pathId &&
        item.code === expected.code &&
        item.title === expected.title &&
        item.position === expected.position &&
        item.status === "PUBLISHED"
      );
    }) &&
    steps.every((item) => {
      const expected = expectedStepByKey.get(item.stableKey.replace(`${ACTIVE_PROGRAM_ID}:`, ""));
      const expectedUnit = expected
        ? ACTIVE_PROGRAM.path.units.find((unit) =>
            unit.steps.some((step) => step.key === expected.key),
          )
        : undefined;
      const expectedPreviousKey = expected?.prerequisiteStepKeys?.[0];
      const expectedPreviousId = expectedPreviousKey
        ? stepByKey.get(`${ACTIVE_PROGRAM_ID}:${expectedPreviousKey}`)?.id
        : null;
      const sourceStation = expected ? sourceStationByKey.get(expected.key) : undefined;
      const expectedSkillCode = sourceStation
        ? singleStoredSkillCodeForOutcome(sourceStation.skillCodes)
        : null;
      const expectedSkillId = expectedSkillCode
        ? (plans
            .flatMap((plan) => plan.curriculumSkills)
            .find((skill) => skill.code === expectedSkillCode)?.id ?? null)
        : null;
      return (
        expected !== undefined &&
        item.tenantId === null &&
        unitById.get(item.unitId)?.code === expectedUnit?.code &&
        item.stableKey === `${ACTIVE_PROGRAM_ID}:${expected.key}` &&
        item.type === expected.type &&
        item.title === expected.title &&
        expectedUnit !== undefined &&
        item.position === expectedUnit.steps.findIndex((step) => step.key === expected.key) + 1 &&
        item.source === "SYSTEM_DRIVEN" &&
        item.status === "PUBLISHED" &&
        item.isActive &&
        item.contentVersionId ===
          (expected.contentKey ? activeContentVersionId(expected.contentKey) : null) &&
        item.exerciseTemplateVersionId ===
          (expected.exerciseKey ? activeTemplateVersionId(expected.exerciseKey) : null) &&
        item.assessmentId ===
          (expected.assessmentKey ? activeAssessmentId(expected.assessmentKey) : null) &&
        item.skillId === expectedSkillId &&
        item.prerequisiteStepId === expectedPreviousId &&
        canonicalJson(item.completionRule) ===
          canonicalJson({
            ...(expected.completionRule ?? {}),
            ...(expected.prerequisiteStepKeys?.length
              ? {
                  prerequisiteStepIds: expected.prerequisiteStepKeys.map(
                    (key) => stepByKey.get(`${ACTIVE_PROGRAM_ID}:${key}`)?.id,
                  ),
                }
              : {}),
          }) &&
        canonicalJson(item.metadata) ===
          canonicalJson({
            programId: ACTIVE_PROGRAM_ID,
            cycleVersion: ACTIVE_VERSION,
            routeFamily: "P1-A",
            area: ACTIVE_PROGRAM.path.area,
            unitCode: expectedUnit?.code,
            stepType: expected.type,
            skillCode: expectedSkillCode,
            outcomeSkillCodes: sourceStation?.skillCodes ?? [],
          })
      );
    }) &&
    templateContents.length === templateVersionIds.length &&
    templateContents.every((item) => {
      const plan = plans.find(
        (candidate) => candidate.exerciseTemplateVersionId === item.templateVersionId,
      );
      return plan?.contentVersionId === item.contentVersionId && item.position === 0;
    }) &&
    templateQuestions.length === questionVersionIds.length &&
    templateQuestions.every((item) => {
      const plan = plans.find(
        (candidate) => candidate.exerciseTemplateVersionId === item.templateVersionId,
      );
      const question = plan?.questions.find(
        (candidate) => candidate.versionId === item.questionVersionId,
      );
      return (
        question !== undefined &&
        question.id === item.questionId &&
        question.position === item.position
      );
    }) &&
    plans.every((plan) => {
      const content = contentById.get(plan.contentId);
      const version = versionById.get(plan.contentVersionId);
      const template = plan.exerciseTemplateId
        ? templateById.get(plan.exerciseTemplateId)
        : undefined;
      const templateVersion = plan.exerciseTemplateVersionId
        ? templateVersionById.get(plan.exerciseTemplateVersionId)
        : undefined;
      return (
        content?.currentVersionId === plan.contentVersionId &&
        version?.contentId === plan.contentId &&
        (!plan.exerciseTemplateId || template?.status === "PUBLISHED") &&
        (!plan.exerciseTemplateVersionId ||
          templateVersion?.templateId === plan.exerciseTemplateId) &&
        plan.questions.every((question) => {
          const row = questionById.get(question.id);
          const rowVersion = questionVersionById.get(question.versionId);
          return (
            row?.contentId === plan.contentId &&
            rowVersion?.questionId === question.id &&
            rowVersion.contentVersionId === plan.contentVersionId
          );
        })
      );
    });
  return graphIsPublished
    ? skillLinkComparison.state === "MISSING"
      ? "SKILL_LINKS_MISSING"
      : "EXISTING"
    : "CONFLICT";
}

async function repairMissingContentSkillLinks(
  tx: Prisma.TransactionClient,
  plans: readonly Plan[],
): Promise<number> {
  const result = await ensureContentSkillLinks(tx.contentSkill, expectedContentSkillLinks(plans));
  if (result.state === "CONFLICT")
    fail("mevcut ContentSkill ilişkileri kaynak planıyla çelişiyor; otomatik değişiklik yapılmadı");
  return result.insertedCount;
}

async function createContentGraph(tx: Prisma.TransactionClient, plans: Plan[]): Promise<void> {
  const publishedAt = new Date();
  for (const plan of plans) {
    const content = await tx.content.create({
      data: {
        id: plan.contentId,
        tenantId: null,
        type: "PASSAGE",
        title: plan.content.title,
        difficulty: plan.content.difficulty,
        status: "DRAFT",
        metadata: asJson({
          programId: ACTIVE_PROGRAM_ID,
          contentKey: plan.content.key,
          contentOrigin: plan.sourceStation.contentOrigin,
          provenanceStatus: plan.sourceStation.provenanceStatus,
        }),
      },
    });
    const version = await tx.contentVersion.create({
      data: {
        id: plan.contentVersionId,
        contentId: content.id,
        version: 1,
        title: plan.content.title,
        body: plan.content.body,
        wordCount: wordCount(plan.content.body),
        license: "Özgün OkuPratik eğitim içeriği.",
        changelog: `${ACTIVE_PROGRAM_ID}; contentKey=${plan.content.key}`,
        metadata: asJson(contentVersionMetadata(plan)),
        status: "DRAFT",
      },
    });
    for (const skill of plan.curriculumSkills) {
      await tx.contentSkill.create({ data: { contentId: content.id, skillId: skill.id } });
    }

    const questionVersionByKey = new Map<string, { id: string; questionId: string }>();
    for (const planned of plan.questions) {
      const question = await tx.question.create({
        data: {
          id: planned.id,
          contentId: content.id,
          position: planned.position,
          type: "MULTIPLE_CHOICE",
          skillId: plan.skillId,
          status: "DRAFT",
          metadata: asJson({
            programId: ACTIVE_PROGRAM_ID,
            contentOrigin: plan.sourceStation.contentOrigin,
            provenanceStatus: plan.sourceStation.provenanceStatus,
          }),
        },
      });
      const questionVersion = await tx.questionVersion.create({
        data: {
          id: planned.versionId,
          questionId: question.id,
          contentVersionId: version.id,
          version: 1,
          prompt: planned.question.prompt,
          options: asJson(planned.question.options),
          correctAnswer: answerFor(planned.question),
          explanation: planned.question.explanation,
          hint: planned.question.hint,
          difficulty: planned.question.difficulty,
          status: "DRAFT",
          generationMetadata: asJson({
            programId: ACTIVE_PROGRAM_ID,
            contentOrigin: plan.sourceStation.contentOrigin,
            provenanceStatus: plan.sourceStation.provenanceStatus,
          }),
        },
      });
      questionVersionByKey.set(planned.question.key, {
        id: questionVersion.id,
        questionId: question.id,
      });
    }

    if (plan.exercise && plan.exerciseTemplateId && plan.exerciseTemplateVersionId) {
      const template = await tx.exerciseTemplate.create({
        data: {
          id: plan.exerciseTemplateId,
          tenantId: null,
          title: plan.exercise.title,
          type: plan.exercise.templateType,
          skillId: plan.skillId,
          contentId: content.id,
          config: templateConfig(plan.exercise),
          status: "DRAFT",
        },
      });
      const templateVersion = await tx.exerciseTemplateVersion.create({
        data: {
          id: plan.exerciseTemplateVersionId,
          templateId: template.id,
          version: 1,
          config: asJson(runtimeVersionConfig(plan.exercise)),
          status: "DRAFT",
        },
      });
      await tx.exerciseTemplateVersionContent.create({
        data: { templateVersionId: templateVersion.id, contentVersionId: version.id, position: 0 },
      });
      await tx.exerciseTemplateVersionQuestion.createMany({
        data: plan.questions.map((planned) => {
          const questionVersion = questionVersionByKey.get(planned.question.key);
          if (!questionVersion) fail(`question version bulunamadı: ${planned.question.key}`);
          return {
            templateVersionId: templateVersion.id,
            questionVersionId: questionVersion.id,
            questionId: questionVersion.questionId,
            position: planned.position,
          };
        }),
      });
    }

    await tx.contentVersion.update({
      where: { id: version.id },
      data: { status: "PUBLISHED", publishedAt },
    });
    await tx.content.update({
      where: { id: content.id },
      data: { currentVersionId: version.id, status: "PUBLISHED" },
    });
    await tx.questionVersion.updateMany({
      where: { questionId: { in: plan.questions.map((question) => question.id) } },
      data: { status: "PUBLISHED", publishedAt },
    });
    await tx.question.updateMany({
      where: { id: { in: plan.questions.map((question) => question.id) } },
      data: { status: "PUBLISHED" },
    });
    if (plan.exerciseTemplateId && plan.exerciseTemplateVersionId) {
      await tx.exerciseTemplateVersion.update({
        where: { id: plan.exerciseTemplateVersionId },
        data: { status: "PUBLISHED", publishedAt },
      });
      await tx.exerciseTemplate.update({
        where: { id: plan.exerciseTemplateId },
        data: { status: "PUBLISHED" },
      });
    }
  }

  for (const assessment of ACTIVE_PROGRAM.assessments) {
    await tx.assessment.create({
      data: {
        id: activeAssessmentId(assessment.key),
        tenantId: null,
        title: assessment.title,
        type: "DIAGNOSTIC",
        config: assessmentConfig(assessment),
        status: "PUBLISHED",
      },
    });
  }
}

async function createLearningPath(tx: Prisma.TransactionClient, plans: Plan[]): Promise<void> {
  const path = ACTIVE_PROGRAM.path;
  const pathId = activeId("path", path.code);
  await tx.learningPath.create({
    data: {
      id: pathId,
      tenantId: null,
      code: path.code,
      title: path.title,
      area: path.area,
      levelId: null,
      version: ACTIVE_VERSION,
      status: "PUBLISHED",
    },
  });
  const steps = flattenedSteps();
  const stepIdByKey = new Map(steps.map((step) => [step.key, activeId("step", step.key)]));
  const contentVersionByKey = new Map(
    ACTIVE_PROGRAM.content.map((content) => [content.key, activeContentVersionId(content.key)]),
  );
  const templateVersionByKey = new Map(
    ACTIVE_PROGRAM.exercises.map((exercise) => [
      exercise.key,
      activeTemplateVersionId(exercise.key),
    ]),
  );
  const assessmentByKey = new Map(
    ACTIVE_PROGRAM.assessments.map((assessment) => [
      assessment.key,
      activeAssessmentId(assessment.key),
    ]),
  );
  const skillIdByCode = new Map(
    plans.flatMap((plan) => plan.curriculumSkills.map((skill) => [skill.code, skill.id] as const)),
  );
  const sourceStationByKey = new Map(
    ACTIVE_SOURCE_CYCLE.sourceStations.map((station) => [station.key, station]),
  );

  for (const unit of path.units) {
    const unitId = activeId("unit", unit.code);
    await tx.learningUnit.create({
      data: {
        id: unitId,
        tenantId: null,
        pathId,
        code: unit.code,
        title: unit.title,
        position: unit.position,
        status: "PUBLISHED",
      },
    });
    for (const [index, step] of unit.steps.entries()) {
      const contentVersionId = step.contentKey
        ? contentVersionByKey.get(step.contentKey)
        : undefined;
      const templateVersionId = step.exerciseKey
        ? templateVersionByKey.get(step.exerciseKey)
        : undefined;
      const assessmentId = step.assessmentKey ? assessmentByKey.get(step.assessmentKey) : undefined;
      const prerequisites = step.prerequisiteStepKeys ?? [];
      const prerequisiteStepIds = prerequisites.map((key) => {
        const id = stepIdByKey.get(key);
        if (!id) fail(`ön koşul step bulunamadı: ${step.key} -> ${key}`);
        return id;
      });
      if (step.type === "TEACHING" && !contentVersionId) {
        fail(`öğretim içeriği eksik: ${step.key}`);
      }
      if (["SMALL_STUDY", "PRACTICE", "REINFORCEMENT"].includes(step.type) && !templateVersionId) {
        fail(`alıştırma sürümü eksik: ${step.key}`);
      }
      if (step.type === "ASSESSMENT" && !assessmentId) fail(`değerlendirme eksik: ${step.key}`);
      const sourceStation = sourceStationByKey.get(step.key);
      if (!sourceStation) fail(`öğrenme adımı kaynak istasyonla eşleşmiyor: ${step.key}`);
      const skillCode = singleStoredSkillCodeForOutcome(sourceStation.skillCodes);
      const skillId = skillCode ? skillIdByCode.get(skillCode) : undefined;
      if (skillCode && !skillId) fail(`mevcut skill bulunamadı: ${skillCode}`);
      await tx.learningStep.create({
        data: {
          id: activeId("step", step.key),
          tenantId: null,
          unitId,
          stableKey: `${ACTIVE_PROGRAM_ID}:${step.key}`,
          title: step.title,
          position: index + 1,
          type: step.type,
          source: "SYSTEM_DRIVEN",
          status: "PUBLISHED",
          isActive: true,
          contentVersionId,
          exerciseTemplateVersionId: templateVersionId,
          assessmentId,
          skillId,
          prerequisiteStepId: prerequisiteStepIds[0] ?? null,
          completionRule: asJson({
            ...(step.completionRule ?? {}),
            ...(prerequisiteStepIds.length ? { prerequisiteStepIds } : {}),
          }),
          metadata: asJson({
            programId: ACTIVE_PROGRAM_ID,
            cycleVersion: ACTIVE_VERSION,
            routeFamily: "P1-A",
            area: path.area,
            unitCode: unit.code,
            stepType: step.type,
            skillCode: skillCode ?? null,
            outcomeSkillCodes: [...sourceStation.skillCodes],
          }),
        },
      });
    }
  }
}

function summary(target: Target | null, identity: Identity | null): Record<string, unknown> {
  return {
    environment: target?.environment ?? "MANIFEST_ONLY",
    database: identity?.database ?? target?.database ?? "NOT_CONNECTED",
    productionReleaseId:
      target?.environment === "PRODUCTION"
        ? (process.env[PRODUCTION_RELEASE_ID_ENV] ?? "NOT_PROVIDED")
        : "NOT_APPLICABLE",
    productionReleaseCommit:
      target?.environment === "PRODUCTION"
        ? (process.env[PRODUCTION_RELEASE_COMMIT_ENV] ?? "NOT_PROVIDED")
        : "NOT_APPLICABLE",
    immutableReleaseId: APPROVED_RELEASE_ID,
    expectedSourceCommit: ACTIVE_SOURCE_RELEASE_COMMIT || "NOT_AVAILABLE_OUTSIDE_ACTIONS",
    graphScope: ACTIVE_GRAPH_SCOPE,
    sequence: ACTIVE_SEQUENCE,
    programId: ACTIVE_PROGRAM_ID,
    pathCode: ACTIVE_PROGRAM.path.code,
    cycleVersion: ACTIVE_VERSION,
    unitCount: ACTIVE_PROGRAM.path.units.length,
    stepCount: flattenedSteps().length,
    contentCount: ACTIVE_PROGRAM.content.length,
    exerciseCount: ACTIVE_PROGRAM.exercises.length,
    questionCount: ACTIVE_PROGRAM.exercises.reduce(
      (sum, exercise) => sum + exercise.questions.length,
      0,
    ),
    assessmentCount: ACTIVE_PROGRAM.assessments.length,
    contentOriginCounts: {
      originalAuthoring: ACTIVE_SOURCE_CYCLE.sourceStations.filter(
        (station) => station.contentOrigin === "ORIGINAL_AUTHORING",
      ).length,
      sourceAdapted: ACTIVE_SOURCE_CYCLE.sourceStations.filter(
        (station) => station.contentOrigin === "SOURCE_ADAPTED",
      ).length,
    },
    sourceVerifiedCount: ACTIVE_SOURCE_CYCLE.sourceVerifiedStationCount,
    sourceReviewRequiredCount: ACTIVE_SOURCE_CYCLE.sourceStations.filter(
      (station) => station.provenanceStatus === "REVIEW_REQUIRED",
    ).length,
  };
}

async function main(): Promise<void> {
  const target = readTarget();
  if (!target) {
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: "MANIFEST_ONLY_DRY_RUN",
          ...summary(null, null),
          databaseAction: "NOT_RUN",
          publicationState: "NOT_VERIFIED",
          ready: false,
          dbChanged: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: target.url } },
    transactionOptions: { maxWait: 20_000, timeout: 120_000 },
  });
  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    await verifyTarget(prisma, target, identity);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_role', 'CONTENT_EDITOR', true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', 'education-v2-p1-a-cycle-5-8-provisioner', true)`;
      const requiredSkillCodes = [
        ...new Set([
          ...ACTIVE_PROGRAM.content.map((content) => content.skillCode),
          ...ACTIVE_SOURCE_CYCLE.sourceStations.flatMap((station) => {
            const mapped = mapCurriculumSkillCodesToStoredSkillCodes(station.skillCodes);
            if (mapped.unmappedSkillCodes.length > 0)
              fail(
                `kaynak kazanım becerileri uygulama kataloğuna eşlenemiyor: ${mapped.unmappedSkillCodes.join(", ")}`,
              );
            return mapped.storedSkillCodes;
          }),
        ]),
      ];
      const skills = await tx.skill.findMany({
        where: { code: { in: requiredSkillCodes } },
        select: { id: true, code: true },
      });
      if (skills.length !== requiredSkillCodes.length)
        fail("döngü için gerekli skill kataloğu eksik");
      const plans = planRecords(skills);
      let state = await graphState(tx, plans);
      const action = educationV2P1ACycle5To8SeedAction(state, dryRun);
      if (action === "STOP_CONFLICT")
        fail("stable graph kısmi veya uyumsuz; overwrite yapılmayacak");
      let missingSkillLinkCount = 0;
      if (state === "SKILL_LINKS_MISSING") {
        const comparison = await inspectContentSkillLinks(
          tx.contentSkill,
          expectedContentSkillLinks(plans),
        );
        if (comparison.state === "CONFLICT")
          fail("içerik-beceri bağlantıları kaynak planıyla çelişiyor");
        missingSkillLinkCount = comparison.missingLinks.length;
        if (comparison.state === "COMPLETE") {
          state = "EXISTING";
        }
      }
      const verifiedAction = educationV2P1ACycle5To8SeedAction(state, dryRun);
      if (verifiedAction === "REPAIR_SKILL_LINKS") {
        const insertedSkillLinkCount = await repairMissingContentSkillLinks(tx, plans);
        return {
          state: "SKILL_LINKS_REPAIRED",
          dbChanged: insertedSkillLinkCount > 0,
          missingSkillLinkCount,
          insertedSkillLinkCount,
        };
      }
      if (verifiedAction !== "CREATE_MISSING")
        return { state, dbChanged: false, missingSkillLinkCount };
      await createContentGraph(tx, plans);
      await createLearningPath(tx, plans);
      return { state, dbChanged: true };
    });
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: dryRun ? "DRY_RUN" : "APPLY",
          ...summary(target, identity),
          ...result,
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
    `Education V2 P1-A Cycle ${ACTIVE_SEQUENCE} seed FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
