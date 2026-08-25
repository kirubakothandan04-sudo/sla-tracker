import { PrismaClient } from "@prisma/client";

export function commentRepository(db: PrismaClient) {
  return {
    create: (ticketId: string, authorId: string, content: string) =>
      db.comment.create({
        data: { ticketId, authorId, content },
        include: { author: true },
      }),

    firstNonReporterComment: (ticketId: string, reporterId: string) =>
      db.comment.findFirst({
        where: { ticketId, authorId: { not: reporterId } },
        orderBy: { createdAt: "asc" },
      }),

    forTicket: (ticketId: string) =>
      db.comment.findMany({
        where: { ticketId },
        include: { author: true },
        orderBy: { createdAt: "asc" },
      }),
  };
}
