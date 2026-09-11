const DEFAULT_TIMEZONE = "UTC";

type CalendarParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function resolveTimezone(candidate: string | undefined): string {
  const timezone = candidate?.trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function configuredCalendarTimezone(value = process.env.ENTITLEMENT_TIMEZONE): string {
  return resolveTimezone(value);
}

function dateParts(date: Date, timezone: string): CalendarParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  ) as Record<keyof CalendarParts, number>;
  return values;
}

export function calendarDateKey(
  date = new Date(),
  timezone = configuredCalendarTimezone(),
): string {
  const parts = dateParts(date, resolveTimezone(timezone));
  return [parts.year, parts.month, parts.day]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0")))
    .join("-");
}

function timezoneOffsetMs(date: Date, timezone: string): number {
  const parts = dateParts(date, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

function localMidnight(
  parts: Pick<CalendarParts, "year" | "month" | "day">,
  timezone: string,
): Date {
  const localMidnightUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  let candidate = localMidnightUtc;
  for (let i = 0; i < 4; i += 1) {
    candidate = localMidnightUtc - timezoneOffsetMs(new Date(candidate), timezone);
  }
  return new Date(candidate);
}

/** Returns the instant at which the local calendar day begins. */
export function calendarDayStart(date = new Date(), timezone = configuredCalendarTimezone()): Date {
  const resolvedTimezone = resolveTimezone(timezone);
  const parts = dateParts(date, resolvedTimezone);
  return localMidnight(parts, resolvedTimezone);
}

export function calendarDayBounds(
  date = new Date(),
  timezone = configuredCalendarTimezone(),
): { start: Date; end: Date } {
  const resolvedTimezone = resolveTimezone(timezone);
  const parts = dateParts(date, resolvedTimezone);
  const start = localMidnight(parts, resolvedTimezone);
  const end = localMidnight(
    { year: parts.year, month: parts.month, day: parts.day + 1 },
    resolvedTimezone,
  );
  return { start, end };
}

/** Maps a local calendar date to the UTC-midnight Date used by @db.Date fields. */
export function calendarDateStorage(
  date = new Date(),
  timezone = configuredCalendarTimezone(),
): Date {
  return new Date(`${calendarDateKey(date, timezone)}T00:00:00.000Z`);
}

/** Reads a previously stored calendar date without applying a second timezone conversion. */
export function storedCalendarDate(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

export function storedCalendarDateKey(date: Date): string {
  return storedCalendarDate(date).toISOString().slice(0, 10);
}
