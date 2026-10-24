import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { EDUCATION_V2_P0_PROGRAM } from "../src/curriculum/education-v2-p0-program.js";
import { EDUCATION_V2_P1_A_PROGRAM } from "../src/curriculum/education-v2-p1-a-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE,
  p1ACycle4TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-4-program.js";
import { EDUCATION_V2_P1_A_CYCLE_3_PROGRAM } from "../src/curriculum/education-v2-p1-a-cycle-3-program.js";
import {
  getEducationV2P1ACycle,
  p1ACycle5To8TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import {
  EDUCATION_V2_P1_BCD_PROGRAMS,
  p1BCDTemplateVersionId,
} from "../src/curriculum/education-v2-p1-bcd-program.js";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const helpers = source.slice(
  source.indexOf("function studentFacingTrainingInstructions("),
  source.indexOf(
    "function renderExerciseSession(",
    source.indexOf("function studentFacingTrainingInstructions("),
  ),
);

function renderedInstruction(instructions: string, templateVersionId: string) {
  const element = { textContent: "old note", style: { display: "block" } };
  const context = createContext({
    element,
    exerciseSession: {
      templateVersion: { id: templateVersionId, training: { instructions } },
    },
  });
  runInContext(helpers, context);
  runInContext("renderStudentTrainingInstructions(element, exerciseSession)", context);
  return element;
}

describe("student-facing exercise instructions", () => {
  it("hides station 83's learning-outcome note without leaving a blank instruction block", () => {
    const exercise = EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.exercises;
    expect(exercise).toHaveLength(5);

    const cycle11 = getEducationV2P1ACycle(11)!;
    const station = cycle11.sourceCycle.sourceStations.find((item) =>
      item.key.endsWith("A11_FAST_GOLDFINCH"),
    )!;
    const authoredExercise = cycle11.program.exercises.find((item) => item.key === station.key)!;
    expect(authoredExercise.contract.instructions).toBe(station.outcome);
    expect(station.outcome).toBe(
      "Kuşun görünür özelliklerini hızlıca bulur ve benzerliklerden aşırı sonuç çıkarmaz.",
    );

    const element = renderedInstruction(
      authoredExercise.contract.instructions,
      p1ACycle5To8TemplateVersionId(11, authoredExercise.key),
    );
    expect(element.textContent).toBe("");
    expect(element.style.display).toBe("none");
  });

  it("hides outcome metadata for every source-authored P1-A expansion cycle 4–20", () => {
    const cycles = [
      {
        sequence: 4,
        sourceStations: EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sourceStations,
        exercises: EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.exercises,
        versionId: p1ACycle4TemplateVersionId,
      },
      ...Array.from({ length: 16 }, (_, index) => {
        const sequence = index + 5;
        const cycle = getEducationV2P1ACycle(sequence)!;
        return {
          sequence,
          sourceStations: cycle.sourceCycle.sourceStations,
          exercises: cycle.program.exercises,
          versionId: (key: string) => p1ACycle5To8TemplateVersionId(sequence, key),
        };
      }),
    ];

    expect(cycles).toHaveLength(17);
    for (const cycle of cycles) {
      for (const station of cycle.sourceStations) {
        const exercise = cycle.exercises.find((item) => item.key === station.key)!;
        expect(exercise.contract.instructions).toBe(station.outcome);
        const element = renderedInstruction(
          exercise.contract.instructions,
          cycle.versionId(exercise.key),
        );
        expect(element.textContent, `cycle ${cycle.sequence}: ${station.key}`).toBe("");
        expect(element.style.display, `cycle ${cycle.sequence}: ${station.key}`).toBe("none");
      }
    }
  });

  it("continues to show task directions from the other active route sources", () => {
    const activeInstructions = [
      ...EDUCATION_V2_P0_PROGRAM.exercises.map((exercise) => ({
        key: exercise.key,
        instruction: exercise.contract.instructions,
        versionId: `p0-templateVersion-${exercise.key}`,
      })),
      ...EDUCATION_V2_P1_A_PROGRAM.exercises.map((exercise) => ({
        key: exercise.key,
        instruction: exercise.contract.instructions,
        versionId: `p1a-templateVersion-${exercise.key}`,
      })),
      ...EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.map((exercise) => ({
        key: exercise.key,
        instruction: exercise.contract.instructions,
        versionId: `p1a-cycle3-templateVersion-${exercise.key}`,
      })),
      ...EDUCATION_V2_P1_BCD_PROGRAMS.flatMap((program) =>
        program.exercises.map((exercise) => ({
          key: exercise.key,
          instruction: exercise.contract.instructions,
          versionId: p1BCDTemplateVersionId(program, exercise.key),
        })),
      ),
    ];

    for (const { key, instruction, versionId } of activeInstructions) {
      const element = renderedInstruction(instruction, versionId);
      expect(element.textContent, key).toBe(instruction);
      expect(element.style.display, key).toBe("block");
    }
  });
});
