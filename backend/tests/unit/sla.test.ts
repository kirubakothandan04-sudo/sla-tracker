import { describe, it, expect } from "bun:test";
import { DateTime } from "luxon";
import {
  addBusinessMinutes,
  businessMinutesBetween,
  nextBusinessInstant,
  BusinessHoursConfig,
} from "../../src/services/sla/businessHours";
import { computeTicketSLA, DEFAULT_SLA_POLICIES } from "../../src/services/sla/slaEngine";

const TZ = "Asia/Kolkata";

function cfg(holidays: string[] = []): BusinessHoursConfig {
  return { timezone: TZ, startHour: 9, endHour: 18, holidays: new Set(holidays) };
}

function local(iso: string): DateTime {
  // iso like "2026-08-21T17:00" interpreted in the business timezone
  return DateTime.fromISO(iso, { zone: TZ });
}

describe("nextBusinessInstant", () => {
  it("returns the same instant when already inside business hours", () => {
    const t = local("2026-08-24T10:00"); // Monday
    expect(nextBusinessInstant(t, cfg()).equals(t)).toBe(true);
  });

  it("rolls a before-hours ticket forward to 09:00 same day", () => {
    const t = local("2026-08-24T07:00"); // Monday 07:00
    const result = nextBusinessInstant(t, cfg());
    expect(result.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-08-24 09:00");
  });

  it("rolls an after-hours ticket forward to 09:00 next business day", () => {
    const t = local("2026-08-24T20:00"); // Monday 20:00
    const result = nextBusinessInstant(t, cfg());
    expect(result.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-08-25 09:00");
  });

  it("rolls a weekend ticket forward to Monday 09:00", () => {
    const saturday = local("2026-08-22T10:00");
    const result = nextBusinessInstant(saturday, cfg());
    expect(result.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-08-24 09:00");
  });

  it("skips a configured holiday", () => {
    // 2026-08-24 is a Monday; mark it as a holiday. Start after Friday close
    // so we actually roll forward (rather than already being mid-business-hours).
    const fridayAfterClose = local("2026-08-21T20:00");
    const result = nextBusinessInstant(fridayAfterClose, cfg(["2026-08-24"]));
    expect(result.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-08-25 09:00");
  });
});

describe("addBusinessMinutes", () => {
  it("matches the spec example: HIGH ticket, Friday 17:00 + 4h -> Monday 12:00", () => {
    // Friday 2026-08-21 17:00 + 4 business hours
    const start = local("2026-08-21T17:00");
    const due = addBusinessMinutes(start, 4 * 60, cfg());
    expect(due.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-08-24 12:00");
  });

  it("only counts one minute before the weekend from Friday 17:59", () => {
    const start = local("2026-08-21T17:59");
    const due = addBusinessMinutes(start, 2, cfg()); // 1 min today + 1 min Monday
    expect(due.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-08-24 09:01");
  });

  it("a holiday on Monday pushes the next business period to Tuesday", () => {
    const start = local("2026-08-21T17:30"); // Friday, 30 min before close
    const due = addBusinessMinutes(start, 60, cfg(["2026-08-24"]));
    // 30 min consumed Friday, 30 min remaining -> Tuesday 09:00 + 30min
    expect(due.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-08-25 09:30");
  });

  it("weekend + holiday combination is fully excluded", () => {
    // Saturday start, Monday is a holiday -> should land Tuesday
    const start = local("2026-08-22T10:00");
    const due = addBusinessMinutes(start, 60, cfg(["2026-08-24"]));
    expect(due.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-08-25 10:00");
  });

  it("spans multiple business days correctly (LOW resolution, 72h)", () => {
    // Monday 09:00 + 72 business hours: at 9h/business-day that's exactly 8
    // business days, landing at the close (18:00) of the 8th business day
    // (Mon 8/24 .. Wed 9/2, skipping the weekends in between).
    const start = local("2026-08-24T09:00");
    const due = addBusinessMinutes(start, 72 * 60, cfg());
    expect(due.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-09-02 18:00");
  });
});

describe("businessMinutesBetween", () => {
  it("returns 0 for a same-instant or reversed range", () => {
    const t = local("2026-08-24T10:00");
    expect(businessMinutesBetween(t, t, cfg())).toBe(0);
  });

  it("counts only the business portion across a weekend", () => {
    const fri = local("2026-08-21T17:00");
    const mon = local("2026-08-24T10:00");
    // Fri 17:00-18:00 (60min) + Mon 09:00-10:00 (60min) = 120
    expect(businessMinutesBetween(fri, mon, cfg())).toBe(120);
  });
});

describe("computeTicketSLA", () => {
  it("HIGH priority ticket on-track shortly after creation", () => {
    const createdAt = local("2026-08-24T09:00"); // Monday open
    const now = local("2026-08-24T09:30");
    const result = computeTicketSLA(
      { createdAt, priority: "HIGH", firstResponseAt: null, resolvedAt: null },
      cfg(),
      DEFAULT_SLA_POLICIES,
      now
    );
    expect(result.firstResponseState).toBe("ON_TRACK");
    // 4h budget, due at 13:00; at 09:30 remaining should be 3h30m = 210 min
    expect(result.firstResponseRemainingMinutes).toBe(210);
  });

  it("moves to AT_RISK once more than 75% of budget is consumed", () => {
    const createdAt = local("2026-08-24T09:00");
    // 1h budget (URGENT first response) -> AT_RISK boundary at 45 min consumed
    const justOver = local("2026-08-24T09:46"); // 46 min consumed > 45
    const result = computeTicketSLA(
      { createdAt, priority: "URGENT", firstResponseAt: null, resolvedAt: null },
      cfg(),
      DEFAULT_SLA_POLICIES,
      justOver
    );
    expect(result.firstResponseState).toBe("AT_RISK");
  });

  it("stays ON_TRACK exactly at the 75% boundary (boundary is exclusive of AT_RISK)", () => {
    const createdAt = local("2026-08-24T09:00");
    const exactly45 = local("2026-08-24T09:45"); // exactly 75% of 60 min
    const result = computeTicketSLA(
      { createdAt, priority: "URGENT", firstResponseAt: null, resolvedAt: null },
      cfg(),
      DEFAULT_SLA_POLICIES,
      exactly45
    );
    expect(result.firstResponseState).toBe("ON_TRACK");
  });

  it("marks BREACHED once the due time has passed with no response", () => {
    const createdAt = local("2026-08-24T09:00");
    const wayLater = local("2026-08-24T14:00"); // 1h budget long gone
    const result = computeTicketSLA(
      { createdAt, priority: "URGENT", firstResponseAt: null, resolvedAt: null },
      cfg(),
      DEFAULT_SLA_POLICIES,
      wayLater
    );
    expect(result.firstResponseState).toBe("BREACHED");
    expect(result.firstResponseRemainingMinutes).toBeLessThan(0);
  });

  it("freezes a completed SLA clock as met, even if evaluated much later", () => {
    const createdAt = local("2026-08-24T09:00");
    const respondedAt = local("2026-08-24T09:20"); // well within 1h budget
    const evaluatedMuchLater = local("2026-08-28T18:00"); // days later
    const result = computeTicketSLA(
      { createdAt, priority: "URGENT", firstResponseAt: respondedAt, resolvedAt: null },
      cfg(),
      DEFAULT_SLA_POLICIES,
      evaluatedMuchLater
    );
    expect(result.firstResponseState).toBe("ON_TRACK");
    expect(result.firstResponseRemainingMinutes).toBe(0);
  });

  it("permanently records BREACHED if the response itself came in after the due time", () => {
    const createdAt = local("2026-08-24T09:00");
    const lateResponse = local("2026-08-24T11:00"); // after 1h URGENT due time (10:00)
    const result = computeTicketSLA(
      { createdAt, priority: "URGENT", firstResponseAt: lateResponse, resolvedAt: null },
      cfg(),
      DEFAULT_SLA_POLICIES,
      DateTime.utc()
    );
    expect(result.firstResponseState).toBe("BREACHED");
  });
});
