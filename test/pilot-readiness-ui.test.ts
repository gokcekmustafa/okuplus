import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

describe("pilot readiness student support and telemetry", () => {
  it("exposes a visible Turkish support and bug-report path", () => {
    expect(html).toContain('id="pilot-support-open"');
    expect(html).toContain('id="pilot-bug-open"');
    expect(html).toContain('id="pilot-report-dialog"');
    expect(app).toContain('"/student/pilot/feedback"');
    expect(app).toContain('"/student/pilot/bug-reports"');
    expect(app).toContain("Mesaj gönderilemedi. Biraz sonra tekrar dene.");
    const report = app.slice(
      app.indexOf("async function submitPilotReport"),
      app.indexOf("function setupPilotExperienceEvents"),
    );
    expect(report).not.toContain("error.textContent = err.message");
  });

  it("keeps pilot telemetry bounded to canonical event context", () => {
    expect(app).toContain('"/student/pilot/events"');
    expect(app).toContain("clientEventId");
    expect(app).toContain("sessionId");
    expect(app).toContain("questionVersionId");
    expect(app).toContain('"QUESTION_VIEWED"');
    expect(app).toContain('"QUESTION_ATTEMPTED"');
    expect(app).toContain('"QUESTION_ANSWERED"');
    expect(app).toContain('"training-completed"');

    const payloadStart = app.indexOf("const payload = {");
    const payload = app.slice(payloadStart, app.indexOf("void fetch", payloadStart));
    expect(payload).not.toContain("password");
    expect(payload).not.toContain("accessToken");
    expect(payload).not.toContain("raw");
    expect(payload).not.toContain("content");
  });

  it("protects the support surface on small screens", () => {
    expect(css).toContain(".pilot-support-card");
    expect(css).toContain(".pilot-support-actions .btn");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("@media (max-width: 600px)");
  });
});
