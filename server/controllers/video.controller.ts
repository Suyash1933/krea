import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { generateVideoForSession } from "@/server/services/video.service";

const nullableTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const generateVideoSchema = z.object({
  sessionId: nullableTrimmedString,
  prompt: z.string().trim().min(1),
  modelAlias: z.string().trim().min(1),
  resolutionLabel: z.string().trim().min(1),
  durationLabel: z.string().trim().min(1),
  startFrameMode: z.string().trim().optional(),
});

export async function generateVideoController(request: NextRequest) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = generateVideoSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid payload.",
        issues: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    const result = await generateVideoForSession(user.dbUserId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Video generation failed due to an unknown error.";

    if (message === "Session not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
