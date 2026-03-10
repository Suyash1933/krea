import { NextRequest } from "next/server";
import { handleGenerateMotionTransferRoute } from "@/server/routes/motion-transfer.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleGenerateMotionTransferRoute(request);
}
