import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { generateThreeDObjectsForSession } from "@/server/services/three-d-objects.service";

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

const generateThreeDSchema = z.object({
  sessionId: nullableTrimmedString,
  prompt: nullableTrimmedString,
  modelAlias: z.string().trim().min(1),
  storedModelAlias: z.string().trim().min(1),
  sourceMode: z.enum(["image-to-3d", "text-to-3d"]),
  meshOnly: z.boolean().optional().default(false),
  sourceImageName: nullableTrimmedString,
  sourceImageFile: z.preprocess(
    (value) => (value === null ? undefined : value),
    uploadedImageSchema.optional()
  ),
  sourceImageAssetUrl: nullableTrimmedString,
});

export async function generateThreeDObjectsController(request: NextRequest) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = generateThreeDSchema.safeParse(body);

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
    const generated = await generateThreeDObjectsForSession(user.dbUserId, parsed.data);
    return NextResponse.json(generated, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "3D Objects generation failed due to an unknown error.";

    if (message === "Session not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
