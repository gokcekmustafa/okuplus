import { describe, expect, it } from "vitest";
import { shouldReplacePublishedPath } from "../src/modules/learning-path/service.js";

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

  it("keeps canonical P0 ahead of a tenant-specific legacy path", () => {
    expect(
      shouldReplacePublishedPath(
        { code: "EDUCATION_V2_P0_FAST_READING_G8_12", tenantId: null },
        { code: "EDU-V2-P0-FAST-FOUNDATION", tenantId: "tenant-1" },
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
