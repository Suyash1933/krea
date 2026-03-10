import { NextRequest } from "next/server";
import { generateVideoRestyleController } from "@/server/controllers/video-restyle.controller";

export async function handleGenerateVideoRestyleRoute(request: NextRequest) {
  return generateVideoRestyleController(request);
}
