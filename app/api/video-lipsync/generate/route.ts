import { NextRequest } from "next/server";
import { handleGenerateVideoLipSyncRoute } from "@/server/routes/video-lipsync.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleGenerateVideoLipSyncRoute(request);
}
