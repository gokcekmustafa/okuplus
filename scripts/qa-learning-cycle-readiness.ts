import { auditCanonicalEducationV2LearningCycleReadiness } from "../src/curriculum/learning-cycle-readiness.js";
import {
  LEARNING_ROUTE_CYCLES,
  summarizeLearningRouteCoverage,
  validateLearningRouteCatalog,
} from "../src/curriculum/learning-route-catalog.js";

const report = auditCanonicalEducationV2LearningCycleReadiness();
console.log(JSON.stringify(report, null, 2));
if (report.status === "INVALID") process.exitCode = 1;
const errors = validateLearningRouteCatalog();
console.log(
  JSON.stringify(
    {
      routeCatalog: errors.length ? "INVALID" : "PASS",
      production: "NOT_VERIFIED",
      routeCoverage: summarizeLearningRouteCoverage(),
      cycles: LEARNING_ROUTE_CYCLES.map((cycle) => ({
        pathCode: cycle.pathCode,
        sequence: cycle.sequence,
        stationCount: cycle.manifest.steps.length,
        contentCount: cycle.manifest.resourceCatalog.contentVersions.length,
        questionCount: cycle.manifest.resourceCatalog.questionVersionIds.length,
        publicationApproved: cycle.publicationApproved(),
        nextPathCode: cycle.nextPathCode,
      })),
      errors,
    },
    null,
    2,
  ),
);
if (errors.length) process.exitCode = 1;
