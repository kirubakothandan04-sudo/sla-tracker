import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

export function holidayRepository(db: PrismaClient) {
  return {
    all: () => db.holiday.findMany({ orderBy: { date: "asc" } }),

    /** Returns holiday dates as "YYYY-MM-DD" strings, for the business-hours engine. */
    allAsDateKeys: async (): Promise<string[]> => {
      const holidays = await db.holiday.findMany();
      return holidays.map((h) => DateTime.fromJSDate(h.date, { zone: "utc" }).toFormat("yyyy-MM-dd"));
    },
  };
}
