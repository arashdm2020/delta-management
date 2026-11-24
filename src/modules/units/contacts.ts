import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canManage, fail, hashToken, type Actor } from "@/lib/security/core";
import { phoneSchema } from "@/lib/validation";
import { audit } from "@/modules/audit/service";
const schema = z.object({
  unitId: z.uuid(),
  kind: z.enum(["OWNER", "TENANT"]),
  name: z.string().trim().min(3).max(100),
  phone: z.union([z.literal(""), phoneSchema]).optional(),
  approveAccess: z.boolean().default(false),
});
async function provisionPerson(
  tx: Prisma.TransactionClient,
  actor: Actor,
  unit: { id: string; active: boolean },
  data: z.infer<typeof schema>,
) {
  if (!data.phone) return null;
  const user = await tx.user.upsert({
    where: { phone: data.phone },
    create: { phone: data.phone, name: data.name },
    update: {},
  });
  if (!user.name)
    await tx.user.update({ where: { id: user.id }, data: { name: data.name } });
  if (data.approveAccess) {
    if (user.status === "SUSPENDED")
      fail("رفع تعلیق فقط از مدیریت کاربران انجام می‌شود.");
    if (!unit.active) fail("فعال‌سازی دسترسی برای واحد غیرفعال مجاز نیست.");
    if (user.status !== "APPROVED") {
      await tx.user.update({
        where: { id: user.id },
        data: { status: "APPROVED", approvedAt: new Date() },
      });
      await audit(
        "user.approved",
        actor.id,
        user.id,
        { source: "unit-contact-explicit" },
        tx,
      );
    }
  }
  const membership = await tx.unitMembership.findFirst({
    where: { unitId: unit.id, userId: user.id, kind: data.kind, endsAt: null },
  });
  if (!membership)
    await tx.unitMembership.create({
      data: { unitId: unit.id, userId: user.id, kind: data.kind },
    });
  const role = await tx.role.upsert({
    where: { name: data.kind },
    create: { name: data.kind },
    update: {},
  });
  await tx.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id },
    update: {},
  });
  return user.id;
}
async function primaryContact(
  tx: Prisma.TransactionClient,
  data: z.infer<typeof schema>,
  userId: string | null,
) {
  return tx.unitContact.upsert({
    where: { unitId_kind: { unitId: data.unitId, kind: data.kind } },
    create: {
      unitId: data.unitId,
      kind: data.kind,
      name: data.name,
      phone: data.phone || null,
      userId,
    },
    update: { name: data.name, phone: data.phone || null, userId },
  });
}
export async function saveUnitContact(actor: Actor, input: unknown) {
  if (!canManage(actor)) fail("دسترسی مدیریت لازم است.");
  const data = schema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.unitId}))`;
    const unit = await tx.unit.findUniqueOrThrow({
      where: { id: data.unitId },
    });
    const userId = await provisionPerson(tx, actor, unit, data);
    // Changing primary contact never terminates another resident or their billing history.
    const contact = await primaryContact(tx, data, userId);
    await audit(
      "unit.contact.save",
      actor.id,
      contact.id,
      { kind: data.kind, phoneHash: data.phone ? hashToken(data.phone) : null },
      tx,
    );
    return contact;
  });
}
export async function registerUnitResident(actor: Actor, input: unknown) {
  if (!canManage(actor)) fail("دسترسی مدیریت لازم است.");
  const data = schema
    .extend({
      phone: phoneSchema,
      approveAccess: z.boolean().default(true),
      primary: z.boolean().default(false),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.unitId}))`;
    const unit = await tx.unit.findUniqueOrThrow({
      where: { id: data.unitId },
    });
    const userId = (await provisionPerson(tx, actor, unit, data))!;
    if (data.primary) await primaryContact(tx, data, userId);
    await audit(
      "unit.resident.add",
      actor.id,
      unit.id,
      { userId, kind: data.kind, primary: data.primary },
      tx,
    );
    return tx.unitMembership.findFirstOrThrow({
      where: { unitId: unit.id, userId, kind: data.kind, endsAt: null },
    });
  });
}
export function preferredUnitContact(
  unit: { active: boolean; occupancy: string },
  contacts: { kind: string; name: string; phone: string | null }[],
) {
  const owner = contacts.find((c) => c.kind === "OWNER" && c.phone);
  const tenant = contacts.find((c) => c.kind === "TENANT" && c.phone);
  return unit.active && unit.occupancy !== "VACANT" && tenant
    ? tenant
    : owner || null;
}
