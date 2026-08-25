import { Priority, Ticket, TicketStatus } from "@prisma/client";
import { GraphQLContext, requireAgent, requireAuth } from "../context";
import { ticketService } from "../../services/ticket/ticketService";
import { ticketRepository } from "../../repositories/ticketRepository";
import { commentRepository } from "../../repositories/commentRepository";
import { SLAState } from "../../services/sla/slaEngine";

interface TicketsArgs {
  status?: TicketStatus | null;
  priority?: Priority | null;
  assigneeId?: string | null;
  slaState?: SLAState | null;
  take?: number | null;
  cursor?: string | null;
}

// A ticket's overall SLA state is the worst of its two clocks.
function overallState(states: { firstResponseState: SLAState; resolutionState: SLAState }): SLAState {
  if (states.firstResponseState === "BREACHED" || states.resolutionState === "BREACHED") return "BREACHED";
  if (states.firstResponseState === "AT_RISK" || states.resolutionState === "AT_RISK") return "AT_RISK";
  return "ON_TRACK";
}

export const ticketResolvers = {
  Query: {
    tickets: async (_parent: unknown, args: TicketsArgs, ctx: GraphQLContext) => {
      requireAuth(ctx);
      const service = ticketService(ctx.db);
      const repo = ticketRepository(ctx.db);
      const take = Math.min(Math.max(args.take ?? 20, 1), 100);

      if (args.slaState) {
        // SLA state is computed, not stored, so we filter in-memory. Fine at
        // take-home scale; a production version would persist/refresh a
        // materialized sla_state column instead. See README tradeoffs.
        const all = await repo.findMany(
          {
            ...(args.status ? { status: args.status } : {}),
            ...(args.priority ? { priority: args.priority } : {}),
            ...(args.assigneeId ? { assigneeId: args.assigneeId } : {}),
          },
          { take: 10_000 }
        );
        const withState = await Promise.all(
          all.map(async (t) => ({ ticket: t, sla: await service.computeSLAFor(t) }))
        );
        const filtered = withState.filter((x) => overallState(x.sla) === args.slaState);

        const startIndex = args.cursor ? filtered.findIndex((x) => x.ticket.id === args.cursor) + 1 : 0;
        const page = filtered.slice(startIndex, startIndex + take);
        const hasNextPage = filtered.length > startIndex + take;

        return {
          nodes: page.map((x) => x.ticket),
          pageInfo: {
            hasNextPage,
            endCursor: page.length > 0 ? page[page.length - 1]!.ticket.id : null,
          },
        };
      }

      const rows = await repo.findMany(
        {
          ...(args.status ? { status: args.status } : {}),
          ...(args.priority ? { priority: args.priority } : {}),
          ...(args.assigneeId ? { assigneeId: args.assigneeId } : {}),
        },
        { take, ...(args.cursor ? { cursor: args.cursor } : {}) }
      );

      const hasNextPage = rows.length > take;
      const nodes = hasNextPage ? rows.slice(0, take) : rows;

      return {
        nodes,
        pageInfo: {
          hasNextPage,
          endCursor: nodes.length > 0 ? nodes[nodes.length - 1]!.id : null,
        },
      };
    },

    ticket: async (_parent: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return ticketRepository(ctx.db).findById(args.id);
    },

    dashboard: async (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return ticketService(ctx.db).dashboard();
    },
  },

  Mutation: {
    createTicket: async (
      _parent: unknown,
      args: { title: string; description: string; priority: Priority },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      return ticketService(ctx.db).createTicket({ ...args, reporterId: user.id });
    },

    assignTicket: async (
      _parent: unknown,
      args: { ticketId: string; assigneeId: string },
      ctx: GraphQLContext
    ) => {
      requireAgent(ctx);
      return ticketService(ctx.db).assignTicket(args.ticketId, args.assigneeId);
    },

    changeTicketStatus: async (
      _parent: unknown,
      args: { ticketId: string; status: TicketStatus },
      ctx: GraphQLContext
    ) => {
      requireAgent(ctx);
      return ticketService(ctx.db).changeStatus(args.ticketId, args.status);
    },

    resolveTicket: async (_parent: unknown, args: { ticketId: string }, ctx: GraphQLContext) => {
      requireAgent(ctx);
      return ticketService(ctx.db).resolveTicket(args.ticketId);
    },
  },

  Ticket: {
    sla: async (parent: Ticket, _args: unknown, ctx: GraphQLContext) => {
      return ticketService(ctx.db).computeSLAFor(parent);
    },
    comments: async (parent: { id: string }, _args: unknown, ctx: GraphQLContext) => {
      return commentRepository(ctx.db).forTicket(parent.id);
    },
    createdAt: (parent: Ticket) => parent.createdAt.toISOString(),
    firstResponseAt: (parent: Ticket) => parent.firstResponseAt?.toISOString() ?? null,
    resolvedAt: (parent: Ticket) => parent.resolvedAt?.toISOString() ?? null,
  },

  SLAInfo: {
    firstResponseDueAt: (parent: { firstResponseDueAt: { toISO: () => string | null } }) =>
      parent.firstResponseDueAt.toISO(),
    resolutionDueAt: (parent: { resolutionDueAt: { toISO: () => string | null } }) =>
      parent.resolutionDueAt.toISO(),
  },
};
