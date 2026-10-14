import { describe, expect, it } from "vitest";
import {
  selectPublishedPathCandidates,
  shouldReplacePublishedPath,
} from "../src/modules/learning-path/service.js";

describe("published learning-path selection", () => {
  it("prefers canonical P0 over a legacy path in the same area", () => {
    expect(
      shouldReplacePublishedPath(
        { code: "EDU-V2-P0-FAST-FOUNDATION", tenantId: null },
        { code: "EDUCATION_V2_P0_FAST_READING_G8_12", tenantId: null },
        "tenant-1",
      ),
    ).toBe(true);
  });

  it("keeps an assigned P1 path ahead of canonical P0", () => {
    expect(
      shouldReplacePublishedPath(
        { code: "EDUCATION_V2_P0_FAST_READING_G8_12", tenantId: null },
        { code: "EDUCATION_V2_P1_FAST_READING_G8_12_A", tenantId: null },
        "tenant-1",
      ),
    ).toBe(true);
  });

  it("prefers the active P1 cycle over a completed historical P1 cycle", () => {
    expect(
      shouldReplacePublishedPath(
        {
          code: "EDUCATION_V2_P1_A_MEANING_STRUCTURE_G8_12",
          tenantId: null,
          enrolled: true,
          activeEnrollment: false,
        },
        {
          code: "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_2_G8_12",
          tenantId: null,
          enrolled: true,
          activeEnrollment: true,
        },
        "tenant-1",
      ),
    ).toBe(true);
  });

  it("keeps canonical P0 ahead of a tenant-specific legacy path", () => {
    expect(
      shouldReplacePublishedPath(
        { code: "EDUCATION_V2_P0_FAST_READING_G8_12", tenantId: null },
        { code: "EDU-V2-P0-FAST-FOUNDATION", tenantId: "tenant-1" },
        "tenant-1",
      ),
    ).toBe(false);
  });

  it("keeps global canonical P0 ahead of a tenant-specific P0-shaped path", () => {
    expect(
      shouldReplacePublishedPath(
        { code: "EDUCATION_V2_P0_FAST_READING_G8_12", tenantId: "tenant-1" },
        { code: "EDUCATION_V2_P0_FAST_READING_G8_12_LEGACY", tenantId: null },
        "tenant-1",
      ),
    ).toBe(true);
    expect(
      shouldReplacePublishedPath(
        { code: "EDUCATION_V2_P0_FAST_READING_G8_12", tenantId: null },
        { code: "EDUCATION_V2_P0_FAST_READING_G8_12_LEGACY", tenantId: "tenant-1" },
        "tenant-1",
      ),
    ).toBe(false);
  });

  it("preserves an enrolled canonical P0 path when a global duplicate exists", () => {
    const globalPath = {
      code: "EDUCATION_V2_P0_FAST_READING_G8_12",
      tenantId: null,
      version: 1,
      enrolled: false,
    };
    const enrolledPath = {
      code: "EDUCATION_V2_P0_FAST_READING_G8_12",
      tenantId: "tenant-1",
      version: 1,
      enrolled: true,
    };

    expect(shouldReplacePublishedPath(globalPath, enrolledPath, "tenant-1")).toBe(true);
    expect(shouldReplacePublishedPath(enrolledPath, globalPath, "tenant-1")).toBe(false);
  });

  it("keeps the tenant-scoped enrolled path when both canonical duplicates are enrolled", () => {
    const globalPath = {
      code: "EDUCATION_V2_P0_FAST_READING_G8_12",
      tenantId: null,
      version: 1,
      enrolled: true,
    };
    const tenantPath = {
      code: "EDUCATION_V2_P0_FAST_READING_G8_12",
      tenantId: "tenant-1",
      version: 1,
      enrolled: true,
    };

    expect(shouldReplacePublishedPath(globalPath, tenantPath, "tenant-1")).toBe(true);
    expect(shouldReplacePublishedPath(tenantPath, globalPath, "tenant-1")).toBe(false);
  });

  it("preserves a legacy enrolled path over an un-enrolled canonical path", () => {
    expect(
      shouldReplacePublishedPath(
        {
          code: "EDU-V2-P0-FAST-FOUNDATION",
          tenantId: null,
          enrolled: true,
          completedProgressCount: 22,
          progressCount: 22,
        },
        {
          code: "EDUCATION_V2_P0_FAST_READING_G8_12",
          tenantId: null,
          enrolled: false,
          completedProgressCount: 9,
          progressCount: 9,
        },
        "tenant-1",
      ),
    ).toBe(false);
  });

  it("preserves the enrolled P0 path with the most completed progress", () => {
    const canonical = {
      code: "EDUCATION_V2_P0_FAST_READING_G8_12",
      tenantId: null,
      enrolled: true,
      completedProgressCount: 9,
      progressCount: 9,
    };
    const legacy = {
      code: "EDU-V2-P0-FAST-FOUNDATION",
      tenantId: null,
      enrolled: true,
      completedProgressCount: 22,
      progressCount: 22,
    };

    expect(shouldReplacePublishedPath(canonical, legacy, "tenant-1")).toBe(true);
    expect(shouldReplacePublishedPath(legacy, canonical, "tenant-1")).toBe(false);
  });

  it("keeps the completed P0 area when an assigned P1 route uses the same area", () => {
    const selected = selectPublishedPathCandidates(
      [
        {
          code: "EDUCATION_V2_P0_FAST_READING_G8_12",
          area: "FAST_READING",
          tenantId: null,
          enrolled: true,
          completedProgressCount: 9,
          progressCount: 9,
        },
        {
          code: "EDUCATION_V2_P0_READING_COMPREHENSION_G8_12",
          area: "READING_COMPREHENSION",
          tenantId: null,
          enrolled: true,
          completedProgressCount: 9,
          progressCount: 9,
        },
        {
          code: "EDUCATION_V2_P0_COMMON_G8_12",
          area: "COMMON",
          tenantId: null,
          enrolled: true,
          completedProgressCount: 4,
          progressCount: 4,
        },
        {
          code: "EDUCATION_V2_P1_A_MEANING_STRUCTURE_G8_12",
          area: "READING_COMPREHENSION",
          tenantId: null,
          enrolled: true,
        },
      ],
      "tenant-1",
    );

    expect(selected.map((path) => path.code)).toEqual([
      "EDUCATION_V2_P0_FAST_READING_G8_12",
      "EDUCATION_V2_P0_READING_COMPREHENSION_G8_12",
      "EDUCATION_V2_P0_COMMON_G8_12",
      "EDUCATION_V2_P1_A_MEANING_STRUCTURE_G8_12",
    ]);
  });

  it("keeps a completed P1 cycle visible before the active next cycle", () => {
    const selected = selectPublishedPathCandidates(
      [
        {
          code: "EDUCATION_V2_P0_READING_COMPREHENSION_G8_12",
          area: "READING_COMPREHENSION",
          tenantId: null,
          enrolled: true,
        },
        {
          code: "EDUCATION_V2_P1_A_MEANING_STRUCTURE_G8_12",
          area: "READING_COMPREHENSION",
          tenantId: null,
          enrolled: true,
          completedEnrollment: true,
          activeEnrollment: false,
        },
        {
          code: "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_2_G8_12",
          area: "READING_COMPREHENSION",
          tenantId: null,
          enrolled: true,
          completedEnrollment: false,
          activeEnrollment: true,
        },
      ],
      "tenant-1",
    );

    expect(selected.map((path) => path.code)).toEqual([
      "EDUCATION_V2_P0_READING_COMPREHENSION_G8_12",
      "EDUCATION_V2_P1_A_MEANING_STRUCTURE_G8_12",
      "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_2_G8_12",
    ]);
  });

  it("still prefers canonical P0 when neither path has student enrollment", () => {
    expect(
      shouldReplacePublishedPath(
        {
          code: "EDUCATION_V2_P0_FAST_READING_G8_12",
          tenantId: null,
          version: 1,
          enrolled: false,
        },
        {
          code: "EDU-V2-P0-FAST-FOUNDATION",
          tenantId: null,
          version: 1,
          enrolled: false,
        },
        "tenant-1",
      ),
    ).toBe(false);
  });

  it("does not replace canonical P0 with a legacy path", () => {
    expect(
      shouldReplacePublishedPath(
        { code: "EDUCATION_V2_P0_FAST_READING_G8_12", tenantId: null },
        { code: "EDU-V2-P0-FAST-FOUNDATION", tenantId: null },
        "tenant-1",
      ),
    ).toBe(false);
  });
});
