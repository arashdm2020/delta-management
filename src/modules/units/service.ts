import { db } from "@/lib/db";
import { audit } from "@/modules/audit/service";
import { canManage, type Actor, fail } from "@/lib/security/core";
import { membershipSchema, unitSchema, uuid } from "@/lib/validation";
import type { Prisma } from "@prisma/client";
function authorize(actor: Actor) {
  if (!canManage(actor)) fail("دسترسی مدیریت لازم است.");
}
export async function saveUnit(actor: Actor, input: unknown) {
  authorize(actor);
  const data = unitSchema.parse(input);
  return db.$transaction(async (tx) => {
    const building = await tx.building.findUniqueOrThrow({
      where: { key: "delta" },
    });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${building.id}))`;
    const previous = data.id
      ? await tx.unit.findUniqueOrThrow({
          where: { id: data.id, buildingId: building.id },
        })
      : null;
    if (previous) {
      if (
        (previous.number !== data.number || previous.floor !== data.floor) &&
        (await tx.physicalGroupMember.count({
          where: { unitId: data.id, endsAt: null },
        }))
      )
        fail(
          "ابتدا گروه فیزیکی واحد را پایان دهید، سپس شماره یا طبقه را تغییر دهید.",
        );
    }
    if (
      !data.id &&
      (await tx.unit.count({ where: { buildingId: building.id } })) >=
        building.capacity
    )
      fail("هر ۱۸ واحد ساختمان ثبت شده است.");
    const unit = data.id
      ? await tx.unit.update({
          where: { id: data.id, buildingId: building.id },
          data: {
            number: data.number,
            floor: data.floor,
            active: data.active,
            occupancy: data.occupancy,
          },
        })
      : await tx.unit.create({ data: { ...data, buildingId: building.id } });
    await audit(
      "unit.save",
      actor.id,
      unit.id,
      {
        before: previous
          ? {
              number: previous.number,
              floor: previous.floor,
              occupancy: previous.occupancy,
              active: previous.active,
            }
          : null,
        after: {
          number: unit.number,
          floor: unit.floor,
          occupancy: unit.occupancy,
          active: unit.active,
        },
      },
      tx,
    );
    return unit;
  });
}
export async function assignMember(actor: Actor, input: unknown) {
  authorize(actor);
  const data = membershipSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.unitId}))`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: data.userId },
    });
    if (user.status !== "APPROVED") fail("ابتدا کاربر را تأیید کنید.");
    const unit = await tx.unit.findUniqueOrThrow({
      where: { id: data.unitId },
    });
    if (!unit.active) fail("واحد غیرفعال است.");
    if (await tx.unitMembership.findFirst({ where: { ...data, endsAt: null } }))
      return;
    const membership = await tx.unitMembership.create({ data });
    if (data.kind !== "AUTHORIZED") {
      const role = await tx.role.findUniqueOrThrow({
        where: { name: data.kind },
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: {},
      });
    }
    await audit(
      "membership.start",
      actor.id,
      membership.id,
      { kind: data.kind },
      tx,
    );
  });
}
export async function endMember(actor: Actor, id: string) {
  authorize(actor);
  uuid.parse(id);
  return db.$transaction(async (tx) => {
    const member = await tx.unitMembership.findUniqueOrThrow({ where: { id } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${member.unitId}))`;
    const now = new Date();
    await tx.billingResponsibility.updateMany({
      where: { membershipId: id, endsAt: null },
      data: { endsAt: now },
    });
    await tx.unitMembership.update({ where: { id }, data: { endsAt: now } });
    if (
      member.kind !== "AUTHORIZED" &&
      !(await tx.unitMembership.count({
        where: { userId: member.userId, kind: member.kind, endsAt: null },
      }))
    ) {
      await tx.userRole.deleteMany({
        where: { userId: member.userId, role: { name: member.kind } },
      });
    }
    await audit("membership.end", actor.id, id, {}, tx);
  });
}
export async function assignBilling(
  actor: Actor,
  unitId: string,
  membershipId: string,
  reason?: string,
) {
  authorize(actor);
  uuid.parse(unitId);
  uuid.parse(membershipId);
  return db.$transaction(async (tx) => {
    return assignBillingIn(tx, actor, unitId, membershipId, reason);
  });
}
export async function assignBillingIn(
  tx: Prisma.TransactionClient,
  actor: Actor,
  unitId: string,
  membershipId: string,
  reason?: string,
) {
  authorize(actor);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}))`;
  const member = await tx.unitMembership.findFirstOrThrow({
    where: {
      id: membershipId,
      unitId,
      endsAt: null,
      startsAt: { lte: new Date() },
    },
    include: { user: true, unit: true },
  });
  if (member.user.status !== "APPROVED" || !member.unit.active)
    fail("مسئول باید کاربر تأییدشدهٔ یک واحد فعال باشد.");
  const current = await tx.billingResponsibility.findFirst({
    where: { unitId, endsAt: null },
  });
  if (current?.membershipId === member.id) return current;
  const now = new Date(
    Math.max(Date.now(), (current?.startsAt.getTime() || 0) + 1),
  );
  await tx.billingResponsibility.updateMany({
    where: { unitId, endsAt: null },
    data: { endsAt: now },
  });
  const assignment = await tx.billingResponsibility.create({
    data: { unitId, membershipId, userId: member.userId, startsAt: now },
  });
  await audit(
    "billing.assign",
    actor.id,
    assignment.id,
    { reason: reason ?? null },
    tx,
  );
  return assignment;
}
export async function visibleUnit(actor: Actor, id: string) {
  uuid.parse(id);
  if (actor.status !== "APPROVED") fail("حساب تأیید نشده است.");
  const unit = await db.unit.findFirst({
    where: {
      id,
      ...(!canManage(actor)
        ? {
            memberships: {
              some: {
                userId: actor.id,
                endsAt: null,
                startsAt: { lte: new Date() },
              },
            },
          }
        : {}),
    },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { startsAt: "desc" },
      },
      responsibilities: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { startsAt: "desc" },
      },
    },
  });
  return unit ?? fail("واحد در دسترس نیست.");
}
