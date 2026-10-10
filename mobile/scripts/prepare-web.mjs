import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobileDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(mobileDir, "..");
const sourceDir = join(repoRoot, "public");
const outputDir = resolve(process.env.OKUPRATIK_MOBILE_OUTPUT_DIR ?? join(mobileDir, "www"));
const apiBaseUrl = (process.env.OKUPRATIK_API_BASE_URL ?? "https://www.okupratik.com").trim();

function assertHttpsUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("OKUPRATIK_API_BASE_URL açık bir HTTPS adresi olmalı.");
  }
  return parsed.origin;
}

const resolvedApiBaseUrl = assertHttpsUrl(apiBaseUrl);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });

const indexPath = join(outputDir, "index.html");
const index = (await readFile(indexPath, "utf8")).replace(
  'content="width=device-width, initial-scale=1"',
  'content="width=device-width, initial-scale=1, viewport-fit=cover"',
);
const runtimeScript =
  '<script src="/mobile-runtime.js"></script>\n    <script type="module" src="/app.js"></script>';
const appScriptPattern = /<script\s+type="module"\s+src="\/app\.js"><\/script>/u;
const updatedIndex = index.replace(appScriptPattern, runtimeScript);
if (updatedIndex === index) {
  throw new Error("public/index.html içinde beklenen app.js etiketi bulunamadı.");
}
await writeFile(indexPath, updatedIndex, "utf8");

const runtime = `const capacitor = globalThis.Capacitor;\nconst secureStoragePlugin =\n  capacitor?.isNativePlatform?.() && capacitor.registerPlugin\n    ? capacitor.registerPlugin("SecureStorage")\n    : null;\nglobalThis.__OKUPRATIK_RUNTIME__ = Object.freeze({\n  apiBaseUrl: ${JSON.stringify(resolvedApiBaseUrl)},\n  nativeMobile: Boolean(capacitor?.isNativePlatform?.()),\n  secureStoragePlugin,\n});\n`;
const nativeNavigation = `\nconst appPlugin =\n  capacitor?.isNativePlatform?.() && capacitor.registerPlugin\n    ? capacitor.registerPlugin("App")\n    : null;\nif (appPlugin?.addListener) {\n  void appPlugin.addListener("backButton", () => {\n    const handler = globalThis.__OKUPRATIK_NATIVE_BACK_HANDLER__;\n    if (typeof handler === "function") handler();\n    else void appPlugin.exitApp?.();\n  });\n}\n`;
await writeFile(join(outputDir, "mobile-runtime.js"), runtime + nativeNavigation, "utf8");

console.log(`OkuPratik mobil web varlıkları hazırlandı. API: ${resolvedApiBaseUrl}`);
