import {
  generateImageForSession,
  type GenerateImagePayload,
} from "@/server/services/generation.service";
import { type UploadedImageInput } from "@/server/services/gemini.service";

export type EnhanceImagePayload = {
  sessionId?: string;
  prompt?: string;
  modelAlias: string;
  resolutionLabel: string;
  aspectLabel?: string;
  frameSizeLabel?: string;
  sourceImageFile?: UploadedImageInput | null;
  sourceImageAssetUrl?: string | null;
};

const RESOLUTION_TO_FRAME_SIZE: Record<string, string> = {
  "1K": "1024:1024",
  "1.2K": "1280:1280",
  "1.5K": "1536:1536",
  "2K": "2048:2048",
  "4K": "3072:3072",
  "8K": "4096:4096",
};

function resolveFrameSizeLabel(resolutionLabel: string) {
  return RESOLUTION_TO_FRAME_SIZE[resolutionLabel] ?? "1024:1024";
}

function buildEnhancerPrompt(prompt?: string) {
  const trimmedPrompt = prompt?.trim() ?? "";
  const baseInstruction =
    "Enhance and upscale the provided image while preserving composition, identity, and subject details. Improve clarity, texture, dynamic range, and fine details without adding artifacts.";

  if (!trimmedPrompt) {
    return baseInstruction;
  }

  return `${baseInstruction}\nAdditional instruction: ${trimmedPrompt}`;
}

export async function enhanceImageForSession(userId: string, payload: EnhanceImagePayload) {
  if (!payload.sourceImageFile && !payload.sourceImageAssetUrl) {
    throw new Error("Source image is required.");
  }

  const imagePayload: GenerateImagePayload = {
    sessionId: payload.sessionId,
    prompt: buildEnhancerPrompt(payload.prompt),
    modelAlias: payload.modelAlias,
    aspectLabel: payload.aspectLabel ?? "1:1",
    frameSizeLabel: payload.frameSizeLabel ?? resolveFrameSizeLabel(payload.resolutionLabel),
    resolutionLabel: payload.resolutionLabel,
    styleTransferFile: payload.sourceImageFile ?? undefined,
    styleTransferAssetUrl: payload.sourceImageAssetUrl ?? undefined,
  };

  return generateImageForSession(userId, imagePayload);
}
