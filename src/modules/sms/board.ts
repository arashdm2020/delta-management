import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  canManage,
  equalHash,
  fail,
  otpHash,
  type Actor,
} from "@/lib/security/core";
import { normalizePhone } from "@/lib/validation";
import { lock, manager } from "@/modules/accounting/service";
import { receivableEntries } from "@/modules/accounting/receivables";
import { audit } from "@/modules/audit/service";
import { floorKey } from "@/modules/building-layout/layout";
import { queueEvent } from "@/modules/notifications/service";
import { farazPatternConfiguration } from "./faraz";
import { billingCandidate } from "@/modules/billing/responsibility";
import { mappedVariables } from "./events";
import { notificationSmsProvider } from "./service";
import { smsFailureDiagnostic } from "./errors";

export const announcementSms =
  "اطلاعیه ساختمان؛ برای مشاهده جزئیات وارد سامانه شوید." as const;
const event = "announcement.board" as const;
export const smsAudience = z
  .object({
    kind: z.enum([
      "ALL",
      "OWNER",
      "TENANT",
      "UNIT",
      "FLOOR",
      "DEBT",
      "CONTACT",
    ]),
    selected: z.array(z.string().min(1).max(50)).max(100),
  })
  .refine(({ kind, selected }) =>
    ["UNIT", "FLOOR", "CONTACT"].includes(kind)
      ? selected.length > 0
      : selected.length === 0,
  );
type Audience = z.infer<typeof smsAudience>;

export async function boardRecipients(
  actor: Actor,
  input: Audience,
  tx: Prisma.TransactionClient = db,
) {
  manager(actor);
  const audience = smsAudience.parse(input);
  const selected = new Set(audience.selected);
  const now = new Date();
  const units = await tx.unit.findMany({
    where: {
      building: { key: "delta" },
      ...(audience.kind === "DEBT" ? {} : { active: true }),
    },
    include: {
      memberships: {
        where: {
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          user: { status: "APPROVED" },
        },
        include: { user: { select: { id: true, phone: true } } },
      },
      contacts: { select: { id: true, phone: true, kind: true, userId: true } },
    },
  });
  const phones = new Set<string>();
  function add(phone: string | null) {
    if (!phone) return;
    try {
      phones.add(normalizePhone(phone));
    } catch {
      /* Legacy invalid numbers are skipped. */
    }
  }
  if (audience.kind === "DEBT") {
    const buildingUnits = new Set(units.map((unit) => unit.id));
    const balances = new Map<
      string,
      { unitId: string; legacyInvoice: boolean; amount: bigint }
    >();
    for (const entry of await receivableEntries(tx)) {
      if (
        !entry.unitId ||
        !buildingUnits.has(entry.unitId) ||
        !entry.obligationId
      )
        continue;
      const current = balances.get(entry.obligationId) ?? {
        unitId: entry.unitId,
        legacyInvoice: !entry.originalSource.startsWith("unit-debt:"),
        amount: 0n,
      };
      current.amount += entry.delta;
      balances.set(entry.obligationId, current);
    }
    const openInvoiceIds = [...balances]
      .filter(([, row]) => row.legacyInvoice && row.amount > 0n)
      .map(([id]) => id);
    const payers = await tx.invoice.findMany({
      where: { id: { in: openInvoiceIds } },
      select: { responsibleId: true },
    });
    const users = await tx.user.findMany({
      where: {
        id: { in: payers.map((payer) => payer.responsibleId) },
        status: "APPROVED",
      },
      select: { phone: true },
    });
    for (const user of users) add(user.phone);
    const otherUnits = new Set(
      [...balances.values()]
        .filter((row) => !row.legacyInvoice && row.amount > 0n)
        .map((row) => row.unitId),
    );
    for (const unitId of otherUnits) {
      const payer = await billingCandidate(tx, unitId, now);
      const user = payer.assigned?.user ?? payer.member?.user;
      if (user?.status === "APPROVED") add(user.phone);
    }
    return [...phones].sort();
  }
  for (const unit of units) {
    if (audience.kind === "UNIT" && !selected.has(unit.id)) continue;
    if (audience.kind === "FLOOR" && !selected.has(floorKey(unit))) continue;
    for (const member of unit.memberships) {
      if (member.kind === "AUTHORIZED" && audience.kind !== "CONTACT") continue;
      if (audience.kind === "CONTACT" && !selected.has(member.user.id))
        continue;
      if (
        ["OWNER", "TENANT"].includes(audience.kind) &&
        member.kind !== audience.kind
      )
        continue;
      add(member.user.phone);
    }
    for (const contact of unit.contacts) {
      if (audience.kind === "CONTACT" && !selected.has(contact.id)) continue;
      if (
        ["OWNER", "TENANT"].includes(audience.kind) &&
        contact.kind !== audience.kind
      )
        continue;
      add(contact.phone);
    }
  }
  return [...phones].sort();
}

function signature(
  actor: Actor,
  id: string,
  expires: number,
  input: Audience,
  phones: string[],
) {
  return otpHash(
    "board-sms",
    JSON.stringify([actor.id, id, expires, input, phones]),
  );
}

export async function previewBoardSms(actor: Actor, input: Audience) {
  const phones = await boardRecipients(actor, input);
  if (!phones.length || phones.length > 100)
    fail("گروه باید بین ۱ و ۱۰۰ گیرنده داشته باشد.");
  const id = randomUUID();
  const expires = Date.now() + 5 * 60_000;
  return {
    phones,
    input,
    id,
    expires,
    signature: signature(actor, id, expires, input, phones),
  };
}

async function ensureBoardSmsConfigured() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NOTIFICATION_SMS_PROVIDER === "development"
  )
    return;
  const { template } = await farazPatternConfiguration(event);
  mappedVariables(
    event,
    { message: announcementSms },
    template.variableMapping,
  );
}

export async function confirmBoardSms(
  actor: Actor,
  input: Audience,
  preview: { id: string; expires: number; signature: string },
) {
  manager(actor);
  const { id, expires } = preview;
  z.uuid().parse(id);
  if (!Number.isSafeInteger(expires) || expires < Date.now())
    fail("پیش‌نمایش منقضی شده است.");
  await ensureBoardSmsConfigured();
  return db.$transaction(async (tx) => {
    await lock(tx, "board-sms");
    if (
      await tx.auditLog.findFirst({
        where: { action: "sms.board.confirm", targetId: id, actorId: actor.id },
      })
    )
      return;
    const phones = await boardRecipients(actor, input, tx);
    if (
      !phones.length ||
      phones.length > 100 ||
      !equalHash(
        signature(actor, id, expires, input, phones),
        preview.signature,
      )
    )
      fail("گیرندگان تغییر کرده‌اند. دوباره پیش‌نمایش بگیرید.");
    const since = new Date(Date.now() - 60 * 60_000);
    if (
      (await tx.auditLog.count({
        where: { action: "sms.board.queued", createdAt: { gte: since } },
      })) +
        phones.length >
      100
    )
      fail("سقف ارسال پیامک در یک ساعت پر شده است.");
    await audit(
      "sms.board.confirm",
      actor.id,
      id,
      { audience: input, count: phones.length },
      tx,
    );
    for (const [index, phone] of phones.entries()) {
      const deliveryId = randomUUID();
      await audit(
        "sms.board.queued",
        actor.id,
        deliveryId,
        { campaignId: id, suffix: phone.slice(-4) },
        tx,
      );
      await queueEvent(
        tx,
        "board-sms:" + deliveryId,
        "COMM_BOARD_SMS",
        { actorId: actor.id, deliveryId, phone },
        new Date(Date.now() + index * 1200),
      );
    }
  });
}

export async function dispatchBoardSms(payload: Record<string, unknown>) {
  const { actorId, deliveryId, phone } = z
    .object({
      actorId: z.uuid(),
      deliveryId: z.uuid(),
      phone: z.string(),
    })
    .parse(payload);
  const actor = await db.user.findUniqueOrThrow({
    where: { id: actorId }, include: { roles: { include: { role: true } } },
  });
  if (!canManage(actor)) throw new Error("ACCESS_REVOKED");
  await ensureBoardSmsConfigured();
  const claimed = await db.$transaction(async (tx) => {
    await lock(tx, "board-sms:" + deliveryId);
    const previous = await tx.auditLog.findFirst({
      where: { action: { in: ["sms.board.claimed", "sms.board.retry"] }, targetId: deliveryId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (previous?.action === "sms.board.claimed") return false;
    await audit("sms.board.claimed", actorId, deliveryId, {}, tx);
    return true;
  });
  if (!claimed) return; // A worker crash after submission has an unknown outcome. Never resend.
  try {
    const actor = await db.user.findUniqueOrThrow({
      where: { id: actorId },
      include: { roles: { include: { role: true } } },
    });
    if (!canManage(actor)) throw new Error("ACCESS_REVOKED");
    await ensureBoardSmsConfigured();
    const result = await notificationSmsProvider().send({
      phone,
      event: { event, payload: { message: announcementSms } },
      content: announcementSms,
      template: event,
      idempotencyKey: deliveryId,
    });
    await audit("sms.board.result", actorId, deliveryId, result);
  } catch (error) {
    const diagnostic = smsFailureDiagnostic(error);
    // Provider documentation does not guarantee non-acceptance for HTTP 429.
    await audit("sms.board.result", actorId, deliveryId, {
      status: "UNCONFIRMED",
      diagnostic: smsFailureDiagnostic(error),
    });
  }
}
