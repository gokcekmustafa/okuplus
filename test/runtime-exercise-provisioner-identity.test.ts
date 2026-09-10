import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const provisionerPath = resolve(
  process.cwd(),
  "scripts",
  "provision-staging-runtime-exercise-graphs.ts",
);

describe("runtime exercise provisioner identity", () => {
  it("uses the parent stableFixtureIdentity and version contract fields", async () => {
    const source = await readFile(provisionerPath, "utf8");

    expect(source).toContain("stableFixtureIdentity");
    expect(source).toContain("parseTrainingExerciseVersionConfig(versionDetail.config)");
    expect(source).toContain("config.family !== runtimeSpec.family");
    expect(source).toContain("config.competency !== runtimeSpec.competency");
    expect(source).toContain("config.rendererKey !== runtimeSpec.rendererKey");
    expect(source).not.toContain("config?.stableKey !== identity");
  });
});
