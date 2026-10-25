import { describe, expect, it } from "vitest";
import {
  EDUCATION_V2_A_STATIONS_48_57_EDITORIAL_REVIEW,
  EDUCATION_V2_P1_A_CYCLE_4_EDITORIAL_CANDIDATE,
  EDUCATION_V2_P1_A_CYCLE_5_STATION_53_EDITORIAL_CANDIDATE,
} from "../src/curriculum/education-v2-a-stations-48-57-editorial-review.js";
import { EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE } from "../src/curriculum/education-v2-p1-a-cycle-4-program.js";
import { getEducationV2P1ExpansionDraftCycle } from "../src/curriculum/education-v2-p1-800-draft-cycles.js";

describe("A rotası 48–57 editoryal incelemesi", () => {
  it("covers ten unique authored stations and checks each question against its source text", () => {
    expect(
      EDUCATION_V2_A_STATIONS_48_57_EDITORIAL_REVIEW.map((item) => item.stationNumber),
    ).toEqual([48, 49, 50, 51, 52, 53, 54, 55, 56, 57]);
    expect(
      new Set(EDUCATION_V2_A_STATIONS_48_57_EDITORIAL_REVIEW.map((item) => item.stationKey)).size,
    ).toBe(10);
    expect(
      EDUCATION_V2_A_STATIONS_48_57_EDITORIAL_REVIEW.every(
        (item) => item.questionKeys.length === 3,
      ),
    ).toBe(true);
    expect(
      EDUCATION_V2_A_STATIONS_48_57_EDITORIAL_REVIEW.every(
        (item) =>
          item.contentOrigin === "ORIGINAL_AUTHORING" &&
          item.provenanceStatus === "REVIEW_REQUIRED" &&
          item.sourceEvidencePresent === false,
      ),
    ).toBe(true);

    const stations = [
      ...EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sourceStations,
      ...getEducationV2P1ExpansionDraftCycle("A", 5)!.sourceStations,
    ];
    expect(stations).toHaveLength(10);
    for (const station of stations) {
      for (const question of station.questions) {
        const choices = [question.correct, ...question.distractors];
        expect(new Set(choices).size, `${station.key}/${question.key}`).toBe(4);
        expect(
          choices.filter((choice) => choice === question.correct),
          question.key,
        ).toHaveLength(1);
        expect(question.prompt.trim()).not.toBe("");
        expect(question.explanation.trim()).not.toBe("");
        expect(question.hint.trim()).not.toBe("");
      }
    }
  });

  it("keeps Cycle 4 live versions immutable and prepares only reviewed v5 candidates", () => {
    const candidate = EDUCATION_V2_P1_A_CYCLE_4_EDITORIAL_CANDIDATE;
    expect(candidate.publicationApproved).toBe(false);
    expect(candidate.editorialReviewStatus).toBe("REVIEW_REQUIRED");
    expect(candidate.changedQuestions).toHaveLength(1);
    expect(candidate.changedQuestions[0]).toMatchObject({
      stationNumber: 50,
      questionKey: "a4-common-1",
      answerKeyChanged: false,
      questionVersionId: expect.stringMatching(/-v5$/u),
      question: {
        correctOptionId: "c",
        prompt: "Metne göre yeni çalışma bölümünde hangi iki düzenleme yapıldı?",
      },
    });
    expect(candidate.templateVersions).toHaveLength(2);
    expect(candidate.stepMetadataChanges[0]).toMatchObject({
      stationNumber: 51,
      title: "Işık süresiyle gözlem sonucunu karşılaştır",
      learningOutcome:
        "İki ölçüm süresini gözlemle karşılaştırır ve tek denemeden genelleme yapmaz.",
    });
    expect(candidate.stepMetadataChanges[0]?.learningOutcome).not.toContain("tablo");
    expect(candidate.templateVersions.every((item) => item.templateVersionId.endsWith("-v5"))).toBe(
      true,
    );
  });

  it("prepares station 53 as an unpublished v6 announcement candidate without claiming source verification", () => {
    const candidate = EDUCATION_V2_P1_A_CYCLE_5_STATION_53_EDITORIAL_CANDIDATE;
    expect(candidate.publicationApproved).toBe(false);
    expect(candidate.editorialReviewStatus).toBe("REVIEW_REQUIRED");
    expect(candidate.contentOrigin).toBe("ORIGINAL_AUTHORING");
    expect(candidate.provenanceStatus).toBe("REVIEW_REQUIRED");
    expect(candidate.sourceEvidence).toBeNull();
    expect(candidate.candidate.contentVersionId).not.toBe(candidate.base.contentVersionId);
    expect(candidate.candidate.contentVersionId).toMatch(/-v6$/u);
    expect(candidate.candidate.templateVersionId).not.toBe(candidate.base.templateVersionId);
    expect(candidate.candidate.templateVersionId).toMatch(/-v6$/u);
    expect(candidate.candidate.title).toBe("Duyurudaki gerekli bilgiyi hızla bul");
    expect(candidate.candidate.learningOutcome).not.toContain("tablo");
    expect(candidate.candidate.contentTitle).toBe("Gökyüzü gözlemi duyurusu");
    expect(candidate.candidate.body).toBe(candidate.candidate.body.trim());
    expect(candidate.candidate.questionVersionIds).toEqual(candidate.base.questionVersionIds);
  });
});
