import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { requestNativeGoogleCredential } from "../public/mobile-auth.js";

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
      const capacitorRuntime = await readFile(join(outputDir, "capacitor.js"), "utf8");
      const secureStorageAdapter = await readFile(
        join(outputDir, "secure-storage-plugin.js"),
        "utf8",
      );
      const app = await readFile(join(outputDir, "app.js"), "utf8");
      const mobileAuth = await readFile(join(outputDir, "mobile-auth.js"), "utf8");

      expect(index).toContain('src="/capacitor.js"');
      expect(index).toContain('src="/secure-storage-plugin.js"');
      expect(index).toContain('src="/mobile-runtime.js"');
      expect(index).toContain("viewport-fit=cover");
      expect(index.indexOf('src="/capacitor.js"')).toBeLessThan(
        index.indexOf('src="/secure-storage-plugin.js"'),
      );
      expect(index.indexOf('src="/secure-storage-plugin.js"')).toBeLessThan(
        index.indexOf('src="/mobile-runtime.js"'),
      );
      expect(index.indexOf('src="/mobile-runtime.js"')).toBeLessThan(
        index.indexOf('src="/app.js"'),
      );
      expect(capacitorRuntime).toContain("var capacitorExports");
      expect(secureStorageAdapter).toContain("exports.SecureStorage = proxy");
      expect(runtime).toContain('apiBaseUrl: "https://api.example.test"');
      expect(runtime).toContain("globalThis.capacitorSecureStorage?.SecureStorage");
      expect(runtime).toContain('plugin.name === "SecureStorage"');
      expect(runtime).not.toContain('registerPlugin("SecureStorage")');
      expect(runtime).toContain('registerPlugin("GoogleSignIn")');
      expect(runtime).toContain("secureStorageNativePlugin");
      expect(runtime).toContain('addListener("backButton"');
      expect(app).toContain('const SECURE_SESSION_KEY = "oku.session.v1";');
      expect(app).toContain("globalThis.fetch = (input, init)");
      expect(app).toContain("nativeMobileRuntime");
      expect(app).toContain(
        "await secureStoragePlugin.setItem(SECURE_SESSION_KEY, JSON.stringify(session))",
      );
      expect(app).toContain("SECURE_STORAGE_UNAVAILABLE");
      expect(app).toContain(
        'await setStoredSession({ tokens, tenantContext: { tenantId: tenantId ?? "" } })',
      );
      expect(mobileAuth).toContain("secureStorageAdapter.setItem");
      expect(mobileAuth).toContain("secureStorageAdapter.getItem");
      expect(mobileAuth).toContain("secureStorageAdapter.removeItem");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("runs Capacitor core and the official secure-storage adapter before exposing native auth", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "okupratik-mobile-native-runtime-"));
    try {
      await execFile(process.execPath, [prepareScript], {
        cwd: repoRoot,
        env: { ...process.env, OKUPRATIK_MOBILE_OUTPUT_DIR: outputDir },
      });

      const capacitorRuntime = await readFile(join(outputDir, "capacitor.js"), "utf8");
      const secureStorageAdapter = await readFile(
        join(outputDir, "secure-storage-plugin.js"),
        "utf8",
      );
      const runtime = await readFile(join(outputDir, "mobile-runtime.js"), "utf8");
      const stored = new Map<string, string>();
      const nativeCalls: string[] = [];
      const context = createContext({
        Capacitor: {
          Plugins: {},
          PluginHeaders: [
            {
              name: "SecureStorage",
              methods: [
                { name: "internalGetItem", rtype: "promise" },
                { name: "internalSetItem", rtype: "promise" },
                { name: "internalRemoveItem", rtype: "promise" },
              ],
            },
            { name: "GoogleSignIn", methods: [{ name: "signIn", rtype: "promise" }] },
            { name: "App", methods: [{ name: "addListener", rtype: "callback" }] },
          ],
          nativePromise: async (
            plugin: string,
            method: string,
            options: Record<string, string>,
          ) => {
            nativeCalls.push(`${plugin}.${method}`);
            if (method === "internalSetItem") stored.set(options.prefixedKey!, options.data!);
            if (method === "internalGetItem")
              return { data: stored.get(options.prefixedKey!) ?? null };
            if (method === "internalRemoveItem") {
              stored.delete(options.prefixedKey!);
              return { success: true };
            }
            return {};
          },
          nativeCallback: async () => "callback",
        },
        androidBridge: { postMessage: () => undefined },
        console: { warn: () => undefined, error: () => undefined },
      });
      runInContext(capacitorRuntime, context);
      runInContext(secureStorageAdapter, context);
      runInContext(runtime, context);

      const runtimeConfig = context.__OKUPRATIK_RUNTIME__ as {
        nativeMobile: boolean;
        platform: string;
        secureStorageNativePlugin: {
          setItem(key: string, value: string): Promise<void>;
          getItem(key: string): Promise<string | null>;
          removeItem(key: string): Promise<void>;
        } | null;
      };
      expect(runtimeConfig.nativeMobile).toBe(true);
      expect(runtimeConfig.platform).toBe("android");
      expect(runtimeConfig.secureStorageNativePlugin).not.toBeNull();

      const storage = runtimeConfig.secureStorageNativePlugin!;
      await storage.setItem("test.session", "opaque-test-value");
      await expect(storage.getItem("test.session")).resolves.toBe("opaque-test-value");
      await storage.removeItem("test.session");
      await expect(storage.getItem("test.session")).resolves.toBeNull();
      expect(stored.size).toBe(0);
      expect(nativeCalls).toEqual([
        "SecureStorage.internalSetItem",
        "SecureStorage.internalGetItem",
        "SecureStorage.internalRemoveItem",
        "SecureStorage.internalGetItem",
      ]);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fails closed instead of treating a native bridge without Capacitor core as web storage", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "okupratik-mobile-core-missing-"));
    try {
      await execFile(process.execPath, [prepareScript], {
        cwd: repoRoot,
        env: { ...process.env, OKUPRATIK_MOBILE_OUTPUT_DIR: outputDir },
      });
      const runtime = await readFile(join(outputDir, "mobile-runtime.js"), "utf8");
      const context = createContext({
        Capacitor: {
          PluginHeaders: [
            {
              name: "SecureStorage",
              methods: [
                { name: "internalGetItem", rtype: "promise" },
                { name: "internalSetItem", rtype: "promise" },
                { name: "internalRemoveItem", rtype: "promise" },
              ],
            },
          ],
        },
        androidBridge: { postMessage: () => undefined },
        console: { warn: () => undefined, error: () => undefined },
      });

      runInContext(runtime, context);

      expect(context.__OKUPRATIK_RUNTIME__).toMatchObject({
        nativeMobile: true,
        platform: "android",
        secureStorageNativePlugin: null,
      });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("defaults the APK runtime to the canonical production web/API origin", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "okupratik-mobile-production-origin-"));
    try {
      const env = { ...process.env };
      delete env.OKUPRATIK_API_BASE_URL;
      await execFile(process.execPath, [prepareScript], {
        cwd: repoRoot,
        env: { ...env, OKUPRATIK_MOBILE_OUTPUT_DIR: outputDir },
      });

      const runtime = await readFile(join(outputDir, "mobile-runtime.js"), "utf8");
      const index = await readFile(join(outputDir, "index.html"), "utf8");
      expect(runtime).toContain('apiBaseUrl: "https://www.okupratik.com"');
      expect(index.indexOf('src="/mobile-runtime.js"')).toBeLessThan(
        index.indexOf('src="/app.js"'),
      );
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("registers the native Google plugin before app startup and passes the configured server client ID", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "okupratik-mobile-google-runtime-"));
    try {
      await execFile(process.execPath, [prepareScript], {
        cwd: repoRoot,
        env: { ...process.env, OKUPRATIK_MOBILE_OUTPUT_DIR: outputDir },
      });
      const index = await readFile(join(outputDir, "index.html"), "utf8");
      const runtime = await readFile(join(outputDir, "mobile-runtime.js"), "utf8");
      const plugin = { signIn: async (input: unknown) => ({ idToken: "test-id-token", input }) };
      const registerPlugin = vi.fn((name: string) => (name === "GoogleSignIn" ? plugin : null));
      const context = createContext({
        Capacitor: {
          isNativePlatform: () => true,
          getPlatform: () => "android",
          registerPlugin,
        },
        androidBridge: { postMessage: () => undefined },
      });
      runInContext(runtime, context);

      const runtimeConfig = context.__OKUPRATIK_RUNTIME__ as {
        googleSignInPlugin: typeof plugin;
      };
      expect(index.indexOf('src="/mobile-runtime.js"')).toBeLessThan(
        index.indexOf('src="/app.js"'),
      );
      expect(registerPlugin).toHaveBeenCalledWith("GoogleSignIn");
      expect(runtimeConfig.googleSignInPlugin).toBe(plugin);
      await expect(
        requestNativeGoogleCredential(
          runtimeConfig.googleSignInPlugin,
          "production-web-client.apps.googleusercontent.com",
          "test-nonce-value-123456",
        ),
      ).resolves.toMatchObject({ idToken: "test-id-token" });
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
