import { NextRequest } from "next/server";
import { handleGenerateEnhancerRoute } from "@/server/routes/enhancer.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleGenerateEnhancerRoute(request);
}
