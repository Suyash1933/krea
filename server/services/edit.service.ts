import { createGenerationRecord } from "@/server/models/generation.model";
import {
  generateImagesWithGemini,
  generateTextWithGemini,
  type GenerateImageInput,
  type UploadedImageInput,
} from "@/server/services/gemini.service";
import {
  createSessionForUser,
  deriveSessionTitle,
  ensureSessionForUser,
} from "@/server/services/session.service";

export type GenerateEditPayload = {
  sessionId?: string;
  prompt: string;
  modelAlias: string;
  storedModelAlias: string;
  aspectLabel: string;
  frameSizeLabel: string;
  resolutionLabel: string;
  sourceImageMode: "upload-image" | "asset-image";
  sourceImageName?: string | null;
  sourceImageFile?: UploadedImageInput | null;
  sourceImageAssetUrl?: string | null;
};

function toDataUrl(mimeType: string, data: string) {
  if (data.startsWith("http://") || data.startsWith("https://") || data.startsWith("data:")) {
    return data;
  }
  return `data:${mimeType};base64,${data}`;
}

const buildFallbackEditPrompt = (payload: GenerateEditPayload) =>
  [
    "Use the provided source image as the base image.",
    "Preserve identity, lighting continuity, and composition unless the user asks to change them.",
    "Apply the requested edit cleanly and realistically.",
    `Requested edit: ${payload.prompt.trim()}`,
  ].join(" ");

const buildGeminiEditInstruction = (payload: GenerateEditPayload) =>
  [
    "Rewrite this into a single high-quality image-editing instruction.",
    "Return only the rewritten instruction with no explanation.",
    "Assume the source image is provided separately and should be preserved unless changed by the user.",
    `Model label: ${payload.modelAlias}`,
    payload.sourceImageName?.trim() ? `Source image name: ${payload.sourceImageName.trim()}` : null,
    `User edit request: ${payload.prompt.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");

async function buildEditPrompt(payload: GenerateEditPayload) {
  const fallbackPrompt = buildFallbackEditPrompt(payload);
  const geminiPrompt = await generateTextWithGemini(
    buildGeminiEditInstruction(payload),
    undefined,
    fallbackPrompt
  );

  return geminiPrompt.replace(/\s+/g, " ").trim() || fallbackPrompt;
}

export async function generateEditForSession(userId: string, payload: GenerateEditPayload) {
  const trimmedPrompt = payload.prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required.");
  }

  if (!payload.sourceImageFile && !payload.sourceImageAssetUrl?.trim()) {
    throw new Error("Source image is required.");
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

  const editPrompt = await buildEditPrompt(payload);

  const geminiInput: GenerateImageInput = {
    prompt: editPrompt,
    modelAlias: payload.modelAlias,
    aspectLabel: payload.aspectLabel,
    frameSizeLabel: payload.frameSizeLabel,
    resolutionLabel: payload.resolutionLabel,
    imagePromptFile: payload.sourceImageFile,
    imagePromptAssetUrl: payload.sourceImageAssetUrl,
  };

  const generationResult = await generateImagesWithGemini(geminiInput);

  const persisted = await createGenerationRecord({
    sessionId,
    prompt: trimmedPrompt,
    modelAlias: payload.storedModelAlias,
    aspectLabel: payload.aspectLabel,
    frameSizeLabel: payload.frameSizeLabel,
    resolutionLabel: payload.resolutionLabel,
    imagePromptName: payload.sourceImageName ?? null,
    styleTransferName: null,
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
