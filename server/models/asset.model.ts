import { prisma } from "@/lib/prisma";

export async function listGeneratedAssetsByUser(userId: string) {
  const [imageRows, videoRows] = await Promise.all([
    prisma.generatedImage.findMany({
      where: {
        session: {
          userId,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        mimeType: true,
        imageData: true,
        createdAt: true,
        session: {
          select: {
            id: true,
            title: true,
          },
        },
        generation: {
          select: {
            id: true,
            prompt: true,
            modelAlias: true,
            aspectLabel: true,
            frameSizeLabel: true,
            resolutionLabel: true,
          },
        },
      },
    }),
    prisma.generatedVideo.findMany({
      where: {
        session: {
          userId,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        mimeType: true,
        videoUrl: true,
        previewImageUrl: true,
        createdAt: true,
        session: {
          select: {
            id: true,
            title: true,
          },
        },
        generation: {
          select: {
            id: true,
            prompt: true,
            modelAlias: true,
            resolutionLabel: true,
            durationLabel: true,
          },
        },
      },
    }),
  ]);

  const imageAssets = imageRows.map((row) => ({
    kind: "image" as const,
    ...row,
  }));

  const videoAssets = videoRows.map((row) => ({
    kind: "video" as const,
    ...row,
  }));

  return [...imageAssets, ...videoAssets].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}
