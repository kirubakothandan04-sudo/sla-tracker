import { Priority, TicketStatus } from "@prisma/client";
import { Errors } from "./errors";

const VALID_PRIORITIES = new Set<string>(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export function assertValidTitle(title: string): void {
  if (!title || title.trim().length === 0) {
    throw Errors.validation("Ticket title must not be empty.");
  }
  if (title.length > 200) {
    throw Errors.validation("Ticket title must be 200 characters or fewer.");
  }
}

export function assertValidDescription(description: string): void {
  if (!description || description.trim().length === 0) {
    throw Errors.validation("Ticket description must not be empty.");
  }
}

export function assertValidPriority(priority: string): asserts priority is Priority {
  if (!VALID_PRIORITIES.has(priority)) {
    throw Errors.invalidPriority(priority);
  }
}

export function assertValidComment(content: string): void {
  if (!content || content.trim().length === 0) {
    throw Errors.invalidComment("Comment content must not be empty.");
  }
}

// Allowed forward transitions. CLOSED tickets may only be reopened explicitly
// back to OPEN; they cannot jump straight to IN_PROGRESS.
const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["RESOLVED", "OPEN", "CLOSED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["OPEN"],
};

export function assertValidTransition(from: TicketStatus, to: TicketStatus): void {
  if (from === to) return; // no-op transitions are harmless
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw Errors.invalidTransition(from, to);
  }
}
