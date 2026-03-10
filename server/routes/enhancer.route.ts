import { NextRequest } from "next/server";
import { generateEnhancerController } from "@/server/controllers/enhancer.controller";

export async function handleGenerateEnhancerRoute(request: NextRequest) {
  return generateEnhancerController(request);
}
