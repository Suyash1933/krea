import { NextRequest } from "next/server";
import { handleGenerateNanoBananaRoute } from "@/server/routes/nano-banana.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleGenerateNanoBananaRoute(request);
}
