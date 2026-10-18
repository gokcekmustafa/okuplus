import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LEARNING_ROUTE_CYCLES,
  learningRouteCycle,
} from "../src/curriculum/learning-route-catalog.js";
import { EDUCATION_V2_P1_800_DRAFT_CYCLES } from "../src/curriculum/education-v2-p1-800-draft-cycles.js";

const appJs = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

describe("management UI follow-ups", () => {
  it("keeps A route's next authored group visible as pending without opening its release gate", () => {
    const cycle3 = LEARNING_ROUTE_CYCLES.find(
      (cycle) => cycle.routeFamily === "A" && cycle.sequence === 3,
    );
    const cycle4 = learningRouteCycle("EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_4_G8_12");
    const cycle4Source = EDUCATION_V2_P1_800_DRAFT_CYCLES.find(
      (cycle) => cycle.routeFamily === "A" && cycle.sequence === 4,
    );

    expect(cycle3?.nextPathCode).toBe(cycle4?.pathCode);
    expect(cycle4?.manifest.steps).toHaveLength(5);
    expect(cycle4?.publicationApproved()).toBe(false);
    expect(cycle4Source?.authoringStatus).toBe("DRAFT_NOT_RELEASED");
    expect(cycle4Source?.sourceStations).toHaveLength(5);
    expect(
      cycle4Source?.sourceStations.every(
        (station) => station.provenanceStatus === "REVIEW_REQUIRED",
      ),
    ).toBe(true);
    expect(appJs).toContain("cycle) => !cycle.graphAvailable");
    expect(appJs).toContain("Yeni bölüm yayına hazırlanıyor.");
  });

  it("shows real usage aggregates in one compact table and keeps an explicit empty state", () => {
    expect(indexHtml.match(/id="analytics-feature-body"/gu)).toHaveLength(1);
    expect(indexHtml).toContain("Kullanım kayıtları");
    expect(indexHtml).not.toContain('id="analytics-usage-summary"');
    expect(appJs).toContain("overview.featureUsage ?? []");
    expect(appJs).toContain("overview.usageByDay ?? []");
    expect(appJs).toContain("${item.sessions} oturum");
    expect(appJs).toContain("${item.events} etkinlik");
    expect(appJs).toContain("Veri mevcut değil.");
  });

  it("exposes a protected draft editor and does not present edits as publication", () => {
    expect(appJs).toContain('data-draft-question-open="${escapeHtml(question.key)}"');
    expect(appJs).toContain('name="prompt"');
    expect(appJs).toContain('data-draft-option-id="${escapeHtml(option.id)}"');
    expect(appJs).toContain('name="correctOptionId"');
    expect(appJs).toContain('name="hint"');
    expect(appJs).toContain('name="explanation"');
    expect(appJs).toContain('name="sourceReference"');
    expect(appJs).toContain('authenticatedFetch(path, { method: "PATCH"');
    expect(appJs).toContain("Taslak sürümü kaydedildi ve önizleme yenilendi.");
    expect(appJs).toContain("Kaydetme isteği tamamlandı; ancak güncel önizleme yüklenemedi.");
  });

  it("routes both student list actions to profile details and ignores stale responses", () => {
    expect(appJs).toContain('data-analytics-student="${escapeHtml(student.studentId)}"');
    expect(appJs).toContain(
      "if (button) void loadAnalyticsStudentDetail(button.dataset.analyticsStudent)",
    );
    expect(appJs).toContain("options.analyticsData.student.profileId !== detail.id");
    expect(appJs).toContain(
      "requestId !== studentDetailRequest || (options.isCurrent && !options.isCurrent())",
    );
    expect(appJs).toContain("analyticsStudentDetailRequest += 1;");
    expect(appJs).toContain("studentDetailCurrent = null;");
    expect(appJs).toContain('data-user-detail-id="${u.id}"');
    expect(appJs).toContain('data-user-open-student="${escapeHtml(u.id)}"');
  });

  it("gives user detail headings opaque theme-aware surfaces with mobile sizing", () => {
    expect(indexHtml).toContain("user-detail-modal-dialog");
    expect(styles).toContain(".user-detail-modal-dialog .admin-detail-disclosure > summary");
    expect(styles).toContain("background-color: var(--surface);");
    expect(styles).toContain("background-color: var(--primary-soft);");
    expect(styles).toContain("@media (max-width: 600px)");
    expect(styles).toContain(".user-detail-modal-dialog .modal-head");
  });
});
