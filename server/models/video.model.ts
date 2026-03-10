import { MessageRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PersistedGeneratedVideo = {
  mimeType: string;
  videoUrl: string;
  previewImageUrl?: string | null;
};

type CreateVideoGenerationRecordInput = {
  sessionId: string;
  prompt: string;
  modelAlias: string;
  resolutionLabel: string;
  durationLabel: string;
  startFrameMode?: string | null;
  assistantText?: string;
  nextSessionTitle?: string | null;
  generatedVideos: PersistedGeneratedVideo[];
};

type DbClient = Prisma.TransactionClient | typeof prisma;

function isTransactionTimeoutError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028") {
    return true;
  }

  const message = error instanceof Error ? error.message : "";
  return (
    /Transaction already closed/i.test(message) ||
    /expired transaction/i.test(message) ||
    /interactive transaction/i.test(message)
  );
}

async function writeVideoGenerationRecord(db: DbClient, input: CreateVideoGenerationRecordInput) {
  const userMessage = await db.chatMessage.create({
    data: {
      sessionId: input.sessionId,
      role: MessageRole.USER,
      content: input.prompt,
      metadata: {
        type: "video-generation",
        modelAlias: input.modelAlias,
        resolutionLabel: input.resolutionLabel,
        durationLabel: input.durationLabel,
        startFrameMode: input.startFrameMode ?? null,
      },
    },
    select: {
      id: true,
      role: true,
      content: true,
      metadata: true,
      createdAt: true,
    },
  });

  const generation = await db.videoGeneration.create({
    data: {
      sessionId: input.sessionId,
      prompt: input.prompt,
      modelAlias: input.modelAlias,
      resolutionLabel: input.resolutionLabel,
      durationLabel: input.durationLabel,
      startFrameMode: input.startFrameMode ?? null,
      videos: {
        create: input.generatedVideos.map((video) => ({
          sessionId: input.sessionId,
          mimeType: video.mimeType,
          videoUrl: video.videoUrl,
          previewImageUrl: video.previewImageUrl ?? null,
        })),
      },
    },
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
  });

  const assistantMessageContent =
    input.assistantText?.trim() ||
    `Generated ${generation.videos.length} video${generation.videos.length === 1 ? "" : "s"}.`;

  const assistantMessage = await db.chatMessage.create({
    data: {
      sessionId: input.sessionId,
      role: MessageRole.ASSISTANT,
      content: assistantMessageContent,
      metadata: {
        type: "video-generation",
        generationId: generation.id,
        videoCount: generation.videos.length,
      },
    },
    select: {
      id: true,
      role: true,
      content: true,
      metadata: true,
      createdAt: true,
    },
  });

  const session = await db.chatSession.update({
    where: {
      id: input.sessionId,
    },
    data: {
      updatedAt: new Date(),
      ...(input.nextSessionTitle
        ? {
            title: input.nextSessionTitle,
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    session,
    userMessage,
    assistantMessage,
    generation,
  };
}

export async function createVideoGenerationRecord(input: CreateVideoGenerationRecordInput) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        return writeVideoGenerationRecord(tx, input);
      },
      {
        maxWait: 20_000,
        timeout: 60_000,
      }
    );
  } catch (error) {
    if (!isTransactionTimeoutError(error)) {
      throw error;
    }

    return writeVideoGenerationRecord(prisma, input);
  }
}
