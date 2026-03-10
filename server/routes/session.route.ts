import { NextRequest } from "next/server";
import {
  createSessionController,
  deleteSessionController,
  getSessionHistoryController,
  listSessionsController,
} from "@/server/controllers/session.controller";

export async function handleListSessionsRoute() {
  return listSessionsController();
}

export async function handleCreateSessionRoute(request: NextRequest) {
  return createSessionController(request);
}

export async function handleGetSessionHistoryRoute(sessionId: string) {
  return getSessionHistoryController(sessionId);
}

export async function handleDeleteSessionRoute(sessionId: string) {
  return deleteSessionController(sessionId);
}
