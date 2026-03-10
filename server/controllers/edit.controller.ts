import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { generateEditForSession } from "@/server/services/edit.service";

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

const generateEditSchema = z.object({
  sessionId: nullableTrimmedString,
  prompt: z.string().trim().min(1),
  modelAlias: z.string().trim().min(1),
  storedModelAlias: z.string().trim().min(1),
  aspectLabel: z.string().trim().min(1),
  frameSizeLabel: z.string().trim().min(1),
  resolutionLabel: z.string().trim().min(1),
  sourceImageMode: z.enum(["upload-image", "asset-image"]),
  sourceImageName: nullableTrimmedString,
  sourceImageFile: z.preprocess(
    (value) => (value === null ? undefined : value),
    uploadedImageSchema.optional()
  ),
  sourceImageAssetUrl: nullableTrimmedString,
});

export async function generateEditController(request: NextRequest) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = generateEditSchema.safeParse(body);

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
    const generated = await generateEditForSession(user.dbUserId, parsed.data);
    return NextResponse.json(generated, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Edit generation failed due to an unknown error.";

    if (message === "Session not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
