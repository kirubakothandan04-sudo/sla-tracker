import { UserRole } from "@prisma/client";
import { GraphQLContext } from "../context";
import { userRepository } from "../../repositories/userRepository";
import { hashPassword, signToken, verifyPassword } from "../../services/auth/authService";
import { Errors } from "../../validation/errors";

interface RegisterArgs {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

interface LoginArgs {
  email: string;
  password: string;
}

export const authResolvers = {
  Mutation: {
    register: async (_parent: unknown, args: RegisterArgs, ctx: GraphQLContext) => {
      const users = userRepository(ctx.db);

      if (!args.name.trim()) throw Errors.validation("Name must not be empty.");
      if (!args.email.trim()) throw Errors.validation("Email must not be empty.");
      if (args.password.length < 8) {
        throw Errors.validation("Password must be at least 8 characters.");
      }

      const existing = await users.findByEmail(args.email.toLowerCase());
      if (existing) throw Errors.emailInUse();

      const passwordHash = await hashPassword(args.password);
      const user = await users.create({
        name: args.name.trim(),
        email: args.email.toLowerCase(),
        passwordHash,
        role: args.role,
      });

      const token = signToken({ userId: user.id, role: user.role });
      return { token, user };
    },

    login: async (_parent: unknown, args: LoginArgs, ctx: GraphQLContext) => {
      const users = userRepository(ctx.db);
      const user = await users.findByEmail(args.email.toLowerCase());
      if (!user) throw Errors.invalidCredentials();

      const valid = await verifyPassword(user.passwordHash, args.password);
      if (!valid) throw Errors.invalidCredentials();

      const token = signToken({ userId: user.id, role: user.role });
      return { token, user };
    },
  },
};
