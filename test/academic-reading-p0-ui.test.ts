import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

describe("academic learning model UI", () => {
  it("shows the two areas and the shared learning flow without changing the old path API", () => {
    expect(index).toContain('id="learning-path-model"');
    expect(app).toContain("function renderAcademicLearningModel(program)");
    expect(app).toContain("Öğretim");
    expect(app).toContain("Küçük çalışma");
    expect(app).toContain("Ortak pekiştirme");
    expect(app).toContain("Başarı ölçümü");
    expect(app).toContain("renderAcademicLearningModel(data.academicProgram)");
  });

  it("keeps the model legible and responsive", () => {
    expect(styles).toContain(".academic-area-grid");
    expect(styles).toContain(".academic-stage-list");
    expect(styles).toContain("@media (max-width: 700px)");
    expect(styles).toContain(".academic-step-unavailable");
  });
});
