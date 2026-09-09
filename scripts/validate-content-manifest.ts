import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  CONTENT_IMPORT_LIMITS,
  buildContentImportPlan,
  parseContentImportManifestJson,
} from "../src/modules/content-import/index.js";

function fail(message: string): never {
  console.error(`STATUS: FAIL\n${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function assertManifestPath(input: string): string {
  if (!input || input.startsWith("-")) fail("MANIFEST_PATH_REQUIRED: Manifest dosya yolu gerekli");
  const root = resolve(process.cwd());
  const candidate = resolve(root, input);
  const relativePath = relative(root, candidate);
  if (
    isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..\\`) ||
    relativePath.startsWith(`../`)
  ) {
    fail("MANIFEST_PATH_TRAVERSAL: Manifest yolu çalışma dizini içinde olmalı");
  }
  return candidate;
}

function printIssues(issues: Array<{ code: string; path: string; message: string }>): void {
  for (const entry of issues) console.error(`${entry.code} ${entry.path}: ${entry.message}`);
}

async function main(): Promise<void> {
  const filePath = assertManifestPath(process.argv[2] ?? "");
  const raw = await readFile(filePath, "utf8");
  if (Buffer.byteLength(raw, "utf8") > CONTENT_IMPORT_LIMITS.maxManifestBytes) {
    fail("MANIFEST_TOO_LARGE: Manifest dosyası izin verilen boyutu aşıyor");
  }
  const validation = parseContentImportManifestJson(raw);
  if (!validation.ok) {
    console.error("STATUS: FAIL");
    printIssues(validation.issues);
    process.exitCode = 1;
    return;
  }
  const plan = buildContentImportPlan(validation.manifest);
  console.log("STATUS: PASS");
  console.log(`MANIFEST_ID: ${validation.manifest.manifestId}`);
  console.log(`MANIFEST_VERSION: ${validation.manifest.manifestVersion}`);
  console.log(`QUESTION_COUNT: ${validation.manifest.questions.length}`);
  console.log("IMPORT_STATUS: DRAFT");
  console.log(`PLAN_FINGERPRINT: ${plan.fingerprint}`);
  console.log("OPERATIONS:");
  for (const entry of plan.operations) {
    console.log(
      `${entry.operation} | ${entry.entityType} | ${entry.externalKey} | version=${entry.targetVersion ?? "-"} | dependsOn=${entry.dependencies.join(",") || "-"}`,
    );
  }
}

main().catch((error: unknown) => {
  if (process.exitCode === 1) return;
  const message = error instanceof Error ? error.message : "Manifest işlenemedi";
  console.error(`STATUS: FAIL\nIMPORT_ERROR: ${message}`);
  process.exitCode = 1;
});
