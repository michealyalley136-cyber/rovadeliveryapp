import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & { rovaPrisma?: PrismaClient };

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Application storage is not configured.");
  globalForPrisma.rovaPrisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return globalForPrisma.rovaPrisma;
}
