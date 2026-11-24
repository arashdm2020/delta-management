import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
export function audit(
  action: string,
  actorId: string | null,
  targetId?: string,
  details: Prisma.InputJsonValue = {},
  tx: Prisma.TransactionClient = db,
) {
  return tx.auditLog.create({ data: { action, actorId, targetId, details } });
}
