import { createGenerationRecord } from "@/server/models/generation.model";
import {
  type GenerateImageInput,
  generateImagesWithGemini,
  type UploadedImageInput,
} from "@/server/services/gemini.service";
import {
  createSessionForUser,
  deriveSessionTitle,
  ensureSessionForUser,
} from "@/server/services/session.service";

export type GenerateImagePayload = {
  sessionId?: string;
  prompt: string;
  modelAlias: string;
  aspectLabel: string;
  frameSizeLabel: string;
  resolutionLabel: string;
  imagePromptFile?: UploadedImageInput | null;
  styleTransferFile?: UploadedImageInput | null;
  imagePromptAssetUrl?: string | null;
  styleTransferAssetUrl?: string | null;
};

function toDataUrl(mimeType: string, data: string) {
  if (data.startsWith("http://") || data.startsWith("https://") || data.startsWith("data:")) {
    return data;
  }
  return `data:${mimeType};base64,${data}`;
}

export async function generateImageForSession(userId: string, payload: GenerateImagePayload) {
  const trimmedPrompt = payload.prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required.");
  }

  let sessionId = payload.sessionId;
  let nextSessionTitle: string | null = null;

  if (sessionId) {
    const existing = await ensureSessionForUser(userId, sessionId);
    if (!existing) {
      throw new Error("Session not found.");
    }

    if (existing.title === "New Session") {
      nextSessionTitle = deriveSessionTitle(trimmedPrompt);
    }
  } else {
    const createdSession = await createSessionForUser(userId, deriveSessionTitle(trimmedPrompt));
    sessionId = createdSession.id;
  }

  if (!sessionId) {
    throw new Error("Session could not be resolved.");
  }

  const geminiInput: GenerateImageInput = {
    prompt: trimmedPrompt,
    modelAlias: payload.modelAlias,
    aspectLabel: payload.aspectLabel,
    frameSizeLabel: payload.frameSizeLabel,
    resolutionLabel: payload.resolutionLabel,
    imagePromptFile: payload.imagePromptFile,
    styleTransferFile: payload.styleTransferFile,
    imagePromptAssetUrl: payload.imagePromptAssetUrl,
    styleTransferAssetUrl: payload.styleTransferAssetUrl,
  };

  const generationResult = await generateImagesWithGemini(geminiInput);

  const persisted = await createGenerationRecord({
    sessionId,
    prompt: trimmedPrompt,
    modelAlias: payload.modelAlias,
    aspectLabel: payload.aspectLabel,
    frameSizeLabel: payload.frameSizeLabel,
    resolutionLabel: payload.resolutionLabel,
    imagePromptName: payload.imagePromptFile?.name ?? null,
    styleTransferName: payload.styleTransferFile?.name ?? null,
    assistantText: generationResult.text,
    nextSessionTitle,
    generatedImages: generationResult.images.map((image) => ({
      mimeType: image.mimeType,
      data: image.data,
    })),
  });

  return {
    session: {
      id: persisted.session.id,
      title: persisted.session.title,
      createdAt: persisted.session.createdAt.toISOString(),
      updatedAt: persisted.session.updatedAt.toISOString(),
    },
    userMessage: {
      id: persisted.userMessage.id,
      role: persisted.userMessage.role,
      content: persisted.userMessage.content,
      metadata: persisted.userMessage.metadata,
      createdAt: persisted.userMessage.createdAt.toISOString(),
    },
    assistantMessage: {
      id: persisted.assistantMessage.id,
      role: persisted.assistantMessage.role,
      content: persisted.assistantMessage.content,
      metadata: persisted.assistantMessage.metadata,
      createdAt: persisted.assistantMessage.createdAt.toISOString(),
    },
    generation: {
      id: persisted.generation.id,
      prompt: persisted.generation.prompt,
      modelAlias: persisted.generation.modelAlias,
      aspectLabel: persisted.generation.aspectLabel,
      frameSizeLabel: persisted.generation.frameSizeLabel,
      resolutionLabel: persisted.generation.resolutionLabel,
      imagePromptName: persisted.generation.imagePromptName,
      styleTransferName: persisted.generation.styleTransferName,
      createdAt: persisted.generation.createdAt.toISOString(),
      images: persisted.generation.images.map((image) => ({
        id: image.id,
        dataUrl: toDataUrl(image.mimeType, image.imageData),
        mimeType: image.mimeType,
        createdAt: image.createdAt.toISOString(),
      })),
    },
  };
}
