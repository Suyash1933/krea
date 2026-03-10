import { listGeneratedAssetsByUser } from "@/server/models/asset.model";

type AssetBaseDto = {
  id: string;
  mimeType: string;
  createdAt: string;
  sessionId: string;
  sessionTitle: string;
  generationId: string;
  prompt: string;
  modelAlias: string;
};

export type ImageAssetItemDto = AssetBaseDto & {
  imageUrl: string;
  aspectLabel: string;
  frameSizeLabel: string;
  resolutionLabel: string;
  toolType: "Image";
};

export type VideoAssetItemDto = AssetBaseDto & {
  videoUrl: string;
  previewImageUrl: string | null;
  durationLabel: string;
  resolutionLabel: string;
  frameSizeLabel: string;
  toolType: "Video";
};

export type AssetItemDto = ImageAssetItemDto | VideoAssetItemDto;

const toDataUrl = (mimeType: string, imageData: string) => {
  if (
    imageData.startsWith("http://") ||
    imageData.startsWith("https://") ||
    imageData.startsWith("data:")
  ) {
    return imageData;
  }

  return `data:${mimeType};base64,${imageData}`;
};

export async function listAssetsForUser(userId: string): Promise<AssetItemDto[]> {
  const rows = await listGeneratedAssetsByUser(userId);

  return rows.map((row) => {
    if (row.kind === "image") {
      return {
        id: row.id,
        imageUrl: toDataUrl(row.mimeType, row.imageData),
        mimeType: row.mimeType,
        createdAt: row.createdAt.toISOString(),
        sessionId: row.session.id,
        sessionTitle: row.session.title,
        generationId: row.generation.id,
        prompt: row.generation.prompt,
        modelAlias: row.generation.modelAlias,
        aspectLabel: row.generation.aspectLabel,
        frameSizeLabel: row.generation.frameSizeLabel,
        resolutionLabel: row.generation.resolutionLabel,
        toolType: "Image" as const,
      };
    }

    return {
      id: row.id,
      mimeType: row.mimeType,
      createdAt: row.createdAt.toISOString(),
      sessionId: row.session.id,
      sessionTitle: row.session.title,
      generationId: row.generation.id,
      prompt: row.generation.prompt,
      modelAlias: row.generation.modelAlias,
      videoUrl: row.videoUrl,
      previewImageUrl: row.previewImageUrl,
      durationLabel: row.generation.durationLabel,
      resolutionLabel: row.generation.resolutionLabel,
      frameSizeLabel: "16:9",
      toolType: "Video" as const,
    };
  });
}
