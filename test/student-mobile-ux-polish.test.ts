import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");
const designSystem = readFileSync("public/design-system.css", "utf8");

describe("student mobile UX polish", () => {
  it("keeps four primary destinations and exposes secondary student pages through an accessible menu", () => {
    const navStart = index.indexOf('<nav id="student-bottom-nav"');
    const navEnd = index.indexOf("</nav>", navStart) + "</nav>".length;
    const nav = index.slice(navStart, navEnd);
    const secondaryMenuStart = nav.indexOf('<div id="student-bottom-nav-more"');
    const toggleStart = nav.indexOf('id="student-bottom-nav-more-toggle"');
    const primaryNav = nav.slice(0, nav.indexOf('<div class="bottom-nav-more">'));
    const menu = nav.slice(secondaryMenuStart, toggleStart);

    expect(nav.match(/class="bottom-nav-item"/gu)).toHaveLength(4);
    expect(primaryNav).toContain('data-bottom-page="dashboard"');
    expect(primaryNav).toContain('data-bottom-page="exercise"');
    expect(primaryNav).toContain('data-bottom-page="progress"');
    expect(nav).toContain('data-bottom-page="more"');
    expect(nav).toContain('aria-controls="student-bottom-nav-more"');
    expect(nav).toContain('aria-expanded="false"');
    expect(menu).toContain('data-bottom-page="assignments"');
    expect(menu).toContain('data-bottom-page="assessments"');
    expect(menu).toContain('data-bottom-page="badges"');
    expect(menu).toContain('id="student-bottom-nav-more" class="bottom-nav-more-menu" hidden');
    expect(app).toContain('event.key === "Escape"');
    expect(app).toContain("setStudentMoreMenuOpen(false, true)");
  });

  it("highlights the correct primary destination for Learning Path and independent Training", () => {
    const start = app.indexOf("function studentBottomNavigationTarget(");
    const end = app.indexOf("\nfunction setStudentMoreMenuOpen", start);
    const context = createContext({});
    runInContext(app.slice(start, end), context);

    expect(context.studentBottomNavigationTarget("dashboard", false)).toBe("dashboard");
    expect(context.studentBottomNavigationTarget("lessons", false)).toBe("dashboard");
    expect(context.studentBottomNavigationTarget("exercise", true)).toBe("dashboard");
    expect(context.studentBottomNavigationTarget("exercise", false)).toBe("exercise");
    expect(context.studentBottomNavigationTarget("progress", false)).toBe("progress");
    expect(context.studentBottomNavigationTarget("assignments", false)).toBe("more");
    expect(context.studentBottomNavigationTarget("assessments", false)).toBe("more");
    expect(context.studentBottomNavigationTarget("badges", false)).toBe("more");
  });

  it("keeps reading and answer text legible and touch targets usable on narrow screens", () => {
    const finalReadingRule = styles.lastIndexOf(
      ".student-shell #page-exercise:not(.hidden) #student-reading-body {",
    );
    const finalReadingCss = styles.slice(finalReadingRule, styles.indexOf("}", finalReadingRule));
    expect(finalReadingCss).toContain("font-size: clamp(1rem, 4.2vw, 1.125rem)");
    expect(finalReadingCss).toContain("line-height: 1.62");
    expect(styles).toMatch(
      /\.student-shell #page-exercise:not\(\.hidden\) \.answer-card\s*\{[^}]*min-height:\s*48px/u,
    );
    expect(styles).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(styles).toContain("min-height: 54px");
    expect(styles).toContain("font-size: 11.5px");
    expect(styles).toContain("max-width: 72ch");
  });

  it("shows the active station title and a map focus control without changing station availability", () => {
    expect(app).toContain('class="learning-map-v6-current"');
    expect(app).toContain('class="learning-map-v6-title"');
    expect(app).toContain("data-learning-map-current");
    expect(app).toContain(
      'scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "center" })',
    );
    expect(app).toContain(
      'var disabled =\n        visualStatus === "locked" || node.availability === "UNAVAILABLE" ? " disabled" : "";',
    );
    expect(styles).toContain(".student-shell #learning-path-card .learning-map-v6-action");
    expect(styles).toContain("overflow-wrap: anywhere");
    expect(styles).toContain(".student-shell #learning-path-card .learning-map-v6-current .btn");
    expect(designSystem).toMatch(
      /@media \(max-width: 380px\)[\s\S]*?\.guest-shell:not\(\.guest-diagnostic-mode\) \.guest-hero-art\s*\{[^}]*height:\s*180px/u,
    );
  });

  it("keeps training errors in one status region and collapses secondary card detail", () => {
    const loadStart = app.indexOf("async function loadTrainingActivities()");
    const loadEnd = app.indexOf("\nfunction renderTrainingActivities()", loadStart);
    const trainingLoad = app.slice(loadStart, loadEnd);
    expect(trainingLoad).toContain('if (status) status.textContent = "";');
    expect(trainingLoad).not.toContain("status.textContent = trainingActivitiesStateMessage");
    expect(app).toContain('class="training-activity-details"');
    expect(app).toContain("<summary>İlerleme ve paketler</summary>");
    expect(app).toContain('class="training-activity-result-details"');
  });

  it("keeps station movement behavior out of the visual redesign", () => {
    expect(app).toContain("uiMotion.enhanceRoadmap");
    expect(app).toContain("startLearningPathNodeFromMap(node, el)");
    expect(app).not.toContain("startLearningPathNode(currentNode");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });
});
