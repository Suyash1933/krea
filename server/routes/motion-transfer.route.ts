import { NextRequest } from "next/server";
import { generateMotionTransferController } from "@/server/controllers/motion-transfer.controller";

export async function handleGenerateMotionTransferRoute(request: NextRequest) {
  return generateMotionTransferController(request);
}
