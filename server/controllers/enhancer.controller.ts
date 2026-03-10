import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { enhanceImageForSession } from "@/server/services/enhancer.service";

const nullableTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const uploadedImageSchema = z.object({
  name: z.string().trim().min(1).max(300),
  mimeType: z.string().trim().min(3).max(120),
  data: z.string().trim().min(8),
});

const enhanceSchema = z.object({
  sessionId: nullableTrimmedString,
  prompt: nullableTrimmedString,
  modelAlias: z.string().trim().min(1).default("Krea Enhance"),
  resolutionLabel: z.string().trim().min(1).default("1K"),
  aspectLabel: nullableTrimmedString,
  frameSizeLabel: nullableTrimmedString,
  sourceImageFile: z
    .preprocess((value) => (value === null ? undefined : value), uploadedImageSchema.optional()),
  sourceImageAssetUrl: nullableTrimmedString,
});

export async function generateEnhancerController(request: NextRequest) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = enhanceSchema.safeParse(body);

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

  const payload = parsed.data;
  if (!payload.sourceImageFile && !payload.sourceImageAssetUrl) {
    return NextResponse.json(
      { error: "Source image is required. Upload one or select an asset." },
      { status: 400 }
    );
  }

  try {
    const enhanced = await enhanceImageForSession(user.dbUserId, payload);
    return NextResponse.json(enhanced, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enhancement failed.";

    if (message === "Session not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
