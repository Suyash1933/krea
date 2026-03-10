import { handleListAssetsRoute } from "@/server/routes/asset.route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handleListAssetsRoute();
}
