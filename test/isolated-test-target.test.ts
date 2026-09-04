import { describe, expect, it } from "vitest";
import { parseCatalogTargetUrl } from "../src/curriculum/catalog-target-verification.js";
import {
  assertIsolatedFirstRealPackTestTarget,
  ISOLATED_FIRST_REAL_PACK_TEST_DATABASE,
} from "../scripts/isolated-test-target.js";

function target(url: string) {
  return parseCatalogTargetUrl(url, "TEST");
}

describe("isolated First Real Pack TEST target", () => {
  it("exact isolated DB allowed", () => {
    expect(() =>
      assertIsolatedFirstRealPackTestTarget(
        target(`postgresql://owner@127.0.0.1:5432/${ISOLATED_FIRST_REAL_PACK_TEST_DATABASE}`),
      ),
    ).not.toThrow();
  });

  it.each([
    "postgresql://owner@127.0.0.1:5432/oku_plus_test",
    "postgresql://owner@127.0.0.1:5432/oku_plus_8g8_isolated_test_copy",
    "postgresql://owner@127.0.0.1:5432/oku_plus_production",
    "postgresql://owner@127.0.0.1:5432/oku_plus_staging",
  ])("wrong DB name is blocked: %s", (url) => {
    expect(() => assertIsolatedFirstRealPackTestTarget(target(url))).toThrow();
  });

  it.each([
    "postgresql://owner@example.com:5432/oku_plus_8g8_isolated_test",
    "postgresql://owner@ep-fixture.eu-central-1.aws.neon.tech/oku_plus_8g8_isolated_test",
  ])("remote or Neon host is blocked: %s", (url) => {
    expect(() => assertIsolatedFirstRealPackTestTarget(target(url))).toThrow();
  });
});
