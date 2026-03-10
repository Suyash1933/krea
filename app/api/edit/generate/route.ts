import { NextRequest } from "next/server";
import { handleGenerateEditRoute } from "@/server/routes/edit.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleGenerateEditRoute(request);
}
