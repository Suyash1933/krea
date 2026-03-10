import { NextRequest } from "next/server";
import { generateThreeDObjectsController } from "@/server/controllers/three-d-objects.controller";

export async function handleGenerateThreeDObjectsRoute(request: NextRequest) {
  return generateThreeDObjectsController(request);
}
