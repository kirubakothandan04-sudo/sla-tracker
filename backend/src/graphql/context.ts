import { PrismaClient, UserRole } from "@prisma/client";
import { YogaInitialContext } from "graphql-yoga";
import { verifyToken } from "../services/auth/authService";
import { prisma } from "../db/prisma";
import { Errors } from "../validation/errors";

export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface GraphQLContext {
  db: PrismaClient;
  user: AuthUser | null;
}

export async function createContext({ request }: YogaInitialContext): Promise<GraphQLContext> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const payload = token ? verifyToken(token) : null;

  return {
    db: prisma,
    user: payload ? { id: payload.userId, role: payload.role } : null,
  };
}

export function requireAuth(ctx: GraphQLContext): AuthUser {
  if (!ctx.user) throw Errors.unauthorized();
  return ctx.user;
}

export function requireAgent(ctx: GraphQLContext): AuthUser {
  const user = requireAuth(ctx);
  if (user.role !== "AGENT") {
    throw Errors.forbidden("Only agents can perform this action.");
  }
  return user;
}
