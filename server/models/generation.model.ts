import { MessageRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PersistedGeneratedImage = {
  mimeType: string;
  data: string;
};

type CreateGenerationRecordInput = {
  sessionId: string;
  prompt: string;
  modelAlias: string;
  aspectLabel: string;
  frameSizeLabel: string;
  resolutionLabel: string;
  imagePromptName?: string | null;
  styleTransferName?: string | null;
  assistantText?: string;
  nextSessionTitle?: string | null;
  generatedImages: PersistedGeneratedImage[];
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

async function writeGenerationRecord(db: DbClient, input: CreateGenerationRecordInput) {
  const userMessage = await db.chatMessage.create({
    data: {
      sessionId: input.sessionId,
      role: MessageRole.USER,
      content: input.prompt,
      metadata: {
        modelAlias: input.modelAlias,
        aspectLabel: input.aspectLabel,
        frameSizeLabel: input.frameSizeLabel,
        resolutionLabel: input.resolutionLabel,
        imagePromptName: input.imagePromptName ?? null,
        styleTransferName: input.styleTransferName ?? null,
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

  const generation = await db.imageGeneration.create({
    data: {
      sessionId: input.sessionId,
      prompt: input.prompt,
      modelAlias: input.modelAlias,
      aspectLabel: input.aspectLabel,
      frameSizeLabel: input.frameSizeLabel,
      resolutionLabel: input.resolutionLabel,
      imagePromptName: input.imagePromptName ?? null,
      styleTransferName: input.styleTransferName ?? null,
      images: {
        create: input.generatedImages.map((image) => ({
          sessionId: input.sessionId,
          mimeType: image.mimeType,
          imageData: image.data,
        })),
      },
    },
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
  });

  const assistantMessageContent =
    input.assistantText?.trim() ||
    `Generated ${generation.images.length} image${generation.images.length === 1 ? "" : "s"}.`;

  const assistantMessage = await db.chatMessage.create({
    data: {
      sessionId: input.sessionId,
      role: MessageRole.ASSISTANT,
      content: assistantMessageContent,
      metadata: {
        generationId: generation.id,
        imageCount: generation.images.length,
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

export async function createGenerationRecord(input: CreateGenerationRecordInput) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        return writeGenerationRecord(tx, input);
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

    // Fallback path for high-latency environments (e.g. remote Neon + large payloads).
    return writeGenerationRecord(prisma, input);
  }
}
