import { NextRequest } from "next/server";
import {
  handleCreateSessionRoute,
  handleListSessionsRoute,
} from "@/server/routes/session.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handleListSessionsRoute();
}

export async function POST(request: NextRequest) {
  return handleCreateSessionRoute(request);
}
