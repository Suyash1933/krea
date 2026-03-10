import { prisma } from "@/lib/prisma";

export async function createSessionRecord(userId: string, title: string) {
  return prisma.chatSession.create({
    data: {
      userId,
      title,
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      createdAt: true,
    },
  });
}

export async function listSessionRecords(userId: string) {
  const sessions = await prisma.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          content: true,
          createdAt: true,
          role: true,
        },
      },
      images: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          mimeType: true,
          imageData: true,
        },
      },
      videos: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          mimeType: true,
          videoUrl: true,
          previewImageUrl: true,
        },
      },
    },
  });

  return sessions;
}

export async function getSessionOwnedByUser(userId: string, sessionId: string) {
  return prisma.chatSession.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getSessionHistoryRecord(userId: string, sessionId: string) {
  const session = await prisma.chatSession.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          metadata: true,
          createdAt: true,
        },
      },
      generations: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          prompt: true,
          modelAlias: true,
          aspectLabel: true,
          frameSizeLabel: true,
          resolutionLabel: true,
          imagePromptName: true,
          styleTransferName: true,
          createdAt: true,
          images: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              mimeType: true,
              imageData: true,
              createdAt: true,
            },
          },
        },
      },
      videoGenerations: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          prompt: true,
          modelAlias: true,
          resolutionLabel: true,
          durationLabel: true,
          startFrameMode: true,
          createdAt: true,
          videos: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              mimeType: true,
              videoUrl: true,
              previewImageUrl: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  return session;
}

export async function deleteSessionRecord(userId: string, sessionId: string) {
  const session = await prisma.chatSession.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!session) {
    return null;
  }

  await prisma.chatSession.delete({
    where: {
      id: session.id,
    },
  });

  return session.id;
}
