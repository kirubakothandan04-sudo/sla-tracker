import { GraphQLContext } from "../context";
import { holidayRepository } from "../../repositories/holidayRepository";

export const holidayResolvers = {
  Query: {
    holidays: async (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      const rows = await holidayRepository(ctx.db).all();
      return rows.map((h) => ({ id: h.id, name: h.name, date: h.date.toISOString().slice(0, 10) }));
    },
  },
};
