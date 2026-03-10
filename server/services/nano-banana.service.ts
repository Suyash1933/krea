import { createGenerationRecord } from "@/server/models/generation.model";
import {
  type UploadedImageInput,
  generateImagesWithGemini,
} from "@/server/services/gemini.service";
import {
  createSessionForUser,
  deriveSessionTitle,
  ensureSessionForUser,
} from "@/server/services/session.service";

export type GenerateNanoBananaPayload = {
  sessionId?: string;
  prompt?: string | null;
  modelAlias: string;
  aspectLabel: string;
  frameSizeLabel: string;
  resolutionLabel: string;
  contextEnabled?: boolean;
  contextText?: string | null;
  elements?: string[];
  referenceFiles?: UploadedImageInput[];
  referenceAssetUrls?: string[];
};

function toDataUrl(mimeType: string, data: string) {
  if (data.startsWith("http://") || data.startsWith("https://") || data.startsWith("data:")) {
    return data;
  }
  return `data:${mimeType};base64,${data}`;
}

function normalizeList(values?: string[]) {
  if (!values?.length) {
    return [];
  }

  const unique = new Set<string>();
  values.forEach((value) => {
    const trimmed = value.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  });
  return Array.from(unique);
}

function buildNanoBananaPrompt(
  prompt: string,
  payload: GenerateNanoBananaPayload,
  elements: string[]
) {
  const referenceCount =
    (payload.referenceFiles?.length ?? 0) + (payload.referenceAssetUrls?.length ?? 0);
  const sections = [prompt];

  if (payload.contextEnabled && payload.contextText?.trim()) {
    sections.push(`Project context:\n${payload.contextText.trim()}`);
  }

  if (elements.length > 0) {
    sections.push(`Important elements to include or preserve: ${elements.join(", ")}`);
  }

  if (referenceCount > 0) {
    sections.push(
      "Reference images are attached. Preserve their key subjects, composition cues, and styling when useful."
    );
  }

  return sections.join("\n\n");
}

export async function generateNanoBananaForSession(
  userId: string,
  payload: GenerateNanoBananaPayload
) {
  const elements = normalizeList(payload.elements);
  const trimmedPrompt = payload.prompt?.trim() ?? "";
  const hasContext = Boolean(payload.contextEnabled && payload.contextText?.trim());
  const referenceCount =
    (payload.referenceFiles?.length ?? 0) + (payload.referenceAssetUrls?.length ?? 0);

  if (!trimmedPrompt && !hasContext && elements.length === 0 && referenceCount === 0) {
    throw new Error("Add a prompt, reference image, context, or element before generating.");
  }

  const persistedPrompt =
    trimmedPrompt ||
    "Edit the provided reference images with polished composition, strong detail, and premium visual quality.";

  let sessionId = payload.sessionId;
  let nextSessionTitle: string | null = null;

  if (sessionId) {
    const existing = await ensureSessionForUser(userId, sessionId);
    if (!existing) {
      throw new Error("Session not found.");
    }

    if (existing.title === "New Session") {
      nextSessionTitle = deriveSessionTitle(persistedPrompt);
    }
  } else {
    const createdSession = await createSessionForUser(userId, deriveSessionTitle(persistedPrompt));
    sessionId = createdSession.id;
  }

  if (!sessionId) {
    throw new Error("Session could not be resolved.");
  }

  const generationResult = await generateImagesWithGemini({
    prompt: buildNanoBananaPrompt(persistedPrompt, payload, elements),
    modelAlias: payload.modelAlias,
    aspectLabel: payload.aspectLabel,
    frameSizeLabel: payload.frameSizeLabel,
    resolutionLabel: payload.resolutionLabel,
    referenceFiles: payload.referenceFiles,
    referenceAssetUrls: payload.referenceAssetUrls,
  });

  const persisted = await createGenerationRecord({
    sessionId,
    prompt: persistedPrompt,
    modelAlias: payload.modelAlias,
    aspectLabel: payload.aspectLabel,
    frameSizeLabel: payload.frameSizeLabel,
    resolutionLabel: payload.resolutionLabel,
    imagePromptName:
      referenceCount > 0
        ? `${referenceCount} reference image${referenceCount === 1 ? "" : "s"}`
        : null,
    styleTransferName: hasContext
      ? "Context enabled"
      : elements.length > 0
        ? `${elements.length} element${elements.length === 1 ? "" : "s"}`
        : null,
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
