import { NextRequest } from "next/server";
import { generateImageController } from "@/server/controllers/generate.controller";

export async function handleGenerateImageRoute(request: NextRequest) {
  return generateImageController(request);
}
