import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { generateImageForSession } from "@/server/services/generation.service";
import { describeRuntimeError } from "@/server/utils/runtime-error";

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

const generateSchema = z.object({
  sessionId: nullableTrimmedString,
  prompt: z.string().trim().min(1),
  modelAlias: z.string().trim().min(1),
  aspectLabel: z.string().trim().min(1),
  frameSizeLabel: z.string().trim().min(1),
  resolutionLabel: z.string().trim().min(1),
  imagePromptFile: z.preprocess(
    (value) => (value === null ? undefined : value),
    uploadedImageSchema.optional()
  ),
  styleTransferFile: z.preprocess(
    (value) => (value === null ? undefined : value),
    uploadedImageSchema.optional()
  ),
  imagePromptAssetUrl: nullableTrimmedString,
  styleTransferAssetUrl: nullableTrimmedString,
});

export async function generateImageController(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = generateSchema.safeParse(body);

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
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const generated = await generateImageForSession(user.dbUserId, parsed.data);

    return NextResponse.json(generated, { status: 201 });
  } catch (error) {
    console.error("[generate.controller] Image generation failed.", error);
    const runtimeError = describeRuntimeError(error);

    return NextResponse.json(
      {
        error: runtimeError.error,
        ...(runtimeError.details ? { details: runtimeError.details } : {}),
      },
      { status: runtimeError.status }
    );
  }
}
