import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { generateNanoBananaForSession } from "@/server/services/nano-banana.service";

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

const generateNanoBananaSchema = z.object({
  sessionId: nullableTrimmedString,
  prompt: nullableTrimmedString,
  modelAlias: z.string().trim().min(1),
  aspectLabel: z.string().trim().min(1),
  frameSizeLabel: z.string().trim().min(1),
  resolutionLabel: z.string().trim().min(1),
  contextEnabled: z.boolean().optional(),
  contextText: nullableTrimmedString,
  elements: z.preprocess(
    (value) => (Array.isArray(value) ? value : undefined),
    z.array(z.string().trim().min(1).max(160)).max(24).optional()
  ),
  referenceFiles: z.preprocess(
    (value) => (Array.isArray(value) ? value : undefined),
    z.array(uploadedImageSchema).max(8).optional()
  ),
  referenceAssetUrls: z.preprocess(
    (value) => (Array.isArray(value) ? value : undefined),
    z.array(z.string().trim().min(1)).max(8).optional()
  ),
});

export async function generateNanoBananaController(request: NextRequest) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = generateNanoBananaSchema.safeParse(body);

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
    const generated = await generateNanoBananaForSession(user.dbUserId, parsed.data);
    return NextResponse.json(generated, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nano Banana generation failed due to an unknown error.";

    const isQuotaError =
      /429\s+Too Many Requests/i.test(message) ||
      /Quota exceeded/i.test(message) ||
      /rate[-\s]?limits?/i.test(message);

    if (isQuotaError) {
      return NextResponse.json(
        {
          error:
            "Gemini quota exceeded for this API key/project. Enable billing or use a key/project with active quota.",
        },
        { status: 429 }
      );
    }

    if (message === "Session not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
