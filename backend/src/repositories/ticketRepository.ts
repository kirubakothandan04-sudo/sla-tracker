import { Prisma, PrismaClient, Priority, TicketStatus } from "@prisma/client";

export interface TicketFilters {
  status?: TicketStatus;
  priority?: Priority;
  assigneeId?: string;
}

export interface PageArgs {
  take: number;
  cursor?: string;
}

export function ticketRepository(db: PrismaClient) {
  return {
    findById: (id: string) =>
      db.ticket.findUnique({
        where: { id },
        include: { reporter: true, assignee: true },
      }),

    findMany: (filters: TicketFilters, page: PageArgs) => {
      const where: Prisma.TicketWhereInput = {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.priority ? { priority: filters.priority } : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      };

      return db.ticket.findMany({
        where,
        include: { reporter: true, assignee: true },
        orderBy: { createdAt: "desc" },
        take: page.take + 1, // fetch one extra to know if there's a next page
        ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
      });
    },

    create: (data: { title: string; description: string; priority: Priority; reporterId: string }) =>
      db.ticket.create({
        data,
        include: { reporter: true, assignee: true },
      }),

    assign: (ticketId: string, assigneeId: string) =>
      db.ticket.update({
        where: { id: ticketId },
        data: { assigneeId },
        include: { reporter: true, assignee: true },
      }),

    updateStatus: (ticketId: string, status: TicketStatus, resolvedAt: Date | null) =>
      db.ticket.update({
        where: { id: ticketId },
        data: { status, ...(resolvedAt !== null ? { resolvedAt } : {}) },
        include: { reporter: true, assignee: true },
      }),

    setFirstResponseAt: (ticketId: string, at: Date) =>
      db.ticket.update({
        where: { id: ticketId },
        data: { firstResponseAt: at },
        include: { reporter: true, assignee: true },
      }),

    counts: async () => {
      const [openTickets, inProgressTickets] = await Promise.all([
        db.ticket.count({ where: { status: "OPEN" } }),
        db.ticket.count({ where: { status: "IN_PROGRESS" } }),
      ]);
      return { openTickets, inProgressTickets };
    },

    allActive: () =>
      db.ticket.findMany({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        include: { reporter: true, assignee: true },
      }),
  };
}
