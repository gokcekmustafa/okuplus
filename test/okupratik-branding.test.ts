import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

describe("OkuPratik public brand contract", () => {
  it("uses the canonical brand and URL in public metadata", () => {
    expect(indexHtml).toContain("<title>OkuPratik</title>");
    expect(indexHtml).toContain('rel="canonical" href="https://www.okupratik.com/"');
    expect(indexHtml).toContain('property="og:url" content="https://www.okupratik.com/"');
    expect(indexHtml).toContain('property="og:title" content="OkuPratik"');
    expect(indexHtml).toContain('name="twitter:title" content="OkuPratik"');
    expect(indexHtml).not.toMatch(/Oku\+/u);
  });

  it("does not expose the legacy brand in the student SPA", () => {
    expect(appJs).not.toMatch(/Oku\+/u);
    expect(appJs).not.toMatch(/okuplus\.online/iu);
  });
});
