import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export type AuthenticatedUser = {
  authUserId: string;
  dbUserId: string;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const dbUser = await prisma.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId },
    select: { id: true },
  });

  return {
    authUserId: userId,
    dbUserId: dbUser.id,
  };
}
