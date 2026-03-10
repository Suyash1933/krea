import {
  createSessionRecord,
  deleteSessionRecord,
  getSessionHistoryRecord,
  getSessionOwnedByUser,
  listSessionRecords,
} from "@/server/models/session.model";

export type SessionListItemDto = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  lastMessage: string | null;
  previewImage: string | null;
};

export type SessionMessageDto = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  metadata: unknown;
  createdAt: string;
};

export type SessionGenerationImageDto = {
  id: string;
  dataUrl: string;
  mimeType: string;
  createdAt: string;
};

export type SessionGenerationDto = {
  id: string;
  prompt: string;
  modelAlias: string;
  aspectLabel: string;
  frameSizeLabel: string;
  resolutionLabel: string;
  imagePromptName: string | null;
  styleTransferName: string | null;
  createdAt: string;
  images: SessionGenerationImageDto[];
};

export type SessionGenerationVideoDto = {
  id: string;
  videoUrl: string;
  previewImageUrl: string | null;
  mimeType: string;
  createdAt: string;
};

export type SessionVideoGenerationDto = {
  id: string;
  prompt: string;
  modelAlias: string;
  resolutionLabel: string;
  durationLabel: string;
  startFrameMode: string | null;
  createdAt: string;
  videos: SessionGenerationVideoDto[];
};

export type SessionHistoryDto = {
  session: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  messages: SessionMessageDto[];
  generations: SessionGenerationDto[];
  videoGenerations: SessionVideoGenerationDto[];
};

function toDataUrl(mimeType: string, imageData: string) {
  if (
    imageData.startsWith("http://") ||
    imageData.startsWith("https://") ||
    imageData.startsWith("data:")
  ) {
    return imageData;
  }
  return `data:${mimeType};base64,${imageData}`;
}

export const DRAFT_SESSION_TITLE = "New Session";
const SESSION_TITLE_MAX_LENGTH = 60;

export function normalizeSessionTitle(title?: string | null) {
  const cleaned = (title ?? "")
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  if (cleaned.length <= SESSION_TITLE_MAX_LENGTH) {
    return cleaned;
  }

  return `${cleaned.slice(0, SESSION_TITLE_MAX_LENGTH).trimEnd()}...`;
}

export function deriveSessionTitle(prompt: string) {
  const clean = normalizeSessionTitle(prompt);
  if (!clean) {
    return DRAFT_SESSION_TITLE;
  }
  return clean;
}

export async function listSessionsForUser(userId: string): Promise<SessionListItemDto[]> {
  const sessions = await listSessionRecords(userId);

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
    lastMessage: session.messages[0]?.content ?? null,
    previewImage:
      session.images[0]
        ? toDataUrl(session.images[0].mimeType, session.images[0].imageData)
        : session.videos[0]?.previewImageUrl ?? null,
  }));
}

export async function createSessionForUser(userId: string, title?: string) {
  const session = await createSessionRecord(
    userId,
    normalizeSessionTitle(title) || DRAFT_SESSION_TITLE
  );

  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export async function getSessionHistoryForUser(userId: string, sessionId: string) {
  const session = await getSessionHistoryRecord(userId, sessionId);

  if (!session) {
    return null;
  }

  const payload: SessionHistoryDto = {
    session: {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    },
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      createdAt: message.createdAt.toISOString(),
    })),
    generations: session.generations.map((generation) => ({
      id: generation.id,
      prompt: generation.prompt,
      modelAlias: generation.modelAlias,
      aspectLabel: generation.aspectLabel,
      frameSizeLabel: generation.frameSizeLabel,
      resolutionLabel: generation.resolutionLabel,
      imagePromptName: generation.imagePromptName,
      styleTransferName: generation.styleTransferName,
      createdAt: generation.createdAt.toISOString(),
      images: generation.images.map((image) => ({
        id: image.id,
        dataUrl: toDataUrl(image.mimeType, image.imageData),
        mimeType: image.mimeType,
        createdAt: image.createdAt.toISOString(),
      })),
    })),
    videoGenerations: session.videoGenerations.map((generation) => ({
      id: generation.id,
      prompt: generation.prompt,
      modelAlias: generation.modelAlias,
      resolutionLabel: generation.resolutionLabel,
      durationLabel: generation.durationLabel,
      startFrameMode: generation.startFrameMode,
      createdAt: generation.createdAt.toISOString(),
      videos: generation.videos.map((video) => ({
        id: video.id,
        videoUrl: video.videoUrl,
        previewImageUrl: video.previewImageUrl ?? null,
        mimeType: video.mimeType,
        createdAt: video.createdAt.toISOString(),
      })),
    })),
  };

  return payload;
}

export async function ensureSessionForUser(userId: string, sessionId: string) {
  return getSessionOwnedByUser(userId, sessionId);
}

export async function deleteSessionForUser(userId: string, sessionId: string) {
  return deleteSessionRecord(userId, sessionId);
}
