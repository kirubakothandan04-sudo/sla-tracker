import { DateTime } from "luxon";

export interface BusinessHoursConfig {
  timezone: string; // IANA tz, e.g. "Asia/Kolkata"
  startHour: number; // 0-23, inclusive start of business day
  endHour: number; // 0-23, exclusive end of business day
  holidays: ReadonlySet<string>; // "YYYY-MM-DD" in the configured timezone
}

const MINUTES_PER_BUSINESS_DAY_FACTORY = (cfg: BusinessHoursConfig): number =>
  (cfg.endHour - cfg.startHour) * 60;

function isoDateKey(dt: DateTime): string {
  return dt.toFormat("yyyy-MM-dd");
}

/** Weekday (Mon-Fri) and not a configured holiday, in the business timezone. */
export function isBusinessDay(dt: DateTime, cfg: BusinessHoursConfig): boolean {
  const local = dt.setZone(cfg.timezone);
  const weekday = local.weekday; // 1 = Monday ... 7 = Sunday
  if (weekday === 6 || weekday === 7) return false;
  if (cfg.holidays.has(isoDateKey(local))) return false;
  return true;
}

function businessStartOf(dt: DateTime, cfg: BusinessHoursConfig): DateTime {
  return dt.setZone(cfg.timezone).set({
    hour: cfg.startHour,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
}

function businessEndOf(dt: DateTime, cfg: BusinessHoursConfig): DateTime {
  return dt.setZone(cfg.timezone).set({
    hour: cfg.endHour,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
}

/**
 * Given any instant, returns the instant at which the next (or current)
 * business period begins. If `dt` already falls inside business hours on a
 * business day, it is returned unchanged.
 */
export function nextBusinessInstant(dt: DateTime, cfg: BusinessHoursConfig): DateTime {
  let cur = dt.setZone(cfg.timezone);

  // Cap the search so a misconfigured holiday list can't loop forever.
  for (let i = 0; i < 3650; i++) {
    if (isBusinessDay(cur, cfg)) {
      const start = businessStartOf(cur, cfg);
      const end = businessEndOf(cur, cfg);
      if (cur < start) return start;
      if (cur >= start && cur < end) return cur;
      // At or past end of business day -> move to next calendar day, 00:00
      cur = cur.plus({ days: 1 }).startOf("day");
      continue;
    }
    // Not a business day -> move to next calendar day, 00:00
    cur = cur.plus({ days: 1 }).startOf("day");
  }
  throw new Error("nextBusinessInstant: exceeded search horizon (check holiday config)");
}

/**
 * Adds `minutes` of business time to `start`, skipping nights, weekends and
 * configured holidays. Returns the resulting instant.
 */
export function addBusinessMinutes(
  start: DateTime,
  minutes: number,
  cfg: BusinessHoursConfig
): DateTime {
  if (minutes < 0) throw new Error("addBusinessMinutes: minutes must be >= 0");

  let cur = nextBusinessInstant(start, cfg);
  let remaining = minutes;

  for (let i = 0; i < 3650; i++) {
    const dayEnd = businessEndOf(cur, cfg);
    const availableToday = dayEnd.diff(cur, "minutes").minutes;

    if (remaining <= availableToday) {
      return cur.plus({ minutes: remaining });
    }

    remaining -= availableToday;
    cur = nextBusinessInstant(cur.plus({ days: 1 }).startOf("day"), cfg);
  }
  throw new Error("addBusinessMinutes: exceeded search horizon (check holiday config)");
}

/**
 * Counts business minutes strictly between two instants (start <= end).
 * Used to compute elapsed / remaining SLA budget.
 */
export function businessMinutesBetween(
  start: DateTime,
  end: DateTime,
  cfg: BusinessHoursConfig
): number {
  if (end <= start) return 0;

  let cur = nextBusinessInstant(start, cfg);
  if (cur >= end) return 0;

  let total = 0;
  for (let i = 0; i < 3650; i++) {
    const dayEnd = businessEndOf(cur, cfg);
    const segmentEnd = dayEnd < end ? dayEnd : end;
    total += Math.max(0, segmentEnd.diff(cur, "minutes").minutes);

    if (dayEnd >= end) return total;

    cur = nextBusinessInstant(cur.plus({ days: 1 }).startOf("day"), cfg);
    if (cur >= end) return total;
  }
  throw new Error("businessMinutesBetween: exceeded search horizon (check holiday config)");
}

export function minutesPerBusinessDay(cfg: BusinessHoursConfig): number {
  return MINUTES_PER_BUSINESS_DAY_FACTORY(cfg);
}
