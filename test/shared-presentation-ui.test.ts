import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync("public/app.js", "utf8");
const escapeHtml = runInNewContext(
  `${source.slice(source.indexOf("function escapeHtml("), source.indexOf("function normalizeTurkishPhoneValue("))}; escapeHtml`,
) as (value: unknown) => string;

describe("shared UI presentation preserves state and accessibility", () => {
  it("preserves station icons and announces a valid busy state while loading", () => {
    const helper = source.slice(
      source.indexOf("function setAsyncButtonState("),
      source.indexOf("const PREMIUM_LIMIT_FEATURES"),
    );
    const setState = runInNewContext(`${helper}; setAsyncButtonState`);
    for (const kind of [".learning-map-v6-node", ".learning-path-step-card"]) {
      const attributes = new Map<string, string>();
      const action = { textContent: "Başla →" };
      const icon = {};
      const button = {
        dataset: {} as Record<string, string>,
        disabled: false,
        get textContent() {
          return "İstasyon 32 Başla →";
        },
        set textContent(_text: string) {
          throw new Error("Station content must be preserved");
        },
        matches: (selector: string) => selector === kind,
        querySelector: (selector: string) =>
          selector === ".learning-map-v6-action" ? action : selector === "img" ? icon : null,
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        removeAttribute: (name: string) => attributes.delete(name),
        classList: { toggle() {} },
      };
      setState(button, true, "Başlatılıyor…");
      expect(button.querySelector("img")).toBe(icon);
      expect(attributes.get("aria-busy")).toBe("true");
      expect(button.disabled).toBe(true);
      setState(button, false, "Başlatılıyor…");
      expect(attributes.has("aria-busy")).toBe(false);
      expect(button.disabled).toBe(false);
      expect(action.textContent).toBe("Başla →");
    }
  });
  it("renders metric values and labels safely with a decorative, known icon", () => {
    const metric = source.slice(
      source.indexOf("function insightMetric("),
      source.indexOf("function insightBar("),
    );
    const render = runInNewContext(`${metric}; insightMetric`, { escapeHtml });
    const html = render("⭐", "Toplam GP", 1730, "insight-gold", "points");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("/assets/ui-icons.svg#star");
    expect(html).toContain('<strong id="points">1730</strong>');
    expect(render("<script>", "<Ölçüm>", "<veri>")).not.toContain("<script>");
    expect(render("<script>", "<Ölçüm>", "<veri>")).toContain("&lt;Ölçüm&gt;");
    expect(render("<script>", "<Ölçüm>", "<veri>")).toContain("/assets/ui-icons.svg#chart");
  });

  it("keeps theme labels and pressed state synchronized with the icon", () => {
    const attributes: Record<string, string> = {};
    const icon = { innerHTML: "" };
    const toggle = {
      title: "",
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
      querySelector: () => icon,
    };
    const document = { documentElement: { dataset: { theme: "" } } };
    const theme = source.slice(
      source.indexOf("function applyTheme("),
      source.indexOf("function setupThemeEvents("),
    );
    const apply = runInNewContext(`${theme}; applyTheme`, { document, $: () => toggle });
    apply("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(attributes).toMatchObject({ "aria-pressed": "true", "aria-label": "Açık temaya geç" });
    expect(icon.innerHTML).toContain("#sun");
    apply("light");
    expect(attributes).toMatchObject({ "aria-pressed": "false", "aria-label": "Koyu temaya geç" });
    expect(icon.innerHTML).toContain("#moon");
  });

  it("renders skill identity, resume target, package states and unavailable actions unchanged", () => {
    const elements = new Map<
      string,
      {
        innerHTML: string;
        textContent: string;
        style: Record<string, string>;
        setAttribute: () => void;
      }
    >();
    for (const id of [
      "training-activities-list",
      "training-activities-grid",
      "training-activities-status",
    ])
      elements.set(id, { innerHTML: "", textContent: "", style: {}, setAttribute: () => {} });
    const render = source.slice(
      source.indexOf("function renderTrainingActivities()"),
      source.indexOf("async function startTrainingActivity("),
    );
    const context = {
      $: (id: string) => elements.get(id),
      escapeHtml,
      isPlatformUser: false,
      exerciseSession: null,
      dailyTrainingSummary: null,
      trainingActivitiesState: "ready",
      trainingActivitiesStateMessage: "",
      trainingActivities: [
        {
          id: "resume",
          title: "Anlamı Yakala",
          competency: "RC_MAIN_IDEA",
          available: true,
          packageProgress: {
            totalPackages: 3,
            completedPackages: 1,
            currentPackageNumber: 2,
            currentPackageStatus: "IN_PROGRESS",
            currentSessionId: "session-existing",
            packages: [
              { packageNumber: 1, status: "COMPLETED" },
              { packageNumber: 2, status: "IN_PROGRESS" },
              { packageNumber: 3, status: "LOCKED" },
            ],
          },
        },
        { id: "unavailable", title: "<Etkinlik>", competency: "RC_DETAIL", available: false },
      ],
    };
    runInNewContext(`${render}; renderTrainingActivities()`, context);
    const html = elements.get("training-activities-grid")!.innerHTML;
    expect(html).toContain('data-competency="RC_MAIN_IDEA"');
    expect(html).toContain("ui-icons.svg#book");
    expect(html).toContain('data-training-activity-session="session-existing"');
    expect(html).toContain("is-completed");
    expect(html).toContain("is-in_progress");
    expect(html).toContain("is-locked");
    expect(html).toContain("Devam et →");
    expect(html).toContain("disabled>Şu anda hazır değil");
    expect(html).toContain("&lt;Etkinlik&gt;");
    expect(html).not.toContain("<Etkinlik>");
  });
});
