import { NextRequest } from "next/server";
import { generateVideoController } from "@/server/controllers/video.controller";

export async function handleGenerateVideoRoute(request: NextRequest) {
  return generateVideoController(request);
}
