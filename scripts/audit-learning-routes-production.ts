import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  LEARNING_ROUTE_CYCLES,
  learningRouteCycle,
  sourcePrimarySkillCodesForRouteStep,
} from "../src/curriculum/learning-route-catalog.js";
import {
  buildProductionLearningRouteAudit,
  classifyContentVersionLink,
  classifySkillLink,
  productionLearningRouteAuditStatus,
  type ProductionLearningRoutePathSnapshot,
  type ProductionLearningRouteStepSnapshot,
} from "../src/curriculum/production-learning-route-audit.js";
import { mapCurriculumSkillCodesToStoredSkillCodes } from "../src/curriculum/learning-step-skill-link.js";
import { parseCatalogTargetUrl } from "../src/curriculum/catalog-target-verification.js";
import { providerForHost, targetIdentityFingerprint } from "../src/lib/db-fingerprint-contract.js";
import { resolveTrainingRuntimeConfig } from "../src/modules/training/exercise-contract.js";

const AUDIT_SOURCE_COMMIT = process.env.GITHUB_SHA?.trim() || "UNVERIFIED";

type IdentityRow = {
  database: string;
  current_user: string;
  server_port: number;
  role_is_superuser: boolean;
  role_bypasses_rls: boolean;
};

function required(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function safeBlocked(reason: string, targetIdentity?: Record<string, string>) {
  return {
    status: "BLOCKED" as const,
    productionWrite: "NO" as const,
    transactionMode: "READ ONLY" as const,
    reason,
    auditSourceCommit: AUDIT_SOURCE_COMMIT,
    ...(targetIdentity ? { targetIdentity } : {}),
    noStudentIdentitiesIncluded: true,
    questionTextAndAnswerKeysIncluded: false,
  };
}

function matches(actual: string, expected: string, normalize = (value: string) => value) {
  return normalize(actual) === normalize(expected) ? "MATCH" : "MISMATCH";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function assessmentTemplateVersionId(config: unknown): string | null {
  const value = objectValue(config)?.templateVersionId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sameIds(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    [...actual].sort().every((id, index) => id === [...expected].sort()[index])
  );
}

async function main(): Promise<void> {
  const rawUrl = required("PRODUCTION_DATABASE_URL");
  const approvedFingerprint = required("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT")?.toLowerCase();
  const approvedProvider = required("PRODUCTION_DB_APPROVED_PROVIDER");
  const approvedHost = required("PRODUCTION_DB_APPROVED_HOST");
  const approvedPort = required("PRODUCTION_DB_APPROVED_PORT");
  const approvedDatabase = required("PRODUCTION_DB_APPROVED_DATABASE");
  const approvedUser = required("PRODUCTION_DB_APPROVED_USER");
  const environment = required("DB_FINGERPRINT_ENVIRONMENT");

  if (
    !rawUrl ||
    !approvedFingerprint ||
    !/^[0-9a-f]{64}$/u.test(approvedFingerprint) ||
    !approvedProvider ||
    !approvedHost ||
    !approvedPort ||
    !approvedDatabase ||
    !approvedUser ||
    environment?.toUpperCase() !== "PRODUCTION"
  ) {
    console.log(
      JSON.stringify(safeBlocked("approved production audit configuration is incomplete"), null, 2),
    );
    process.exitCode = 1;
    return;
  }

  let target: ReturnType<typeof parseCatalogTargetUrl>;
  try {
    target = parseCatalogTargetUrl(rawUrl, "PRODUCTION");
  } catch {
    console.log(
      JSON.stringify(safeBlocked("production database target could not be parsed"), null, 2),
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });
  try {
    const report = await prisma.$transaction(
      async (tx) => {
        // This must be the first statement in this transaction. All database
        // identity and graph reads below inherit PostgreSQL's read-only mode.
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const identityRows = await tx.$queryRaw<IdentityRow[]>`
          SELECT current_database() AS database,
                 current_user AS current_user,
                 inet_server_port() AS server_port,
                 role.rolsuper AS role_is_superuser,
                 role.rolbypassrls AS role_bypasses_rls
            FROM pg_roles AS role
           WHERE role.rolname = current_user
        `;
        const identity = identityRows[0];
        if (!identity) return safeBlocked("production target identity query returned no row");

        const actualProvider = providerForHost(target.host);
        const actualPort = String(identity.server_port || target.port);
        const actualFingerprint = targetIdentityFingerprint({
          environment: "PRODUCTION",
          provider: actualProvider,
          host: target.host,
          port: target.port,
          database: identity.database,
          dbUser: identity.current_user,
        });
        const identityChecks = {
          environment: matches("PRODUCTION", environment, (value) => value.toUpperCase()),
          provider: matches(actualProvider, approvedProvider, (value) => value.toUpperCase()),
          host: matches(target.host, approvedHost, (value) =>
            value.toLowerCase().replace(/\.$/u, ""),
          ),
          port: matches(actualPort, approvedPort),
          database: matches(identity.database, approvedDatabase),
          currentUser: matches(identity.current_user, approvedUser),
          fingerprint: actualFingerprint === approvedFingerprint ? "MATCH" : "MISMATCH",
        };
        if (Object.values(identityChecks).some((result) => result !== "MATCH")) {
          return safeBlocked(
            "production target identity did not match the approved fingerprint",
            identityChecks,
          );
        }

        const rawPaths = await tx.learningPath.findMany({
          where: { code: { startsWith: "EDUCATION_V2_P1_" } },
          orderBy: [{ code: "asc" }, { version: "asc" }, { tenantId: "asc" }],
          select: {
            id: true,
            tenantId: true,
            code: true,
            version: true,
            area: true,
            status: true,
            deletedAt: true,
            level: { select: { code: true } },
            units: {
              orderBy: { position: "asc" },
              select: {
                code: true,
                position: true,
                status: true,
                steps: {
                  orderBy: { position: "asc" },
                  select: {
                    id: true,
                    stableKey: true,
                    position: true,
                    type: true,
                    status: true,
                    isActive: true,
                    prerequisiteStepId: true,
                    prerequisiteStep: {
                      select: { stableKey: true, unit: { select: { pathId: true } } },
                    },
                    completionRule: true,
                    contentVersionId: true,
                    contentVersion: {
                      select: {
                        id: true,
                        status: true,
                        content: {
                          select: {
                            status: true,
                            deletedAt: true,
                            contentSkills: {
                              select: { skillId: true, skill: { select: { code: true } } },
                            },
                          },
                        },
                      },
                    },
                    exerciseTemplateVersionId: true,
                    exerciseTemplateVersion: {
                      select: {
                        id: true,
                        status: true,
                        template: { select: { status: true, deletedAt: true } },
                        config: true,
                        contents: {
                          orderBy: { position: "asc" },
                          select: {
                            contentVersionId: true,
                            contentVersion: {
                              select: {
                                status: true,
                                content: {
                                  select: {
                                    status: true,
                                    deletedAt: true,
                                    contentSkills: {
                                      select: { skillId: true, skill: { select: { code: true } } },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                        questions: {
                          orderBy: { position: "asc" },
                          select: {
                            position: true,
                            questionVersionId: true,
                            questionVersion: {
                              select: {
                                status: true,
                                question: {
                                  select: {
                                    status: true,
                                    deletedAt: true,
                                    skillId: true,
                                    skill: { select: { code: true } },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                    assessmentId: true,
                    assessment: {
                      select: { status: true, deletedAt: true, config: true },
                    },
                    skillId: true,
                    skill: { select: { code: true, category: true } },
                  },
                },
              },
            },
          },
        });

        const assessmentTemplateIds = [
          ...new Set(
            rawPaths.flatMap((path) =>
              path.units.flatMap((unit) =>
                unit.steps.flatMap((step) =>
                  step.assessment
                    ? [assessmentTemplateVersionId(step.assessment.config)].filter(
                        (id): id is string => Boolean(id),
                      )
                    : [],
                ),
              ),
            ),
          ),
        ];
        const assessmentTemplates = assessmentTemplateIds.length
          ? await tx.exerciseTemplateVersion.findMany({
              where: { id: { in: assessmentTemplateIds } },
              select: {
                id: true,
                status: true,
                template: { select: { status: true, deletedAt: true } },
                contents: {
                  orderBy: { position: "asc" },
                  select: {
                    contentVersionId: true,
                    contentVersion: {
                      select: {
                        status: true,
                        content: {
                          select: {
                            status: true,
                            deletedAt: true,
                            contentSkills: {
                              select: { skillId: true, skill: { select: { code: true } } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                questions: {
                  orderBy: { position: "asc" },
                  select: {
                    position: true,
                    questionVersionId: true,
                    questionVersion: {
                      select: {
                        status: true,
                        question: {
                          select: {
                            status: true,
                            deletedAt: true,
                            skillId: true,
                            skill: { select: { code: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            })
          : [];
        const assessmentTemplateById = new Map(
          assessmentTemplates.map((version) => [version.id, version]),
        );

        const pathIds = rawPaths.map((path) => path.id);
        const enrollmentRows = pathIds.length
          ? await tx.studentLearningPath.groupBy({
              by: ["learningPathId", "routeStatus"],
              where: { learningPathId: { in: pathIds } },
              _count: { _all: true },
            })
          : [];
        const enrollments = enrollmentRows.map((row) => ({
          learningPathId: row.learningPathId,
          routeStatus: row.routeStatus,
          count: row._count._all,
        }));

        const paths: ProductionLearningRoutePathSnapshot[] = rawPaths.map((path) => {
          const cycle = learningRouteCycle(path.code);
          const expectedSteps = new Map(
            cycle?.manifest.steps.map((step) => [`${cycle.programId}:${step.stableKey}`, step]) ??
              [],
          );
          const stepRows = path.units.flatMap((unit) => unit.steps);
          const stepById = new Map(stepRows.map((step) => [step.id, step]));

          return {
            id: path.id,
            tenantId: path.tenantId,
            code: path.code,
            version: path.version,
            area: path.area,
            status: path.status,
            deletedAt: path.deletedAt,
            levelCode: path.level?.code ?? null,
            units: path.units.map((unit) => ({
              code: unit.code,
              position: unit.position,
              status: unit.status,
              steps: unit.steps.map((step): ProductionLearningRouteStepSnapshot => {
                const issues: string[] = [];
                const warnings: string[] = [];
                const expected = expectedSteps.get(step.stableKey);
                const assessmentTemplateId = assessmentTemplateVersionId(step.assessment?.config);
                const assessmentTemplate = assessmentTemplateId
                  ? assessmentTemplateById.get(assessmentTemplateId)
                  : undefined;
                const linkedTemplate = step.exerciseTemplateVersion ?? assessmentTemplate;
                const questionRows = linkedTemplate?.questions ?? [];
                const linkedContentRows = linkedTemplate?.contents ?? [];
                const questionVersionIds = questionRows.map((item) => item.questionVersionId);
                const linkedContentVersionIds = linkedContentRows.map(
                  (item) => item.contentVersionId,
                );
                const linkedContentSkillRows = [
                  ...(step.contentVersion?.content.contentSkills ?? []),
                  ...linkedContentRows.flatMap((item) => item.contentVersion.content.contentSkills),
                ];
                const linkedContentSkillCodes = [
                  ...new Set(
                    linkedContentSkillRows
                      .map((item) => item.skill.code)
                      .filter((code): code is string => Boolean(code)),
                  ),
                ];
                const unresolvedLinkedContentSkillCount = linkedContentSkillRows.filter(
                  (item) => !item.skill.code,
                ).length;
                const linkedQuestionSkillCodes = [
                  ...new Set(
                    questionRows
                      .map((item) => item.questionVersion.question.skill?.code ?? null)
                      .filter((code): code is string => Boolean(code)),
                  ),
                ];
                const unresolvedLinkedQuestionSkillCount = questionRows.filter(
                  (item) =>
                    item.questionVersion.question.skillId !== null &&
                    !item.questionVersion.question.skill?.code,
                ).length;
                const unpublishedQuestionVersionCount = questionRows.filter(
                  (item) =>
                    item.questionVersion.status !== "PUBLISHED" ||
                    item.questionVersion.question.status !== "PUBLISHED" ||
                    item.questionVersion.question.deletedAt !== null,
                ).length;
                const unpublishedLinkedContentVersionCount = linkedContentRows.filter(
                  (item) =>
                    item.contentVersion.status !== "PUBLISHED" ||
                    item.contentVersion.content.status !== "PUBLISHED" ||
                    item.contentVersion.content.deletedAt !== null,
                ).length;

                if (!expected && cycle) issues.push("SOURCE_STEP_UNMAPPED");
                if (!cycle) issues.push("SOURCE_PATH_UNMAPPED");
                if (step.status === "PUBLISHED" && !step.isActive)
                  issues.push("PUBLISHED_STEP_INACTIVE");
                if (unit.status !== "PUBLISHED" && step.status === "PUBLISHED")
                  issues.push("STEP_IN_UNPUBLISHED_UNIT");

                const smallStudyTemplateReady = Boolean(
                  step.type === "SMALL_STUDY" &&
                  step.exerciseTemplateVersionId &&
                  step.exerciseTemplateVersion?.status === "PUBLISHED" &&
                  step.exerciseTemplateVersion.template.status === "PUBLISHED" &&
                  step.exerciseTemplateVersion.template.deletedAt === null &&
                  resolveTrainingRuntimeConfig("TRAINING", step.exerciseTemplateVersion.config)
                    .status === "READY",
                );
                const contentVersionLink = classifyContentVersionLink({
                  required:
                    step.type === "TEACHING" ||
                    (step.type === "SMALL_STUDY" && !smallStudyTemplateReady),
                  fallbackResourceReady: smallStudyTemplateReady,
                  contentVersionId: step.contentVersionId,
                  relationVisible: Boolean(step.contentVersion),
                  versionStatus: step.contentVersion?.status ?? null,
                  contentStatus: step.contentVersion?.content.status ?? null,
                  contentDeleted: step.contentVersion
                    ? step.contentVersion.content.deletedAt !== null
                    : null,
                });
                if (contentVersionLink.issueCode) issues.push(contentVersionLink.issueCode);
                if (contentVersionLink.warningCode) warnings.push(contentVersionLink.warningCode);
                if (step.type === "PRACTICE" || step.type === "REINFORCEMENT") {
                  if (!step.exerciseTemplateVersionId || !step.exerciseTemplateVersion)
                    issues.push("EXERCISE_TEMPLATE_VERSION_MISSING");
                  else if (
                    step.exerciseTemplateVersion.status !== "PUBLISHED" ||
                    step.exerciseTemplateVersion.template.status !== "PUBLISHED" ||
                    step.exerciseTemplateVersion.template.deletedAt !== null
                  )
                    issues.push("EXERCISE_TEMPLATE_VERSION_NOT_PUBLISHED");
                  if (questionRows.length === 0) issues.push("EXERCISE_HAS_NO_QUESTION_VERSIONS");
                }
                if (step.type === "ASSESSMENT") {
                  if (!step.assessmentId || !step.assessment) issues.push("ASSESSMENT_MISSING");
                  else if (
                    step.assessment.status !== "PUBLISHED" ||
                    step.assessment.deletedAt !== null
                  )
                    issues.push("ASSESSMENT_NOT_PUBLISHED");
                  if (!assessmentTemplateId || !assessmentTemplate)
                    issues.push("ASSESSMENT_TEMPLATE_MISSING");
                  else if (
                    assessmentTemplate.status !== "PUBLISHED" ||
                    assessmentTemplate.template.status !== "PUBLISHED" ||
                    assessmentTemplate.template.deletedAt !== null
                  )
                    issues.push("ASSESSMENT_TEMPLATE_NOT_PUBLISHED");
                  if (questionRows.length === 0) issues.push("ASSESSMENT_HAS_NO_QUESTION_VERSIONS");
                }
                if (unpublishedQuestionVersionCount > 0)
                  issues.push("QUESTION_VERSION_NOT_PUBLISHED");
                if (unpublishedLinkedContentVersionCount > 0)
                  issues.push("LINKED_CONTENT_VERSION_NOT_PUBLISHED");

                const expectedQuestionIds =
                  expected?.exercise?.questionVersionIds ??
                  expected?.assessment?.questionVersionIds ??
                  [];
                const expectedResourceLinksMatch = Boolean(
                  expected &&
                  step.contentVersionId === (expected.content?.versionId ?? null) &&
                  step.exerciseTemplateVersionId === (expected.exercise?.versionId ?? null) &&
                  step.assessmentId === (expected.assessment?.versionId ?? null) &&
                  sameIds(questionVersionIds, expectedQuestionIds),
                );
                if (expected && !expectedResourceLinksMatch)
                  issues.push("SOURCE_RESOURCE_VERSION_MISMATCH");

                const expectedSkillCodes =
                  expected && cycle
                    ? [
                        ...new Set(
                          expected.learningOutcomeKeys.flatMap(
                            (key) =>
                              cycle.manifest.learningOutcomes.find((outcome) => outcome.key === key)
                                ?.targetSkillCodes ?? [],
                          ),
                        ),
                      ]
                    : [];
                const mappedSkillTargets =
                  mapCurriculumSkillCodesToStoredSkillCodes(expectedSkillCodes);
                const allowedAdditionalSkillCodes = mapCurriculumSkillCodesToStoredSkillCodes(
                  sourcePrimarySkillCodesForRouteStep(path.code, step.stableKey),
                ).storedSkillCodes;
                const skillLink = classifySkillLink({
                  expectedSkillCodes: mappedSkillTargets.storedSkillCodes,
                  allowedAdditionalSkillCodes,
                  unmappedExpectedSkillCodes: mappedSkillTargets.unmappedSkillCodes,
                  skillId: step.skillId,
                  skillCode: step.skill?.code ?? null,
                  linkedContentSkillCodes,
                  unresolvedLinkedContentSkillCount,
                  linkedQuestionSkillCodes,
                  unresolvedLinkedQuestionSkillCount,
                });
                if (skillLink.warningCode) warnings.push(skillLink.warningCode);
                warnings.push(...(skillLink.additionalWarningCodes ?? []));

                const configuredPrerequisiteIds = stringArray(
                  objectValue(step.completionRule)?.prerequisiteStepIds,
                );
                const prerequisiteIds = [
                  ...new Set([
                    ...(step.prerequisiteStepId ? [step.prerequisiteStepId] : []),
                    ...configuredPrerequisiteIds,
                  ]),
                ];
                const prerequisiteRows = prerequisiteIds.map((id) => stepById.get(id));
                if (prerequisiteRows.some((row) => !row))
                  issues.push("PREREQUISITE_MISSING_OR_OUTSIDE_PATH");
                if (step.prerequisiteStep && step.prerequisiteStep.unit.pathId !== path.id) {
                  issues.push("PREREQUISITE_OUTSIDE_PATH");
                }
                const expectedPrerequisites =
                  expected?.prerequisiteKeys.map((key) => `${cycle!.programId}:${key}`) ?? [];
                const actualPrerequisites = prerequisiteRows
                  .map((row) => row?.stableKey ?? null)
                  .filter((key): key is string => key !== null);
                if (!sameIds(actualPrerequisites, expectedPrerequisites))
                  issues.push("PREREQUISITE_MISMATCH");

                return {
                  id: step.id,
                  stableKey: step.stableKey,
                  position: step.position,
                  type: step.type,
                  status: step.status,
                  isActive: step.isActive,
                  prerequisiteStepId: step.prerequisiteStepId,
                  completionRule: step.completionRule,
                  contentVersionId: step.contentVersionId,
                  contentVersionLinkState: contentVersionLink.state,
                  contentVersionFallbackReady: smallStudyTemplateReady,
                  contentVersionStatus: step.contentVersion?.status ?? null,
                  contentStatus: step.contentVersion?.content.status ?? null,
                  contentDeleted:
                    step.contentVersion?.content.deletedAt !== undefined
                      ? step.contentVersion.content.deletedAt !== null
                      : null,
                  exerciseTemplateVersionId: step.exerciseTemplateVersionId,
                  exerciseTemplateVersionStatus: step.exerciseTemplateVersion?.status ?? null,
                  templateStatus: step.exerciseTemplateVersion?.template.status ?? null,
                  templateDeleted:
                    step.exerciseTemplateVersion?.template.deletedAt !== undefined
                      ? step.exerciseTemplateVersion.template.deletedAt !== null
                      : null,
                  assessmentId: step.assessmentId,
                  assessmentStatus: step.assessment?.status ?? null,
                  assessmentDeleted:
                    step.assessment?.deletedAt !== undefined
                      ? step.assessment.deletedAt !== null
                      : null,
                  assessmentTemplateVersionId: assessmentTemplateId,
                  assessmentTemplateVersionStatus: assessmentTemplate?.status ?? null,
                  assessmentTemplateStatus: assessmentTemplate?.template.status ?? null,
                  assessmentTemplateDeleted:
                    assessmentTemplate?.template.deletedAt !== undefined
                      ? assessmentTemplate.template.deletedAt !== null
                      : null,
                  questionVersionIds,
                  unpublishedQuestionVersionCount,
                  linkedContentVersionIds,
                  unpublishedLinkedContentVersionCount,
                  skillCode: step.skill?.code ?? null,
                  skillCategory: step.skill?.category ?? null,
                  linkedContentSkillCodes,
                  unresolvedLinkedContentSkillCount,
                  linkedQuestionSkillCodes,
                  unresolvedLinkedQuestionSkillCount,
                  allowedAdditionalSkillCodes,
                  expectedSkillCodes,
                  expectedStoredSkillCodes: mappedSkillTargets.storedSkillCodes,
                  unmappedExpectedSkillCodes: mappedSkillTargets.unmappedSkillCodes,
                  skillLinkState: skillLink.state,
                  prerequisiteStableKey: step.prerequisiteStep?.stableKey ?? null,
                  prerequisitePathId: step.prerequisiteStep?.unit.pathId ?? null,
                  configuredPrerequisiteIds,
                  configuredPrerequisiteStableKeys: prerequisiteRows.map(
                    (row) => row?.stableKey ?? null,
                  ),
                  expectedResourceLinksMatch,
                  issueCodes: [...new Set(issues)],
                  warningCodes: [...new Set(warnings)],
                };
              }),
            })),
          };
        });

        const routeAudit = buildProductionLearningRouteAudit({
          sourceCycles: LEARNING_ROUTE_CYCLES,
          paths,
          enrollments,
        });
        const rlsVisibility =
          identity.role_is_superuser || identity.role_bypasses_rls
            ? "RLS_BYPASS_CONFIRMED"
            : "RLS_FILTER_POSSIBLE";
        return {
          ...routeAudit,
          status: productionLearningRouteAuditStatus(
            routeAudit.routeIntegrityStatus,
            rlsVisibility,
          ),
          productionWrite: "NO" as const,
          transactionMode: "READ ONLY" as const,
          auditSourceCommit: AUDIT_SOURCE_COMMIT,
          targetIdentity: identityChecks,
          auditRoleVisibility: {
            superuser: identity.role_is_superuser,
            bypassRls: identity.role_bypasses_rls,
            tenantAndEnrollmentRows: rlsVisibility,
            countsDescribeOnlyRowsVisibleToThisRole: true,
          },
          routeScope: "P1_PATHS_VISIBLE_TO_AUDIT_ROLE",
          tenantScopedPathVisibility:
            rlsVisibility === "RLS_BYPASS_CONFIRMED"
              ? "ALL_SCOPES_VISIBLE"
              : "TENANT_SCOPED_ROWS_MAY_BE_FILTERED",
          pathAndStepCountsDescribeVisibleRowsOnly: true,
          enrollmentCountsAreVisibleToAuditRoleOnly: true,
        };
      },
      { maxWait: 10_000, timeout: 120_000 },
    );

    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "PASS") process.exitCode = 1;
  } catch {
    console.log(
      JSON.stringify(safeBlocked("read-only production route audit query failed"), null, 2),
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
