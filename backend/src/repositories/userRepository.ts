import { PrismaClient, UserRole } from "@prisma/client";

export function userRepository(db: PrismaClient) {
  return {
    findById: (id: string) => db.user.findUnique({ where: { id } }),
    findByEmail: (email: string) => db.user.findUnique({ where: { email } }),
    findMany: (role?: UserRole) => db.user.findMany({ where: role ? { role } : {} }),
    create: (data: { name: string; email: string; passwordHash: string; role: UserRole }) =>
      db.user.create({ data }),
  };
}
