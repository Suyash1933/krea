import { randomUUID } from "node:crypto";
import { createVideoGenerationRecord } from "@/server/models/video.model";
import {
  createSessionForUser,
  deriveSessionTitle,
  ensureSessionForUser,
} from "@/server/services/session.service";

export type UploadedLipSyncPayload = {
  name: string;
  mimeType: string;
  data: string;
};

export type GenerateLipSyncPayload = {
  sessionId?: string;
  modelAlias: string;
  faceSource: "upload-image" | "asset-image";
  faceName?: string | null;
  faceImageFile?: UploadedLipSyncPayload;
  faceAssetUrl?: string | null;
  facePreviewUrl?: string | null;
  speechMode: "generate" | "upload" | "record";
  speechPrompt?: string | null;
  speechAudioFile?: UploadedLipSyncPayload;
};

type GeneratedLipSyncVideo = {
  id: string;
  videoUrl: string;
  previewImage: string;
};

const VIDEO_LIBRARY = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMobster.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerSubways.mp4",
];

const DEFAULT_DURATION_LABEL = "5s";
const DEFAULT_RESOLUTION_LABEL = "720p";

const hashText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const buildFallbackPreviewImage = (prompt: string, generationId: string) => {
  const seed = hashText(`${prompt}-${generationId}`) % 1_000_000_000;
  return `https://picsum.photos/seed/lipsync-${seed}/960/540`;
};

const buildPromptSummary = (payload: GenerateLipSyncPayload) => {
  const trimmedSpeechPrompt = payload.speechPrompt?.trim();

  if (payload.speechMode === "generate" && trimmedSpeechPrompt) {
    return trimmedSpeechPrompt;
  }

  if (payload.speechMode === "upload") {
    return `Lip sync the selected face with uploaded audio${
      payload.faceName?.trim() ? ` for ${payload.faceName.trim()}` : ""
    }.`;
  }

  return `Lip sync the selected face with recorded speech${
    payload.faceName?.trim() ? ` for ${payload.faceName.trim()}` : ""
  }.`;
};

const buildAssistantText = (payload: GenerateLipSyncPayload) => {
  if (payload.speechMode === "generate") {
    return "Generated a lip sync video using generated speech.";
  }

  if (payload.speechMode === "upload") {
    return "Generated a lip sync video from uploaded audio.";
  }

  return "Generated a lip sync video from recorded audio.";
};

const buildMetadataLabel = (payload: GenerateLipSyncPayload) =>
  `lipsync|face:${payload.faceSource}|speech:${payload.speechMode}`;

async function synthesizeLipSyncVideo(
  payload: GenerateLipSyncPayload,
  prompt: string
): Promise<GeneratedLipSyncVideo[]> {
  const generationId = randomUUID();
  const speechLabel =
    payload.speechMode === "generate"
      ? payload.speechPrompt?.trim() ?? ""
      : payload.speechAudioFile?.name ?? payload.speechMode;
  const seed = hashText(`${payload.modelAlias}-${prompt}-${speechLabel}`);
  const selectedVideoUrl = VIDEO_LIBRARY[seed % VIDEO_LIBRARY.length];
  const previewImage =
    payload.facePreviewUrl?.trim() ||
    payload.faceAssetUrl?.trim() ||
    buildFallbackPreviewImage(prompt, generationId);

  return [
    {
      id: generationId,
      videoUrl: selectedVideoUrl,
      previewImage,
    },
  ];
}

export async function generateLipSyncVideoForSession(
  userId: string,
  payload: GenerateLipSyncPayload
) {
  const prompt = buildPromptSummary(payload).trim();

  if (!payload.faceImageFile && !payload.faceAssetUrl?.trim()) {
    throw new Error("Add a face image before generating.");
  }

  if (payload.speechMode === "generate" && !payload.speechPrompt?.trim()) {
    throw new Error("Write speech before generating.");
  }

  if (payload.speechMode !== "generate" && !payload.speechAudioFile) {
    throw new Error("Add speech audio before generating.");
  }

  let sessionId = payload.sessionId;
  let nextSessionTitle: string | null = null;

  if (sessionId) {
    const existing = await ensureSessionForUser(userId, sessionId);
    if (!existing) {
      throw new Error("Session not found.");
    }

    if (existing.title === "New Session") {
      nextSessionTitle = deriveSessionTitle(prompt);
    }
  } else {
    const createdSession = await createSessionForUser(userId, deriveSessionTitle(prompt));
    sessionId = createdSession.id;
  }

  if (!sessionId) {
    throw new Error("Session could not be resolved.");
  }

  const generatedVideos = await synthesizeLipSyncVideo(payload, prompt);

  const persisted = await createVideoGenerationRecord({
    sessionId,
    prompt,
    modelAlias: payload.modelAlias,
    resolutionLabel: DEFAULT_RESOLUTION_LABEL,
    durationLabel: DEFAULT_DURATION_LABEL,
    startFrameMode: buildMetadataLabel(payload),
    assistantText: buildAssistantText(payload),
    nextSessionTitle,
    generatedVideos: generatedVideos.map((video) => ({
      mimeType: "video/mp4",
      videoUrl: video.videoUrl,
      previewImageUrl: video.previewImage,
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
      resolutionLabel: persisted.generation.resolutionLabel,
      durationLabel: persisted.generation.durationLabel,
      startFrameMode: persisted.generation.startFrameMode,
      createdAt: persisted.generation.createdAt.toISOString(),
      videos: persisted.generation.videos.map((video, index) => ({
        id: video.id,
        videoUrl: video.videoUrl,
        previewImage:
          video.previewImageUrl ||
          buildFallbackPreviewImage(prompt, `${persisted.generation.id}-${index}`),
      })),
    },
  };
}
