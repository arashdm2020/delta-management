import { db } from "@/lib/db";
import { type Actor, fail, canManage } from "@/lib/security/core";
import { manager } from "@/modules/accounting/service";
import { generateInvoices } from "./service";
import { currentPeriod, periodBounds } from "./calendar";
import { verifyPayment } from "@/modules/payments/service";
export async function queueBilling(actor: Actor, key: string) {
  manager(actor);
  const bounds = periodBounds(key);
  return db.outboxJob.upsert({
    where: { key: "generate:" + key },
    create: {
      key: "generate:" + key,
      kind: "GENERATE_INVOICES",
      availableAt: new Date(Math.max(Date.now(), bounds.startsAt.getTime())),
      payload: { key, actorId: actor.id },
    },
    update: {},
  });
}
export async function runOneJob() {
  const job = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "OutboxJob" WHERE (status='PENDING' AND "availableAt"<=now()) OR (status='RUNNING' AND "lockedAt"<now()-interval '5 minutes') ORDER BY "availableAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows.length) return null;
    return tx.outboxJob.update({
      where: { id: rows[0].id },
      data: {
        status: "RUNNING",
        lockedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  });
  if (!job) return false;
  try {
    const payload = job.payload as Record<string, string>;
    if (job.kind === "GENERATE_INVOICES") {
      const actor = await db.user.findUniqueOrThrow({
        where: { id: payload.actorId },
        include: { roles: { include: { role: true } } },
      });
      await generateInvoices(actor, payload.key);
    } else if (job.kind === "VERIFY_PAYMENT") {
      const result = await verifyPayment(payload.authority);
      if (!["VERIFIED", "FAILED", "CANCELLED"].includes(result.status))
        fail("در انتظار تأیید درگاه");
    } else if (
      job.kind === "NOTIFICATION_EVENT" ||
      job.kind.startsWith("COMM_")
    ) {
      const { processCommunicationJob } =
        await import("@/modules/notifications/jobs");
      await processCommunicationJob(
        job.kind,
        job.payload as Record<string, unknown>,
      );
    } else fail("نوع کار معتبر نیست.");
    await db.outboxJob.updateMany({
      where: { id: job.id, status: "RUNNING", attempts: job.attempts },
      data: { status: "DONE", lockedAt: null, lastError: null },
    });
  } catch {
    await db.outboxJob.updateMany({
      where: { id: job.id, attempts: job.attempts },
      data: {
        status: job.attempts >= 8 ? "DEAD" : "PENDING",
        lockedAt: null,
        lastError:
          job.attempts >= 8
            ? "حد تلاش مجدد تمام شد؛ بررسی مدیریت لازم است."
            : "عملیات ناموفق؛ تلاش مجدد زمان‌بندی شد.",
        availableAt: new Date(
          Date.now() +
            Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
        ),
      },
    });
  }
  return true;
}

export async function queueMonthlyCharges() {
  const key = currentPeriod();
  const policies = await db.chargePolicy.findMany({
    orderBy: { startsAt: "asc" },
  });
  if (!policies.length) return null;
  const first = currentPeriod(policies[0].startsAt);
  const serial = (value: string) => {
    const [y, m] = value.split("-").map(Number);
    return y * 12 + m - 1;
  };
  let queued = 0;
  let last = null;
  // Catch up missed worker runs without requiring monthly policy changes. Bound each sweep.
  for (
    let month = serial(first);
    month <= serial(key) && queued < 24;
    month++
  ) {
    const period = `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}`;
    const existing = await db.outboxJob.findUnique({
      where: { key: "generate:" + period },
    });
    if (existing?.status === "DONE") {
      last = existing;
      continue;
    }
    const bounds = periodBounds(period);
    const policy = policies.find(
      (p) =>
        p.startsAt <= bounds.startsAt &&
        (!p.endsAt || p.endsAt > bounds.startsAt),
    );
    if (!policy) continue;
    const actor = await db.user.findUniqueOrThrow({
      where: { id: policy.actorId },
      include: { roles: { include: { role: true } } },
    });
    if (!canManage(actor)) continue;
    last = await queueBilling(actor, period);
    queued++;
  }
  return last;
}
