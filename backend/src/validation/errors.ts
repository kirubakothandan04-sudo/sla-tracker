import { GraphQLError } from "graphql";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "TICKET_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_STATUS_TRANSITION"
  | "INVALID_PRIORITY"
  | "INVALID_COMMENT"
  | "EMAIL_IN_USE"
  | "INVALID_CREDENTIALS";

export function appError(code: ErrorCode, message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}

export const Errors = {
  validation: (message: string) => appError("VALIDATION_ERROR", message),
  ticketNotFound: (id: string) => appError("TICKET_NOT_FOUND", `Ticket ${id} was not found.`),
  userNotFound: (id: string) => appError("USER_NOT_FOUND", `User ${id} was not found.`),
  unauthorized: () => appError("UNAUTHORIZED", "You must be logged in to perform this action."),
  forbidden: (message = "You are not allowed to perform this action.") =>
    appError("FORBIDDEN", message),
  invalidTransition: (from: string, to: string) =>
    appError("INVALID_STATUS_TRANSITION", `Ticket cannot transition from ${from} to ${to}.`),
  invalidPriority: (value: string) => appError("INVALID_PRIORITY", `Invalid priority: ${value}`),
  invalidComment: (message: string) => appError("INVALID_COMMENT", message),
  emailInUse: () => appError("EMAIL_IN_USE", "An account with this email already exists."),
  invalidCredentials: () => appError("INVALID_CREDENTIALS", "Invalid email or password."),
};
