import { db } from "@/lib/db";
import { lock, manager } from "@/modules/accounting/service";
import { periodBounds } from "./calendar";
import { reasonSchema } from "./schemas";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { audit } from "@/modules/audit/service";
import { fail, type Actor } from "@/lib/security/core";

export async function billingCandidate(
  tx: Prisma.TransactionClient,
  unitId: string,
  at: Date,
) {
  const throughDate = {
    startsAt: { lte: at },
    OR: [{ endsAt: null }, { endsAt: { gt: at } }],
  };
  const assigned = await tx.billingResponsibility.findFirst({
    where: { unitId, ...throughDate },
    include: { user: true },
  });
  if (assigned) return { assigned, member: null, issue: null };
  const memberships = await tx.unitMembership.findMany({
    where: { unitId, ...throughDate, kind: { in: ["OWNER", "TENANT"] } },
    include: { user: true },
  });
  const tenants = memberships.filter((m) => m.kind === "TENANT");
  const candidates = tenants.length ? tenants : memberships;
  if (candidates.length > 1)
    return {
      assigned: null,
      member: null,
      issue: "چند عضو واجد شرایط وجود دارد؛ مسئول پرداخت را تعیین کنید.",
    };
  if (candidates[0]?.user.status !== "APPROVED")
    return {
      assigned: null,
      member: null,
      issue: "مسئول مالی فعال و تأییدشده وجود ندارد.",
    };
  return { assigned: null, member: candidates[0], issue: null };
}

export async function snapshotBillingPayer(
  tx: Prisma.TransactionClient,
  actor: Actor,
  unit: { id: string; number: string },
  at: Date,
) {
  const { assigned, member, issue } = await billingCandidate(tx, unit.id, at);
  if (assigned) return assigned;
  if (!member) return fail(`واحد ${unit.number}: ${issue}`);
  // The automatic decision applies to this billing cut-off only. A later
  // invoice resolves its own occupancy and explicit assignments independently.
  const snapshot = await tx.billingResponsibility.create({
    data: {
      unitId: unit.id,
      membershipId: member.id,
      userId: member.userId,
      startsAt: at,
      endsAt: new Date(at.getTime() + 1),
    },
    include: { user: true },
  });
  await audit(
    "billing.assign.automatic",
    actor.id,
    snapshot.id,
    { kind: member.kind },
    tx,
  );
  return snapshot;
}

export async function designatePayerForPeriod(
  actor: Actor,
  input: {
    unitId: string;
    membershipId: string;
    period: string;
    reason: string;
  },
) {
  manager(actor);
  const unitId = z.uuid().parse(input.unitId);
  const membershipId = z.uuid().parse(input.membershipId);
  const { startsAt, key } = periodBounds(input.period);
  const reason = reasonSchema.parse(input.reason);
  if (startsAt > new Date()) fail("برای دورهٔ آینده، مسئول جاری را تعیین کنید.");
  return db.$transaction(async (tx) => {
    await lock(tx, unitId);
    const current = await billingCandidate(tx, unitId, startsAt);
    if (current.assigned?.membershipId === membershipId)
      return current.assigned;
    if (current.assigned)
      return fail("مسئول این دوره قبلاً ثبت شده و سابقهٔ آن محفوظ است.");
    const membership = await tx.unitMembership.findFirst({
      where: {
        id: membershipId,
        unitId,
        startsAt: { lte: startsAt },
        OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
        user: { status: "APPROVED" },
      },
    });
    if (!membership)
      return fail("این شخص در ابتدای دوره عضو تأییدشدهٔ واحد نبوده است.");
    const assignment = await tx.billingResponsibility.create({
      data: {
        unitId,
        membershipId,
        userId: membership.userId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 1),
      },
    });
    await audit(
      "billing.assign.period",
      actor.id,
      assignment.id,
      { period: key, reason },
      tx,
    );
    return assignment;
  });
}
