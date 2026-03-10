import { NextRequest } from "next/server";
import { handleGenerateVideoRestyleRoute } from "@/server/routes/video-restyle.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleGenerateVideoRestyleRoute(request);
}
