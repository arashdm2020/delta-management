"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireApproved } from "@/modules/auth/session";
import { assertOrigin } from "@/modules/auth/http";
import { canManage, fail } from "@/lib/security/core";
import { lock, rateLimit } from "@/modules/notifications/common";
import { emitNotification } from "@/modules/notifications/service";

export async function sendInbox(form: FormData) {
  const actor = await requireApproved();
  await assertOrigin();
  const body = z.string().trim().min(1).max(4000).parse(form.get("body"));
  const requestId = z.uuid().parse(form.get("requestId"));
  const thread = form.get("thread");
  const kind = z
    .enum(["USER", "UNIT", "FLOOR", "ROLE", "ALL", "BOARD"])
    .parse(form.get("kind") || "BOARD");
  const target = String(form.get("target") || "").trim();
  await db.$transaction(
    async (tx) => {
      await lock(tx, "inbox:" + actor.id + ":" + requestId);
      await rateLimit(tx, actor.id, "inbox");
      let ids: string[];
      if (thread) {
        const root = await tx.inboxMessage.findFirst({
          where: {
            id: z.uuid().parse(thread),
            OR: [{ senderId: actor.id }, { recipientId: actor.id }],
          },
        });
        if (!root || root.threadId !== root.id) return fail("گفتگو یافت نشد.");
        const recipientId =
          root.senderId === actor.id ? root.recipientId : root.senderId;
        const recipient = await tx.user.findFirst({
          where: { id: recipientId, status: "APPROVED" },
        });
        ids = recipient ? [recipient.id] : [];
      } else {
        if (!canManage(actor) && kind !== "BOARD")
          return fail("ارسال گروهی فقط برای مدیریت مجاز است.");
        const roles =
          kind === "BOARD"
            ? (["BOARD_MEMBER", "SUPER_ADMIN"] as const)
            : kind === "ROLE"
              ? [
                  z
                    .enum(["OWNER", "TENANT", "BOARD_MEMBER", "SUPER_ADMIN"])
                    .parse(target),
                ]
              : [];
        const users = await tx.user.findMany({
          where: {
            id: kind === "USER" ? z.uuid().parse(target) : { not: actor.id },
            status: "APPROVED",
            ...(roles.length
              ? { roles: { some: { role: { name: { in: [...roles] } } } } }
              : {}),
            ...(["UNIT", "FLOOR"].includes(kind)
              ? {
                  memberships: {
                    some: {
                      startsAt: { lte: new Date() },
                      endsAt: null,
                      unit: {
                        active: true,
                        building: { key: "delta" },
                        ...(kind === "UNIT"
                          ? { number: z.string().min(1).parse(target) }
                          : { floor: z.string().min(1).parse(target) }),
                      },
                    },
                  },
                }
              : {}),
          },
          select: { id: true },
          take: 101,
        });
        ids = users.map((u) => u.id).filter((id) => id !== actor.id);
      }
      if (!ids.length || ids.length > 100)
        return fail("تعداد گیرندگان معتبر نیست.");
      const channels: ("INAPP" | "PUSH" | "SMS")[] = ["INAPP"];
      if (canManage(actor) && form.get("push") === "on") channels.push("PUSH");
      if (canManage(actor) && form.get("sms") === "on") channels.push("SMS");
      for (const recipientId of ids) {
        const hash = createHash("sha256")
          .update(actor.id + requestId + recipientId)
          .digest("hex");
        const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        const prior = await tx.inboxMessage.findUnique({ where: { id } });
        if (prior) {
          if (prior.body !== body || prior.threadId !== (thread || id))
            return fail("درخواست تکراری با اطلاعات متفاوت است.");
          continue;
        }
        const threadId = thread ? String(thread) : id;
        await tx.inboxMessage.create({
          data: { id, threadId, senderId: actor.id, recipientId, body },
        });
        await emitNotification(tx, {
          userId: recipientId,
          eventKey: "inbox:" + id,
          category: "operational",
          title: "پیام جدید",
          body: "یک پیام جدید در صندوق پیام‌ها دارید.",
          href: "/inbox?thread=" + threadId,
          channels,
        });
      }
    },
    { timeout: 30000 },
  );
  revalidatePath("/inbox");
}

export async function readInbox(form: FormData) {
  const actor = await requireApproved();
  await assertOrigin();
  const threadId = z.uuid().parse(form.get("thread"));
  await db.inboxMessage.updateMany({
    where: { threadId, recipientId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/inbox");
}
