import {
  handleDeleteSessionRoute,
  handleGetSessionHistoryRoute,
} from "@/server/routes/session.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  return handleGetSessionHistoryRoute(sessionId);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  return handleDeleteSessionRoute(sessionId);
}
