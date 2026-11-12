import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const start = source.indexOf("async function loadProfileProgress(");
const end = source.indexOf("\n}", start) + 2;
const code = source.slice(start, end);

describe("profile progress labels", () => {
  it("shows the completed individual practice-session count under its actual label", async () => {
    type Element = {
      textContent: string;
      parentElement: { hidden: boolean };
      classList: { toggle: (name: string, value: boolean) => void };
    };
    const elements = new Map<string, Element>();
    const get = (id: string) => {
      if (!elements.has(id)) {
        let textContent = "";
        const element: Element = {
          get textContent() {
            return textContent;
          },
          set textContent(value: string) {
            textContent = String(value);
          },
          parentElement: { hidden: true },
          classList: { toggle() {} },
        };
        elements.set(id, element);
      }
      return elements.get(id)!;
    };
    const context = createContext({
      $: get,
      profileView: "profile",
      insightApi: (path: string) =>
        Promise.resolve(
          path === "learning-path"
            ? {
                routeProgress: { completed: 6, total: 22 },
                overallProgress: { completed: 2, total: 9 },
              }
            : { summary: { sessionCount: 8 } },
        ),
    });

    runInContext(code, context);
    await runInContext('loadProfileProgress("profile")', context);

    expect(get("profile-sessions").textContent).toBe("8");
    expect(get("profile-sessions").parentElement.hidden).toBe(false);
    expect(index).toContain("<dt>Tamamlanan alıştırma oturumu</dt>");
    expect(index).not.toContain("<dt>Ölçüm oturumu</dt>");
  });
});
