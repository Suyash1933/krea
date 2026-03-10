import { NextRequest } from "next/server";
import { generateEditController } from "@/server/controllers/edit.controller";

export async function handleGenerateEditRoute(request: NextRequest) {
  return generateEditController(request);
}
