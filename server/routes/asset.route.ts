import { listAssetsController } from "@/server/controllers/asset.controller";

export async function handleListAssetsRoute() {
  return listAssetsController();
}
