/**
 * Integration test — exercises the real Prisma/PostgreSQL persistence layer.
 * Requires the Docker Compose Postgres instance to be running:
 *
 *   docker compose up -d
 *   bunx prisma migrate deploy
 *   bun test tests/integration
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { ticketService } from "../../src/services/ticket/ticketService";
import { commentRepository } from "../../src/repositories/commentRepository";

const db = new PrismaClient();

describe("ticket lifecycle (real database)", () => {
  let reporterId: string;
  let agentId: string;

  beforeAll(async () => {
    const reporter = await db.user.create({
      data: {
        name: "IT Reporter",
        email: `it-reporter-${Date.now()}@example.com`,
        passwordHash: "not-used-in-this-test",
        role: "REPORTER",
      },
    });
    const agent = await db.user.create({
      data: {
        name: "IT Agent",
        email: `it-agent-${Date.now()}@example.com`,
        passwordHash: "not-used-in-this-test",
        role: "AGENT",
      },
    });
    reporterId = reporter.id;
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.comment.deleteMany({ where: { authorId: { in: [reporterId, agentId] } } });
    await db.ticket.deleteMany({ where: { reporterId } });
    await db.user.deleteMany({ where: { id: { in: [reporterId, agentId] } } });
    await db.$disconnect();
  });

  it("creates a ticket, records first response from an agent comment, and persists SLA info", async () => {
    const service = ticketService(db);

    const ticket = await service.createTicket({
      title: "Integration test ticket",
      description: "Created by the integration test suite.",
      priority: "HIGH",
      reporterId,
    });
    expect(ticket.status).toBe("OPEN");
    expect(ticket.firstResponseAt).toBeNull();

    // Reporter comments first — must NOT count as first response.
    await service.addComment(ticket.id, reporterId, "Any update on this?");

    let refreshed = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(refreshed.firstResponseAt).toBeNull();

    // Agent responds — this IS the first response.
    const agentComment = await service.addComment(ticket.id, agentId, "Looking into it now.");

    refreshed = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(refreshed.firstResponseAt).not.toBeNull();
    expect(refreshed.firstResponseAt?.getTime()).toBe(agentComment.createdAt.getTime());

    // A later reporter comment must not overwrite firstResponseAt.
    await service.addComment(ticket.id, reporterId, "Thanks, appreciated.");
    const afterSecondComment = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(afterSecondComment.firstResponseAt?.getTime()).toBe(agentComment.createdAt.getTime());

    // Verify persisted comment thread ordering.
    const thread = await commentRepository(db).forTicket(ticket.id);
    expect(thread).toHaveLength(3);
    expect(thread[0]!.authorId).toBe(reporterId);
    expect(thread[1]!.authorId).toBe(agentId);

    // SLA info should be computable and internally consistent (a resolution
    // clock always has a longer or equal budget than first response).
    const sla = await service.computeSLAFor(afterSecondComment);
    expect(sla.resolutionDueAt.toMillis()).toBeGreaterThanOrEqual(
  sla.firstResponseDueAt.toMillis()
);

    // Assign and resolve.
    const assigned = await service.assignTicket(ticket.id, agentId);
    expect(assigned.assigneeId).toBe(agentId);

    const inProgress = await service.changeStatus(ticket.id, "IN_PROGRESS");
    expect(inProgress.status).toBe("IN_PROGRESS");

    const resolved = await service.resolveTicket(ticket.id);
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("rejects an invalid status transition (CLOSED -> IN_PROGRESS) server-side", async () => {
    const service = ticketService(db);
    const ticket = await service.createTicket({
      title: "Transition guard test",
      description: "Should not allow CLOSED -> IN_PROGRESS.",
      priority: "LOW",
      reporterId,
    });

    await service.changeStatus(ticket.id, "CLOSED");

    await expect(service.changeStatus(ticket.id, "IN_PROGRESS")).rejects.toThrow();
  });
});
