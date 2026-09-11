import { describe, expect, it } from "vitest";
import {
  calendarDateKey,
  calendarDateStorage,
  calendarDayBounds,
  configuredCalendarTimezone,
} from "../src/lib/calendar.js";

describe("calendar policy", () => {
  it("keeps the default UTC calendar contract", () => {
    const date = new Date("2026-09-11T23:30:00.000Z");
    expect(calendarDateKey(date, "UTC")).toBe("2026-09-11");
    expect(calendarDateStorage(date, "UTC").toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });

  it("uses the configured local day for usage, training, and streak storage", () => {
    const date = new Date("2026-09-11T21:30:00.000Z");
    expect(calendarDateKey(date, "Europe/Istanbul")).toBe("2026-09-12");
    expect(calendarDateStorage(date, "Europe/Istanbul").toISOString()).toBe(
      "2026-09-12T00:00:00.000Z",
    );
    const bounds = calendarDayBounds(date, "Europe/Istanbul");
    expect(bounds.start.toISOString()).toBe("2026-09-11T21:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-09-12T21:00:00.000Z");
  });

  it("fails safely to UTC for an invalid configured timezone", () => {
    expect(configuredCalendarTimezone("not/a-timezone")).toBe("UTC");
  });
});
