import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import {
  createSessionForUser,
  deleteSessionForUser,
  getSessionHistoryForUser,
  listSessionsForUser,
} from "@/server/services/session.service";

const createSessionSchema = z.object({
  title: z.string().trim().max(120).optional(),
});

export async function listSessionsController() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await listSessionsForUser(user.dbUserId);

  return NextResponse.json({ sessions });
}

export async function createSessionController(request: NextRequest) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createSessionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid payload.",
        issues: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const session = await createSessionForUser(user.dbUserId, parsed.data.title);

  return NextResponse.json({ session }, { status: 201 });
}

export async function getSessionHistoryController(sessionId: string) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const history = await getSessionHistoryForUser(user.dbUserId, sessionId);

  if (!history) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json(history);
}

export async function deleteSessionController(sessionId: string) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deletedSessionId = await deleteSessionForUser(user.dbUserId, sessionId);

  if (!deletedSessionId) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, sessionId: deletedSessionId });
}
