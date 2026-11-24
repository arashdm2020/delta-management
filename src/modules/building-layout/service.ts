import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canManage, fail, DomainError, type Actor } from "@/lib/security/core";
import { audit } from "@/modules/audit/service";
import { arrangeUnits, floorKey } from "./layout";
import { assignBillingIn } from "@/modules/units/service";
function authorize(actor: Actor) {
  if (!canManage(actor)) fail("دسترسی مدیریت لازم است.");
}
async function buildingLock(tx: Prisma.TransactionClient, buildingId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${buildingId}))`;
}
export async function setUnitPosition(actor: Actor, input: unknown) {
  authorize(actor);
  const data = z
    .object({
      unitId: z.uuid(),
      position: z.number().int().min(1).max(3).nullable(),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const initial = await tx.unit.findUniqueOrThrow({
      where: { id: data.unitId },
    });
    await buildingLock(tx, initial.buildingId);
    const unit = await tx.unit.findUniqueOrThrow({
      where: { id: data.unitId },
    });
    if (
      await tx.physicalGroupMember.count({
        where: { unitId: unit.id, endsAt: null },
      })
    )
      fail("ابتدا گروه فیزیکی این واحد را پایان دهید.");
    const floor = floorKey(unit);
    const floorUnits = await tx.unit.findMany({
      where: { buildingId: unit.buildingId },
      select: { id: true, floor: true, number: true, physicalPosition: true },
    });
    if (
      data.position &&
      floorUnits.some(
        (u) =>
          u.id !== unit.id &&
          floorKey(u) === floor &&
          u.physicalPosition === data.position,
      )
    )
      fail("این جایگاه در طبقه اشغال است.");
    await tx.unit.update({
      where: { id: unit.id },
      data: { floor, physicalPosition: data.position },
    });
    await audit(
      "layout.position",
      actor.id,
      unit.id,
      {
        position: data.position,
        floor,
        previousPosition: unit.physicalPosition,
        previousFloor: unit.floor,
      },
      tx,
    );
  });
}
export async function createPhysicalGroup(actor: Actor, input: unknown) {
  authorize(actor);
  const data = z
    .object({
      unitIds: z.array(z.uuid()).min(2).max(3),
      occupantLabel: z.string().trim().max(100).default(""),
    })
    .parse(input);
  if (new Set(data.unitIds).size !== data.unitIds.length)
    fail("واحد تکراری مجاز نیست.");
  return db.$transaction(async (tx) => {
    const building = await tx.building.findUniqueOrThrow({
      where: { key: "delta" },
    });
    await buildingLock(tx, building.id);
    const units = await tx.unit.findMany({
      where: { buildingId: building.id },
    });
    const selected = units.filter((u) => data.unitIds.includes(u.id));
    if (
      selected.length !== data.unitIds.length ||
      selected.some((u) => !u.active)
    )
      fail("واحدهای فعال همین ساختمان را انتخاب کنید.");
    const floor = floorKey(selected[0]);
    if (floor === "نامشخص") fail("ابتدا طبقهٔ واقعی واحدها را مشخص کنید.");
    if (selected.some((u) => floorKey(u) !== floor))
      fail("گروه باید در یک طبقه باشد.");
    if (
      await tx.physicalGroupMember.count({
        where: { unitId: { in: data.unitIds }, endsAt: null },
      })
    )
      fail("واحد از قبل در گروه فعال است.");
    const row = arrangeUnits(units).find((f) => f.floor === floor)!;
    const positions = row.units
      .filter((p) => data.unitIds.includes(p.unit.id))
      .map((p) => p.position)
      .sort((a, b) => a - b);
    if (
      positions.at(-1)! > 3 ||
      positions.at(-1)! - positions[0] + 1 !== positions.length
    )
      fail(
        "فقط جایگاه‌های مجاور در یک ردیف سه‌تایی قابل ادغام هستند؛ ابتدا چیدمان را تنظیم کنید.",
      );
    // Freeze inferred positions for this row, so adding a later unit cannot
    // silently change the adjacency of an existing physical group.
    for (const { unit, position } of row.units.filter((p) => p.position <= 3)) {
      if (unit.physicalPosition === null)
        await tx.unit.update({
          where: { id: unit.id },
          data: { physicalPosition: position, floor },
        });
    }
    const previousEnd = await tx.physicalGroupMember.aggregate({
      where: { unitId: { in: data.unitIds } },
      _max: { endsAt: true },
    });
    const startsAt = new Date(
      Math.max(Date.now(), previousEnd._max.endsAt?.getTime() || 0),
    );
    const ordered = row.units.filter((p) => data.unitIds.includes(p.unit.id));
    const group = await tx.physicalUnitGroup.create({
      data: {
        buildingId: building.id,
        floor,
        label: ordered.map((p) => p.unit.number).join(" + "),
        occupantLabel: data.occupantLabel || null,
        startsAt,
        members: {
          create: ordered.map((p) => ({
            unitId: p.unit.id,
            unitNumber: p.unit.number,
            startsAt,
          })),
        },
      },
    });
    await audit(
      "layout.group.start",
      actor.id,
      group.id,
      { unitIds: data.unitIds },
      tx,
    );
    return group;
  });
}
export async function endPhysicalGroup(actor: Actor, id: string) {
  authorize(actor);
  z.uuid().parse(id);
  return db.$transaction(async (tx) => {
    const group = await tx.physicalUnitGroup.findUniqueOrThrow({
      where: { id },
    });
    await buildingLock(tx, group.buildingId);
    const current = await tx.physicalUnitGroup.findUniqueOrThrow({
      where: { id },
    });
    if (current.endsAt) return;
    const endsAt = new Date(
      Math.max(Date.now(), current.startsAt.getTime() + 1),
    );
    await tx.physicalGroupMember.updateMany({
      where: { groupId: id, endsAt: null },
      data: { endsAt },
    });
    await tx.physicalUnitGroup.update({ where: { id }, data: { endsAt } });
    await audit("layout.group.end", actor.id, id, {}, tx);
  });
}
export async function assignPhysicalGroupPayer(
  actor: Actor,
  groupId: string,
  userId: string,
) {
  authorize(actor);
  z.uuid().parse(groupId);
  z.uuid().parse(userId);
  return db.$transaction(async (tx) => {
    const group = await tx.physicalUnitGroup.findUniqueOrThrow({
      where: { id: groupId },
    });
    await buildingLock(tx, group.buildingId);
    if (
      (await tx.physicalUnitGroup.findUniqueOrThrow({ where: { id: groupId } }))
        .endsAt
    )
      fail("گروه پایان یافته است.");
    const members = await tx.physicalGroupMember.findMany({
      where: { groupId, endsAt: null },
      orderBy: { unitId: "asc" },
    });
    for (const member of members) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${member.unitId}))`;
      const membership = await tx.unitMembership.findFirst({
        where: {
          unitId: member.unitId,
          userId,
          endsAt: null,
          startsAt: { lte: new Date() },
        },
      });
      if (!membership)
        throw new DomainError(
          "ACCESS",
          "پرداخت‌کننده باید در تک‌تک واحدها ارتباط فعال داشته باشد؛ ابتدا ارتباط‌ها را ثبت کنید.",
        );
      await assignBillingIn(tx, actor, member.unitId, membership.id);
    }
    await audit("layout.group.payer", actor.id, groupId, { userId }, tx);
  });
}
