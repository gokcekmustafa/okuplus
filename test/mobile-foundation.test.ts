import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prepareScript = join(repoRoot, "mobile", "scripts", "prepare-web.mjs");

describe("OkuPratik mobile foundation", () => {
  it("packages local web assets with an explicit API origin and native runtime bridge", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "okupratik-mobile-"));
    try {
      await execFile(process.execPath, [prepareScript], {
        cwd: repoRoot,
        env: {
          ...process.env,
          OKUPRATIK_API_BASE_URL: "https://api.example.test",
          OKUPRATIK_MOBILE_OUTPUT_DIR: outputDir,
        },
      });

      const index = await readFile(join(outputDir, "index.html"), "utf8");
      const runtime = await readFile(join(outputDir, "mobile-runtime.js"), "utf8");
      const app = await readFile(join(outputDir, "app.js"), "utf8");

      expect(index).toContain('src="/mobile-runtime.js"');
      expect(index).toContain("viewport-fit=cover");
      expect(runtime).toContain('apiBaseUrl: "https://api.example.test"');
      expect(runtime).toContain('registerPlugin("SecureStorage")');
      expect(runtime).toContain('addListener("backButton"');
      expect(app).toContain('const SECURE_SESSION_KEY = "oku.session.v1";');
      expect(app).toContain("globalThis.fetch = (input, init)");
      expect(app).toContain("nativeMobileRuntime");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects non-HTTPS or credential-bearing API origins", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "okupratik-mobile-invalid-"));
    try {
      await expect(
        execFile(process.execPath, [prepareScript], {
          cwd: repoRoot,
          env: {
            ...process.env,
            OKUPRATIK_API_BASE_URL: "http://user:password@example.test",
            OKUPRATIK_MOBILE_OUTPUT_DIR: outputDir,
          },
        }),
      ).rejects.toThrow("açık bir HTTPS adresi");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
