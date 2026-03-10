import { NextRequest } from "next/server";
import { generateVideoLipSyncController } from "@/server/controllers/video-lipsync.controller";

export async function handleGenerateVideoLipSyncRoute(request: NextRequest) {
  return generateVideoLipSyncController(request);
}
