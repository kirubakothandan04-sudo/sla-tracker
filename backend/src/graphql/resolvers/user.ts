import { UserRole } from "@prisma/client";
import { GraphQLContext, requireAuth } from "../context";
import { userRepository } from "../../repositories/userRepository";
import { Errors } from "../../validation/errors";

export const userResolvers = {
  Query: {
    users: async (_parent: unknown, args: { role?: UserRole | null }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return userRepository(ctx.db).findMany(args.role ?? undefined);
    },
    me: async (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      const authUser = requireAuth(ctx);
      const user = await userRepository(ctx.db).findById(authUser.id);
      if (!user) throw Errors.userNotFound(authUser.id);
      return user;
    },
  },
};
