import { NextRequest } from "next/server";
import { handleGenerateThreeDObjectsRoute } from "@/server/routes/three-d-objects.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleGenerateThreeDObjectsRoute(request);
}
