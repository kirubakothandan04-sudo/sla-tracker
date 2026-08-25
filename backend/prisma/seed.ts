import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const db = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash("password123");

  const reporter = await db.user.upsert({
    where: { email: "reporter@example.com" },
    update: {},
    create: {
      name: "Rita Reporter",
      email: "reporter@example.com",
      passwordHash,
      role: "REPORTER",
    },
  });

  const agent = await db.user.upsert({
    where: { email: "agent@example.com" },
    update: {},
    create: {
      name: "Alex Agent",
      email: "agent@example.com",
      passwordHash,
      role: "AGENT",
    },
  });

  await db.holiday.upsert({
    where: { date: new Date("2026-08-15T00:00:00.000Z") },
    update: {},
    create: { date: new Date("2026-08-15T00:00:00.000Z"), name: "Independence Day" },
  });

  const existingTickets = await db.ticket.count();
  if (existingTickets === 0) {
    await db.ticket.createMany({
      data: [
        {
          title: "Payment gateway timing out",
          description: "Customers report checkout hangs at the payment step.",
          priority: "URGENT",
          status: "OPEN",
          reporterId: reporter.id,
        },
        {
          title: "Login page shows stale session error",
          description: "Some users see a session-expired message right after logging in.",
          priority: "HIGH",
          status: "IN_PROGRESS",
          reporterId: reporter.id,
          assigneeId: agent.id,
        },
        {
          title: "Dashboard chart labels overlap",
          description: "On narrow viewports, the revenue chart's axis labels overlap.",
          priority: "MEDIUM",
          status: "OPEN",
          reporterId: reporter.id,
        },
        {
          title: "Typo in footer copyright year",
          description: "Footer still says 2025 instead of 2026.",
          priority: "LOW",
          status: "RESOLVED",
          reporterId: reporter.id,
          assigneeId: agent.id,
          resolvedAt: new Date(),
        },
      ],
    });
  }

  console.log("Seed complete.");
  console.log("Reporter login: reporter@example.com / password123");
  console.log("Agent login:    agent@example.com / password123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
