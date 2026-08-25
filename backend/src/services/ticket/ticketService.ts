import { PrismaClient, Priority, TicketStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { ticketRepository } from "../../repositories/ticketRepository";
import { commentRepository } from "../../repositories/commentRepository";
import { userRepository } from "../../repositories/userRepository";
import { holidayRepository } from "../../repositories/holidayRepository";
import { buildBusinessHoursConfig } from "../sla/config";
import { computeTicketSLA, TicketSLAResult } from "../sla/slaEngine";
import {
  assertValidComment,
  assertValidDescription,
  assertValidPriority,
  assertValidTitle,
  assertValidTransition,
} from "../../validation/ticketValidation";
import { Errors } from "../../validation/errors";

export function ticketService(db: PrismaClient) {
  const tickets = ticketRepository(db);
  const comments = commentRepository(db);
  const users = userRepository(db);
  const holidays = holidayRepository(db);

  async function slaConfig() {
    return buildBusinessHoursConfig(await holidays.allAsDateKeys());
  }

  async function computeSLAFor(ticket: {
    createdAt: Date;
    priority: Priority;
    firstResponseAt: Date | null;
    resolvedAt: Date | null;
  }): Promise<TicketSLAResult> {
    const cfg = await slaConfig();
    return computeTicketSLA(
      {
        createdAt: DateTime.fromJSDate(ticket.createdAt),
        priority: ticket.priority,
        firstResponseAt: ticket.firstResponseAt ? DateTime.fromJSDate(ticket.firstResponseAt) : null,
        resolvedAt: ticket.resolvedAt ? DateTime.fromJSDate(ticket.resolvedAt) : null,
      },
      cfg
    );
  }

  return {
    computeSLAFor,

    async createTicket(input: { title: string; description: string; priority: string; reporterId: string }) {
      assertValidTitle(input.title);
      assertValidDescription(input.description);
      assertValidPriority(input.priority);

      return tickets.create({
        title: input.title.trim(),
        description: input.description.trim(),
        priority: input.priority,
        reporterId: input.reporterId,
      });
    },

    async assignTicket(ticketId: string, assigneeId: string) {
      const ticket = await tickets.findById(ticketId);
      if (!ticket) throw Errors.ticketNotFound(ticketId);

      const assignee = await users.findById(assigneeId);
      if (!assignee) throw Errors.userNotFound(assigneeId);
      if (assignee.role !== "AGENT") {
        throw Errors.validation("Tickets can only be assigned to users with the AGENT role.");
      }

      return tickets.assign(ticketId, assigneeId);
    },

    async changeStatus(ticketId: string, nextStatus: TicketStatus) {
      const ticket = await tickets.findById(ticketId);
      if (!ticket) throw Errors.ticketNotFound(ticketId);

      assertValidTransition(ticket.status, nextStatus);

      const resolvedAt =
        nextStatus === "RESOLVED" && !ticket.resolvedAt
          ? new Date()
          : nextStatus === "OPEN" || nextStatus === "IN_PROGRESS"
          ? ticket.resolvedAt // keep existing resolution record; reopening doesn't erase history
          : ticket.resolvedAt;

      return tickets.updateStatus(ticketId, nextStatus, resolvedAt ?? null);
    },

    async resolveTicket(ticketId: string) {
      const ticket = await tickets.findById(ticketId);
      if (!ticket) throw Errors.ticketNotFound(ticketId);

      assertValidTransition(ticket.status, "RESOLVED");
      return tickets.updateStatus(ticketId, "RESOLVED", ticket.resolvedAt ?? new Date());
    },

    async addComment(ticketId: string, authorId: string, content: string) {
      assertValidComment(content);

      const ticket = await tickets.findById(ticketId);
      if (!ticket) throw Errors.ticketNotFound(ticketId);

      const author = await users.findById(authorId);
      if (!author) throw Errors.userNotFound(authorId);

      const comment = await comments.create(ticketId, authorId, content.trim());

      // First response = first comment from someone other than the reporter.
      if (!ticket.firstResponseAt && authorId !== ticket.reporterId) {
        const existingResponse = await comments.firstNonReporterComment(ticketId, ticket.reporterId);
        if (existingResponse && existingResponse.id === comment.id) {
          await tickets.setFirstResponseAt(ticketId, comment.createdAt);
        }
      }

      return comment;
    },

    async dashboard() {
      const active = await tickets.allActive();
      const cfg = await slaConfig();

      let atRisk = 0;
      let breached = 0;

      for (const ticket of active) {
        const sla = computeTicketSLA(
          {
            createdAt: DateTime.fromJSDate(ticket.createdAt),
            priority: ticket.priority,
            firstResponseAt: ticket.firstResponseAt ? DateTime.fromJSDate(ticket.firstResponseAt) : null,
            resolvedAt: ticket.resolvedAt ? DateTime.fromJSDate(ticket.resolvedAt) : null,
          },
          cfg
        );
        const worstState =
          sla.resolutionState === "BREACHED" || sla.firstResponseState === "BREACHED"
            ? "BREACHED"
            : sla.resolutionState === "AT_RISK" || sla.firstResponseState === "AT_RISK"
            ? "AT_RISK"
            : "ON_TRACK";
        if (worstState === "BREACHED") breached++;
        else if (worstState === "AT_RISK") atRisk++;
      }

      const counts = await tickets.counts();
      return {
        openTickets: counts.openTickets,
        inProgressTickets: counts.inProgressTickets,
        atRiskTickets: atRisk,
        breachedTickets: breached,
      };
    },
  };
}
