import { randomUUID } from "node:crypto";
import { createVideoGenerationRecord } from "@/server/models/video.model";
import {
  createSessionForUser,
  deriveSessionTitle,
  ensureSessionForUser,
} from "@/server/services/session.service";

export type UploadedMotionTransferPayload = {
  name: string;
  mimeType: string;
  data: string;
};

export type GenerateMotionTransferPayload = {
  sessionId?: string;
  modelAlias: string;
  characterSource: "upload-image" | "asset-image";
  characterName?: string | null;
  characterImageFile?: UploadedMotionTransferPayload;
  characterAssetUrl?: string | null;
  characterPreviewUrl?: string | null;
  motionMode: "upload" | "record";
  motionVideoFile?: UploadedMotionTransferPayload;
  orientationMode: "image" | "video";
};

type GeneratedMotionTransferVideo = {
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
  return `https://picsum.photos/seed/motion-transfer-${seed}/960/540`;
};

const buildPromptSummary = (payload: GenerateMotionTransferPayload) => {
  const characterLabel = payload.characterName?.trim() || "selected character";
  const motionLabel = payload.motionMode === "record" ? "recorded motion" : "uploaded motion";
  const orientationLabel =
    payload.orientationMode === "image"
      ? "Match initial pose of image."
      : "Match initial pose of video.";

  return `Transfer ${motionLabel} onto ${characterLabel}. ${orientationLabel}`;
};

const buildAssistantText = (payload: GenerateMotionTransferPayload) => {
  if (payload.motionMode === "record") {
    return `Generated a motion transfer clip from recorded video using ${payload.orientationMode} orientation.`;
  }

  return `Generated a motion transfer clip from uploaded video using ${payload.orientationMode} orientation.`;
};

const buildMetadataLabel = (payload: GenerateMotionTransferPayload) =>
  `motion-transfer|character:${payload.characterSource}|motion:${payload.motionMode}|orientation:${payload.orientationMode}`;

async function synthesizeMotionTransferVideo(
  payload: GenerateMotionTransferPayload,
  prompt: string
): Promise<GeneratedMotionTransferVideo[]> {
  const generationId = randomUUID();
  const seed = hashText(
    `${payload.modelAlias}-${prompt}-${payload.motionVideoFile?.name ?? payload.motionMode}-${payload.orientationMode}`
  );
  const videoUrl = VIDEO_LIBRARY[seed % VIDEO_LIBRARY.length];
  const previewImage =
    payload.characterPreviewUrl?.trim() ||
    payload.characterAssetUrl?.trim() ||
    buildFallbackPreviewImage(prompt, generationId);

  return [
    {
      id: generationId,
      videoUrl,
      previewImage,
    },
  ];
}

export async function generateMotionTransferForSession(
  userId: string,
  payload: GenerateMotionTransferPayload
) {
  const prompt = buildPromptSummary(payload).trim();

  if (!payload.characterImageFile && !payload.characterAssetUrl?.trim()) {
    throw new Error("Add a character before generating.");
  }

  if (!payload.motionVideoFile) {
    throw new Error("Add expression and motion before generating.");
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

  const generatedVideos = await synthesizeMotionTransferVideo(payload, prompt);

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
