import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { listAssetsForUser } from "@/server/services/asset.service";

export async function listAssetsController() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assets = await listAssetsForUser(user.dbUserId);

  return NextResponse.json({ assets });
}
