import { createHash } from "node:crypto";
import { TRAINING_ACTIVITY_CATALOG } from "./activities.js";
import {
  resolveTrainingRuntimeConfig,
  validateTrainingRuntimeGraphRow,
  type MainIdeaVersionRow,
} from "./runtime.js";

type ActivityId = (typeof TRAINING_ACTIVITY_CATALOG)[number]["id"];
type PositionBucket = "1" | "2" | "3" | "4" | "MULTIPLE_OR_UNRESOLVED";

export type TrainingInventoryVersion = MainIdeaVersionRow;

export type SafeTrainingInventoryReport = {
  status: "INVENTORY_COMPLETE_REVIEW_REQUIRED";
  productionWrite: "NO";
  semanticContentReview: "NOT_PERFORMED";
  versionCount: number;
  mappedActivityTemplateVersionCount: number;
  questionVersionReferenceCount: number;
  uniqueQuestionVersionCount: number;
  duplicateQuestionVersionReferences: number;
  duplicateQuestionReferences: number;
  unmappedPublishedTemplateVersions: Array<{
    templateId: string;
    templateVersionId: string;
    templateVersion: number;
    family: string | null;
    templateStatus: string;
    templateDeleted: boolean;
    templateScope: "GLOBAL" | "TENANT_SCOPED";
    configStatus: "READY" | "INVALID";
    runtimeGraph: "READY" | "INVALID";
    questionCount: number;
  }>;
  activities: Array<{
    activityId: ActivityId;
    family: string;
    publishedTemplateVersionCount: number;
    studentEligibleTemplateVersionCount: number;
    versions: Array<{
      templateId: string;
      templateVersionId: string;
      templateVersion: number;
      templateStatus: string;
      templateDeleted: boolean;
      templateScope: "GLOBAL" | "TENANT_SCOPED";
      configStatus: "READY" | "INVALID";
      difficulty: string | null;
      runtimeGraph: "READY" | "INVALID";
      questionCount: number;
      contentVersionInventory: Array<{
        position: number;
        contentId: string;
        contentVersionId: string;
        version: number;
        contentVersionStatus: string;
        contentStatus: string;
        contentDeleted: boolean;
      }>;
      questionVersionInventory: Array<{
        questionVersionId: string;
        version: number;
        status: string;
        questionStatus: string;
        questionType: string;
        contentVersionLinked: boolean;
      }>;
      questionStatusCounts: Record<string, number>;
      correctOptionPositionCounts: Record<PositionBucket, number>;
      correctOptionUniquelyLongestCount: number;
      correctOptionUniquelyShortestCount: number;
      missingQuestionContentLinkCount: number;
      invalidContentLinkStatusCount: number;
      duplicateQuestionReferences: number;
    }>;
  }>;
};

type OptionRecord = { id: string; text: string; position: number };

function readOptions(value: unknown): OptionRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const option = item as Record<string, unknown>;
    if (
      typeof option.id !== "string" ||
      typeof option.text !== "string" ||
      typeof option.position !== "number"
    ) {
      return [];
    }
    return [{ id: option.id, text: option.text, position: option.position }];
  });
}

function correctOptionIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const answer = value as Record<string, unknown>;
  return answer.type === "MULTIPLE_CHOICE" && Array.isArray(answer.correctOptionIds)
    ? answer.correctOptionIds.filter((id): id is string => typeof id === "string")
    : [];
}

function normalizedQuestionFingerprint(prompt: string, options: OptionRecord[]): string {
  const canonical = JSON.stringify({
    prompt: prompt.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("tr"),
    options: options
      .map((option) => option.text.normalize("NFKC").trim().replace(/\s+/gu, " "))
      .sort((left, right) => left.localeCompare(right, "tr"))
      .map((text) => text.toLocaleLowerCase("tr")),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function familyForConfig(config: unknown): string | null {
  if (!config || typeof config !== "object") return null;
  const family = (config as Record<string, unknown>).family;
  return typeof family === "string" ? family : null;
}

function bucketCounts(): Record<PositionBucket, number> {
  return { "1": 0, "2": 0, "3": 0, "4": 0, MULTIPLE_OR_UNRESOLVED: 0 };
}

/**
 * Produces metadata-only findings. Prompts, options, explanations, hints and
 * correct option IDs are read for calculation but are never included in the
 * returned report.
 */
export function buildSafeTrainingInventoryReport(
  rows: readonly TrainingInventoryVersion[],
): SafeTrainingInventoryReport {
  const activityByFamily = new Map<string, ActivityId>(
    TRAINING_ACTIVITY_CATALOG.map((activity) => [activity.family, activity.id]),
  );
  const duplicateCounts = new Map<string, number>();
  const questionRefs = new Set<string>();
  let questionVersionReferenceCount = 0;

  for (const row of rows) {
    for (const relation of row.questions) {
      const question = relation.questionVersion;
      questionVersionReferenceCount += 1;
      questionRefs.add(question.id);
      const options = readOptions(question.options);
      const fingerprint = normalizedQuestionFingerprint(question.prompt, options);
      duplicateCounts.set(fingerprint, (duplicateCounts.get(fingerprint) ?? 0) + 1);
    }
  }
  const duplicateFingerprints = new Set(
    [...duplicateCounts].filter(([, count]) => count > 1).map(([fingerprint]) => fingerprint),
  );

  const versionsByActivity = new Map<
    ActivityId,
    SafeTrainingInventoryReport["activities"][number]["versions"]
  >();
  const unmappedPublishedTemplateVersions: SafeTrainingInventoryReport["unmappedPublishedTemplateVersions"] =
    [];
  for (const row of rows) {
    const family = familyForConfig(row.config);
    const activityId = family ? activityByFamily.get(family) : undefined;
    const resolution = resolveTrainingRuntimeConfig("TRAINING", row.config);
    const configReady = resolution.status === "READY";
    let runtimeGraph: "READY" | "INVALID" = "INVALID";
    if (configReady) {
      try {
        validateTrainingRuntimeGraphRow(row, {
          userId: "read-only-inventory-audit",
          tenantId: row.template.tenantId ?? "read-only-global-scope",
          platformRole: null,
        });
        runtimeGraph = "READY";
      } catch {
        runtimeGraph = "INVALID";
      }
    }
    if (!activityId) {
      unmappedPublishedTemplateVersions.push({
        templateId: row.templateId,
        templateVersionId: row.id,
        templateVersion: row.version,
        family: activityId ? family : null,
        templateStatus: row.template.status,
        templateDeleted: row.template.deletedAt !== null,
        templateScope: row.template.tenantId === null ? "GLOBAL" : "TENANT_SCOPED",
        configStatus: configReady ? "READY" : "INVALID",
        runtimeGraph,
        questionCount: row.questions.length,
      });
      continue;
    }

    const linkedContentIds = new Set(row.contents.map((content) => content.contentVersionId));
    const positionCounts = bucketCounts();
    const questionStatusCounts: Record<string, number> = {};
    let uniquelyLongest = 0;
    let uniquelyShortest = 0;
    let missingQuestionContentLinkCount = 0;
    let invalidContentLinkStatusCount = 0;
    let duplicateQuestionReferences = 0;

    const questionVersionInventory = row.questions.map(({ questionVersion }) => {
      const options = readOptions(questionVersion.options);
      const correctIds = correctOptionIds(questionVersion.correctAnswer);
      const correctOptions = options.filter((option) => correctIds.includes(option.id));
      if (correctOptions.length === 1 && options.length === 4) {
        const position = correctOptions[0]!.position;
        if (position >= 1 && position <= 4)
          positionCounts[String(position) as "1" | "2" | "3" | "4"] += 1;
        else positionCounts.MULTIPLE_OR_UNRESOLVED += 1;
        const lengths = options.map((option) => [...option.text].length);
        const correctLength = [...correctOptions[0]!.text].length;
        const maximum = Math.max(...lengths);
        const minimum = Math.min(...lengths);
        if (
          correctLength === maximum &&
          lengths.filter((length) => length === maximum).length === 1
        )
          uniquelyLongest += 1;
        if (
          correctLength === minimum &&
          lengths.filter((length) => length === minimum).length === 1
        )
          uniquelyShortest += 1;
      } else {
        positionCounts.MULTIPLE_OR_UNRESOLVED += 1;
      }

      questionStatusCounts[questionVersion.status] =
        (questionStatusCounts[questionVersion.status] ?? 0) + 1;
      const contentVersionLinked =
        questionVersion.contentVersionId !== null &&
        linkedContentIds.has(questionVersion.contentVersionId);
      if (!contentVersionLinked) missingQuestionContentLinkCount += 1;
      if (
        questionVersion.contentVersionId &&
        row.contents.some(
          (content) =>
            content.contentVersionId === questionVersion.contentVersionId &&
            (content.contentVersion.status !== "PUBLISHED" ||
              content.contentVersion.content.status !== "PUBLISHED" ||
              content.contentVersion.content.deletedAt !== null),
        )
      ) {
        invalidContentLinkStatusCount += 1;
      }
      if (duplicateFingerprints.has(normalizedQuestionFingerprint(questionVersion.prompt, options)))
        duplicateQuestionReferences += 1;

      return {
        questionVersionId: questionVersion.id,
        version: questionVersion.version,
        status: questionVersion.status,
        questionStatus: questionVersion.question.status,
        questionType: questionVersion.question.type,
        contentVersionLinked,
      };
    });

    const entries = versionsByActivity.get(activityId) ?? [];
    entries.push({
      templateId: row.templateId,
      templateVersionId: row.id,
      templateVersion: row.version,
      templateStatus: row.template.status,
      templateDeleted: row.template.deletedAt !== null,
      templateScope: row.template.tenantId === null ? "GLOBAL" : "TENANT_SCOPED",
      configStatus: configReady ? "READY" : "INVALID",
      difficulty: configReady ? resolution.config.difficulty : null,
      runtimeGraph,
      questionCount: row.questions.length,
      contentVersionInventory: row.contents.map(({ position, contentVersion }) => ({
        position,
        contentId: contentVersion.contentId,
        contentVersionId: contentVersion.id,
        version: contentVersion.version,
        contentVersionStatus: contentVersion.status,
        contentStatus: contentVersion.content.status,
        contentDeleted: contentVersion.content.deletedAt !== null,
      })),
      questionVersionInventory,
      questionStatusCounts,
      correctOptionPositionCounts: positionCounts,
      correctOptionUniquelyLongestCount: uniquelyLongest,
      correctOptionUniquelyShortestCount: uniquelyShortest,
      missingQuestionContentLinkCount,
      invalidContentLinkStatusCount,
      duplicateQuestionReferences,
    });
    versionsByActivity.set(activityId, entries);
  }

  const activities = TRAINING_ACTIVITY_CATALOG.map((activity) => {
    const versions = versionsByActivity.get(activity.id) ?? [];
    return {
      activityId: activity.id,
      family: activity.family,
      publishedTemplateVersionCount: versions.length,
      studentEligibleTemplateVersionCount: versions.filter(
        (version) =>
          version.templateStatus === "PUBLISHED" &&
          !version.templateDeleted &&
          version.configStatus === "READY" &&
          version.runtimeGraph === "READY",
      ).length,
      versions: versions.sort((left, right) =>
        left.templateVersionId.localeCompare(right.templateVersionId),
      ),
    };
  });

  const duplicateQuestionReferences = [...duplicateCounts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  return {
    status: "INVENTORY_COMPLETE_REVIEW_REQUIRED",
    productionWrite: "NO",
    semanticContentReview: "NOT_PERFORMED",
    versionCount:
      activities.reduce((total, activity) => total + activity.versions.length, 0) +
      unmappedPublishedTemplateVersions.length,
    mappedActivityTemplateVersionCount: activities.reduce(
      (total, activity) => total + activity.versions.length,
      0,
    ),
    questionVersionReferenceCount,
    uniqueQuestionVersionCount: questionRefs.size,
    duplicateQuestionVersionReferences: questionVersionReferenceCount - questionRefs.size,
    duplicateQuestionReferences,
    unmappedPublishedTemplateVersions: unmappedPublishedTemplateVersions.sort((left, right) =>
      left.templateVersionId.localeCompare(right.templateVersionId),
    ),
    activities,
  };
}
