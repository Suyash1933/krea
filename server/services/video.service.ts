import { randomUUID } from "node:crypto";
import { createVideoGenerationRecord } from "@/server/models/video.model";
import {
  createSessionForUser,
  deriveSessionTitle,
  ensureSessionForUser,
} from "@/server/services/session.service";

export type GenerateVideoPayload = {
  sessionId?: string;
  prompt: string;
  modelAlias: string;
  resolutionLabel: string;
  durationLabel: string;
  startFrameMode?: string;
};

type GeneratedVideoItem = {
  id: string;
  videoUrl: string;
  previewImage: string;
};

type RawVideoGenerationResult = {
  generation: {
    id: string;
    prompt: string;
    modelAlias: string;
    resolutionLabel: string;
    durationLabel: string;
    createdAt: string;
    videos: GeneratedVideoItem[];
  };
};

export type VideoGenerationResult = {
  session: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  userMessage: {
    id: string;
    role: "USER" | "ASSISTANT" | "SYSTEM";
    content: string;
    metadata: unknown;
    createdAt: string;
  };
  assistantMessage: {
    id: string;
    role: "USER" | "ASSISTANT" | "SYSTEM";
    content: string;
    metadata: unknown;
    createdAt: string;
  };
  generation: {
    id: string;
    prompt: string;
    modelAlias: string;
    resolutionLabel: string;
    durationLabel: string;
    startFrameMode: string | null;
    createdAt: string;
    videos: GeneratedVideoItem[];
  };
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

const hashText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickFromLibrary = (seed: number, count: number) => {
  const selected: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const sourceIndex = (seed + index) % VIDEO_LIBRARY.length;
    selected.push(VIDEO_LIBRARY[sourceIndex]);
  }

  return selected;
};

const buildPreviewImage = (prompt: string, generationId: string, index: number) => {
  const seed = hashText(`${prompt}-${generationId}-${index}`) % 1_000_000_000;
  return `https://picsum.photos/seed/video-${seed}/960/540`;
};

async function synthesizeVideos(payload: GenerateVideoPayload): Promise<RawVideoGenerationResult> {
  const prompt = payload.prompt.trim();
  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  const generationId = randomUUID();
  const seed = hashText(`${prompt}-${payload.modelAlias}-${payload.resolutionLabel}`);
  const selected = pickFromLibrary(seed, 4);

  return {
    generation: {
      id: generationId,
      prompt,
      modelAlias: payload.modelAlias,
      resolutionLabel: payload.resolutionLabel,
      durationLabel: payload.durationLabel,
      createdAt: new Date().toISOString(),
      videos: selected.map((videoUrl, index) => ({
        id: randomUUID(),
        videoUrl,
        previewImage: buildPreviewImage(prompt, generationId, index),
      })),
    },
  };
}

export async function generateVideoForSession(
  userId: string,
  payload: GenerateVideoPayload
): Promise<VideoGenerationResult> {
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

  const generated = await synthesizeVideos(payload);

  const persisted = await createVideoGenerationRecord({
    sessionId,
    prompt: trimmedPrompt,
    modelAlias: payload.modelAlias,
    resolutionLabel: payload.resolutionLabel,
    durationLabel: payload.durationLabel,
    startFrameMode: payload.startFrameMode ?? null,
    assistantText: `Generated ${generated.generation.videos.length} video variants.`,
    nextSessionTitle,
    generatedVideos: generated.generation.videos.map((video) => ({
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
          buildPreviewImage(trimmedPrompt, persisted.generation.id, index),
      })),
    },
  };
}
