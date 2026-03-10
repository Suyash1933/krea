import { NextRequest } from "next/server";
import { generateNanoBananaController } from "@/server/controllers/nano-banana.controller";

export async function handleGenerateNanoBananaRoute(request: NextRequest) {
  return generateNanoBananaController(request);
}
