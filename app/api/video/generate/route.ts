import { NextRequest } from "next/server";
import { handleGenerateVideoRoute } from "@/server/routes/video.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleGenerateVideoRoute(request);
}
