import { randomUUID } from "node:crypto";
import { createVideoGenerationRecord } from "@/server/models/video.model";
import { generateTextWithGemini } from "@/server/services/gemini.service";
import {
  createSessionForUser,
  deriveSessionTitle,
  ensureSessionForUser,
} from "@/server/services/session.service";

export type UploadedVideoRestylePayload = {
  name: string;
  mimeType: string;
  data: string;
};

export type GenerateVideoRestylePayload = {
  sessionId?: string;
  modelAlias: string;
  prompt: string;
  styleLabel: string;
  videoSource: "upload-video" | "asset-video";
  videoName?: string | null;
  videoFile?: UploadedVideoRestylePayload;
  videoAssetUrl?: string | null;
  videoPreviewImageUrl?: string | null;
};

type GeneratedVideoRestyleVideo = {
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
  return `https://picsum.photos/seed/video-restyle-${seed}/960/540`;
};

const buildBasePrompt = (payload: GenerateVideoRestylePayload) =>
  `${payload.prompt.trim()} Apply a ${payload.styleLabel.trim()} visual restyle while preserving the original subject, scene continuity, and camera motion.`;

const buildGeminiRestylePrompt = (payload: GenerateVideoRestylePayload) =>
  [
    "Rewrite this request as a concise production-ready video restyle instruction.",
    "Return only the rewritten instruction.",
    "Preserve the subject identity, action continuity, and framing.",
    `Model label: ${payload.modelAlias}`,
    `Chosen style: ${payload.styleLabel}`,
    payload.videoName?.trim() ? `Source video name: ${payload.videoName.trim()}` : null,
    `User request: ${payload.prompt.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");

const normalizePrompt = (value: string) => value.replace(/\s+/g, " ").trim();

const buildAssistantText = (payload: GenerateVideoRestylePayload) =>
  `Generated a video restyle preview using Gemini-guided ${payload.styleLabel} direction.`;

const buildMetadataLabel = (payload: GenerateVideoRestylePayload) =>
  `video-restyle|source:${payload.videoSource}|style:${payload.styleLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;

async function buildRestylePrompt(payload: GenerateVideoRestylePayload) {
  const fallbackPrompt = buildBasePrompt(payload);
  const geminiPrompt = await generateTextWithGemini(
    buildGeminiRestylePrompt(payload),
    undefined,
    fallbackPrompt
  );

  return normalizePrompt(geminiPrompt || fallbackPrompt);
}

async function synthesizeVideoRestyleVideo(
  payload: GenerateVideoRestylePayload,
  prompt: string
): Promise<GeneratedVideoRestyleVideo[]> {
  const generationId = randomUUID();
  const seed = hashText(
    `${payload.modelAlias}-${payload.styleLabel}-${prompt}-${payload.videoName ?? payload.videoSource}`
  );
  const videoUrl = VIDEO_LIBRARY[seed % VIDEO_LIBRARY.length];
  const previewImage =
    payload.videoPreviewImageUrl?.trim() || buildFallbackPreviewImage(prompt, generationId);

  return [
    {
      id: generationId,
      videoUrl,
      previewImage,
    },
  ];
}

export async function generateVideoRestyleForSession(
  userId: string,
  payload: GenerateVideoRestylePayload
) {
  if (!payload.prompt.trim()) {
    throw new Error("Describe the restyle before generating.");
  }

  if (!payload.videoFile && !payload.videoAssetUrl?.trim()) {
    throw new Error("Add a video before generating.");
  }

  const prompt = await buildRestylePrompt(payload);
  const sessionTitle = deriveSessionTitle(`${payload.styleLabel} ${payload.prompt}`);

  let sessionId = payload.sessionId;
  let nextSessionTitle: string | null = null;

  if (sessionId) {
    const existing = await ensureSessionForUser(userId, sessionId);
    if (!existing) {
      throw new Error("Session not found.");
    }

    if (existing.title === "New Session") {
      nextSessionTitle = sessionTitle;
    }
  } else {
    const createdSession = await createSessionForUser(userId, sessionTitle);
    sessionId = createdSession.id;
  }

  if (!sessionId) {
    throw new Error("Session could not be resolved.");
  }

  const generatedVideos = await synthesizeVideoRestyleVideo(payload, prompt);

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
