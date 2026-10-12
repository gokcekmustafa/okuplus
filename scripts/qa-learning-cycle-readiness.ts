import { auditCanonicalEducationV2LearningCycleReadiness } from "../src/curriculum/learning-cycle-readiness.js";

const report = auditCanonicalEducationV2LearningCycleReadiness();
console.log(JSON.stringify(report, null, 2));
if (report.status === "INVALID") process.exitCode = 1;
