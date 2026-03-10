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

export type GenerateThreeDObjectsPayload = {
  sessionId?: string;
  prompt?: string | null;
  modelAlias: string;
  storedModelAlias: string;
  sourceMode: "image-to-3d" | "text-to-3d";
  meshOnly: boolean;
  sourceImageName?: string | null;
  sourceImageFile?: UploadedImageInput | null;
  sourceImageAssetUrl?: string | null;
};

const DEFAULT_ASPECT_LABEL = "1:1";
const DEFAULT_FRAME_SIZE_LABEL = "1024:1024";
const DEFAULT_RESOLUTION_LABEL = "1K";

function toDataUrl(mimeType: string, data: string) {
  if (data.startsWith("http://") || data.startsWith("https://") || data.startsWith("data:")) {
    return data;
  }
  return `data:${mimeType};base64,${data}`;
}

const buildSourceSummary = (payload: GenerateThreeDObjectsPayload) => {
  if (payload.sourceMode === "text-to-3d") {
    return payload.prompt?.trim() || "3D object concept";
  }

  return payload.prompt?.trim() || `3D object from ${payload.sourceImageName?.trim() || "reference image"}`;
};

const buildFallbackThreeDPrompt = (payload: GenerateThreeDObjectsPayload) =>
  [
    "Create a polished 3D object concept render.",
    payload.sourceMode === "image-to-3d"
      ? "Use the provided source image as the main object reference."
      : "Use the text description as the primary source.",
    "Show premium studio lighting, clean topology cues, and realistic materials.",
    payload.meshOnly
      ? "Focus on neutral clay or wireframe-friendly mesh presentation with minimal textures."
      : "Include finished textured surfaces and material richness.",
    payload.prompt?.trim() ? `Object description: ${payload.prompt.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" ");

const buildGeminiThreeDInstruction = (payload: GenerateThreeDObjectsPayload) =>
  [
    "Rewrite this into a single high-quality 3D object generation instruction.",
    "Return only the rewritten instruction with no explanation.",
    "The result should feel like a premium product render or turntable-ready 3D object concept.",
    payload.sourceMode === "image-to-3d"
      ? "The source image will be provided separately and should guide the object's form."
      : "There is no source image; rely on the text description only.",
    payload.meshOnly
      ? "Prioritize clear geometry and mesh readability over heavy textures."
      : "Prioritize textured, production-ready material detail.",
    `Model label: ${payload.modelAlias}`,
    payload.sourceImageName?.trim() ? `Source image name: ${payload.sourceImageName.trim()}` : null,
    payload.prompt?.trim() ? `User request: ${payload.prompt.trim()}` : "User request: Generate a clean 3D object from the source image.",
  ]
    .filter(Boolean)
    .join("\n");

const buildModeLabel = (payload: GenerateThreeDObjectsPayload) =>
  `${payload.sourceMode === "image-to-3d" ? "Image to 3D" : "Text to 3D"}${payload.meshOnly ? " | Mesh only" : " | Textured"}`;

async function buildThreeDPrompt(payload: GenerateThreeDObjectsPayload) {
  const fallbackPrompt = buildFallbackThreeDPrompt(payload);
  const geminiPrompt = await generateTextWithGemini(
    buildGeminiThreeDInstruction(payload),
    undefined,
    fallbackPrompt
  );

  return geminiPrompt.replace(/\s+/g, " ").trim() || fallbackPrompt;
}

export async function generateThreeDObjectsForSession(
  userId: string,
  payload: GenerateThreeDObjectsPayload
) {
  const trimmedPrompt = payload.prompt?.trim() || "";

  if (payload.sourceMode === "image-to-3d" && !payload.sourceImageFile && !payload.sourceImageAssetUrl?.trim()) {
    throw new Error("Source image is required for Image to 3D.");
  }

  if (payload.sourceMode === "text-to-3d" && !trimmedPrompt) {
    throw new Error("Prompt is required for Text to 3D.");
  }

  let sessionId = payload.sessionId;
  let nextSessionTitle: string | null = null;
  const sessionLabel = buildSourceSummary(payload);

  if (sessionId) {
    const existing = await ensureSessionForUser(userId, sessionId);
    if (!existing) {
      throw new Error("Session not found.");
    }

    if (existing.title === "New Session") {
      nextSessionTitle = deriveSessionTitle(sessionLabel);
    }
  } else {
    const createdSession = await createSessionForUser(userId, deriveSessionTitle(sessionLabel));
    sessionId = createdSession.id;
  }

  if (!sessionId) {
    throw new Error("Session could not be resolved.");
  }

  const objectPrompt = await buildThreeDPrompt(payload);

  const geminiInput: GenerateImageInput = {
    prompt: objectPrompt,
    modelAlias: payload.modelAlias,
    aspectLabel: DEFAULT_ASPECT_LABEL,
    frameSizeLabel: DEFAULT_FRAME_SIZE_LABEL,
    resolutionLabel: DEFAULT_RESOLUTION_LABEL,
    imagePromptFile: payload.sourceImageFile,
    imagePromptAssetUrl: payload.sourceImageAssetUrl,
  };

  const generationResult = await generateImagesWithGemini(geminiInput);

  const persisted = await createGenerationRecord({
    sessionId,
    prompt: sessionLabel,
    modelAlias: payload.storedModelAlias,
    aspectLabel: DEFAULT_ASPECT_LABEL,
    frameSizeLabel: DEFAULT_FRAME_SIZE_LABEL,
    resolutionLabel: DEFAULT_RESOLUTION_LABEL,
    imagePromptName: payload.sourceImageName ?? null,
    styleTransferName: buildModeLabel(payload),
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
