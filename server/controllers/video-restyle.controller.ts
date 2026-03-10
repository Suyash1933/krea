import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { generateVideoRestyleForSession } from "@/server/services/video-restyle.service";

const nullableTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const uploadedBinarySchema = z.object({
  name: z.string().trim().min(1).max(300),
  mimeType: z.string().trim().min(3).max(120),
  data: z.string().trim().min(8),
});

const generateVideoRestyleSchema = z.object({
  sessionId: nullableTrimmedString,
  modelAlias: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  styleLabel: z.string().trim().min(1),
  videoSource: z.enum(["upload-video", "asset-video"]),
  videoName: nullableTrimmedString,
  videoFile: z.preprocess(
    (value) => (value === null ? undefined : value),
    uploadedBinarySchema.optional()
  ),
  videoAssetUrl: nullableTrimmedString,
  videoPreviewImageUrl: nullableTrimmedString,
});

export async function generateVideoRestyleController(request: NextRequest) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = generateVideoRestyleSchema.safeParse(body);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "body";
        return `${path}: ${issue.message}`;
      })
      .join(" | ");

    return NextResponse.json(
      {
        error: "Invalid payload.",
        details,
        issues: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    const result = await generateVideoRestyleForSession(user.dbUserId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Video restyle generation failed due to an unknown error.";

    if (message === "Session not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
