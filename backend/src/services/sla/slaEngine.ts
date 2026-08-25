import { DateTime } from "luxon";
import {
  BusinessHoursConfig,
  addBusinessMinutes,
  businessMinutesBetween,
} from "./businessHours";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type SLAState = "ON_TRACK" | "AT_RISK" | "BREACHED";

export interface SLAPolicy {
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

// Default policies in business-hour minutes (1 business hour = 60 min).
export const DEFAULT_SLA_POLICIES: Record<Priority, SLAPolicy> = {
  URGENT: { firstResponseMinutes: 1 * 60, resolutionMinutes: 4 * 60 },
  HIGH: { firstResponseMinutes: 4 * 60, resolutionMinutes: 24 * 60 },
  MEDIUM: { firstResponseMinutes: 8 * 60, resolutionMinutes: 48 * 60 },
  LOW: { firstResponseMinutes: 24 * 60, resolutionMinutes: 72 * 60 },
};

// AT_RISK boundary: state becomes AT_RISK once >75% of the SLA budget has
// been consumed (i.e. ON_TRACK covers the inclusive [0, 75%] range).
const AT_RISK_THRESHOLD = 0.75;

export interface SLAClockResult {
  dueAt: DateTime;
  state: SLAState;
  remainingMinutes: number; // negative once breached
}

export interface TicketSLAInput {
  createdAt: DateTime;
  priority: Priority;
  firstResponseAt: DateTime | null;
  resolvedAt: DateTime | null;
}

export interface TicketSLAResult {
  firstResponseDueAt: DateTime;
  resolutionDueAt: DateTime;
  firstResponseState: SLAState;
  resolutionState: SLAState;
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}

/**
 * Computes the state/remaining-time for a single SLA clock.
 *
 * If `completedAt` is set, the clock is frozen at that instant: state is
 * whatever it resolved to at completion time, and it can never later
 * become BREACHED just because the ticket stays open.
 */
function evaluateClock(
  startedAt: DateTime,
  budgetMinutes: number,
  now: DateTime,
  cfg: BusinessHoursConfig,
  completedAt: DateTime | null
): SLAClockResult {
  const dueAt = addBusinessMinutes(startedAt, budgetMinutes, cfg);

  const evalPoint = completedAt ?? now;
  const elapsed = businessMinutesBetween(startedAt, evalPoint, cfg);
  const consumedRatio = budgetMinutes === 0 ? 1 : elapsed / budgetMinutes;

  let state: SLAState;
  if (completedAt) {
    // Event already happened — clock is frozen. It was either met within
    // budget (state reflects consumption at completion, capped below
    // BREACHED once satisfied) or the event itself happened after the due
    // time, in which case it's a permanent breach record.
    state = completedAt > dueAt ? "BREACHED" : consumedRatio > AT_RISK_THRESHOLD ? "AT_RISK" : "ON_TRACK";
  } else if (now >= dueAt) {
    state = "BREACHED";
  } else if (consumedRatio > AT_RISK_THRESHOLD) {
    state = "AT_RISK";
  } else {
    state = "ON_TRACK";
  }

  const remainingMinutes = completedAt
    ? 0
    : now >= dueAt
    ? -businessMinutesBetween(dueAt, now, cfg)
    : businessMinutesBetween(now, dueAt, cfg);

  return { dueAt, state, remainingMinutes: Math.round(remainingMinutes) };
}

export function computeTicketSLA(
  input: TicketSLAInput,
  cfg: BusinessHoursConfig,
  policies: Record<Priority, SLAPolicy> = DEFAULT_SLA_POLICIES,
  now: DateTime = DateTime.utc()
): TicketSLAResult {
  const policy = policies[input.priority];

  const firstResponse = evaluateClock(
    input.createdAt,
    policy.firstResponseMinutes,
    now,
    cfg,
    input.firstResponseAt
  );

  const resolution = evaluateClock(
    input.createdAt,
    policy.resolutionMinutes,
    now,
    cfg,
    input.resolvedAt
  );

  return {
    firstResponseDueAt: firstResponse.dueAt,
    resolutionDueAt: resolution.dueAt,
    firstResponseState: firstResponse.state,
    resolutionState: resolution.state,
    firstResponseRemainingMinutes: firstResponse.remainingMinutes,
    resolutionRemainingMinutes: resolution.remainingMinutes,
  };
}
