import { NextRequest } from "next/server";
import { handleGenerateImageRoute } from "@/server/routes/generate.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleGenerateImageRoute(request);
}
