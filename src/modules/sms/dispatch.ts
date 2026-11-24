import { db } from "@/lib/db";
import { hashToken } from "@/lib/security/core";
/** Bind an existing SMS delivery to a business event; not another delivery queue. */
export async function claimSmsDispatch(
  deliveryId: string,
  event: string,
  eventKey: string,
  userId: string,
) {
  const parts = eventKey.split(":");
  const businessKey =
    event === "meeting.reminder" ? parts.slice(0, 3).join(":") : eventKey;
  const key = hashToken(`sms-event:${event}:${businessKey}:${userId}`);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const duplicate = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "SmsDelivery" WHERE "dispatchKey"=${key} AND "deliveryId"<>${deliveryId}::uuid`;
    if (duplicate.length) throw new Error("EVENT_DUPLICATE");
    const changed =
      await tx.$executeRaw`UPDATE "SmsDelivery" SET "dispatchKey"=${key} WHERE "deliveryId"=${deliveryId}::uuid AND ("dispatchKey" IS NULL OR "dispatchKey"=${key})`;
    if (changed !== 1) throw new Error("EVENT_DUPLICATE");
  });
}
