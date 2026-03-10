import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const createPrismaClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

export const getPrismaClient = () => {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
};

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, receiver);

    if (typeof value === "function") {
      return value.bind(client);
    }

    return value;
  },
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = getPrismaClient();
}
