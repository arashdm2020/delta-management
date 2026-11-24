import { z } from "zod";
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
export async function saveUnitContact(actor: Actor, input: unknown) {
  if (!canManage(actor)) fail("دسترسی مدیریت لازم است.");
  const data = schema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.unitId}))`;
    const unit = await tx.unit.findUniqueOrThrow({
      where: { id: data.unitId },
    });
    const previous = await tx.unitContact.findUnique({
      where: { unitId_kind: { unitId: data.unitId, kind: data.kind } },
    });
    let userId: string | null = null;
    if (data.phone) {
      const user = await tx.user.upsert({
        where: { phone: data.phone },
        create: { phone: data.phone, name: data.name },
        update: {},
      });
      userId = user.id;
      if (!user.name)
        await tx.user.update({
          where: { id: user.id },
          data: { name: data.name },
        });
      // Approval is an explicit management decision, never inferred from a contact record.
      if (data.approveAccess) {
        if (user.status === "SUSPENDED")
          fail("رفع تعلیق فقط از مدیریت کاربران انجام می‌شود.");
        if (!unit.active) fail("تأیید دسترسی برای واحد غیرفعال مجاز نیست.");
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
    }
    if (previous?.userId && previous.userId !== userId) {
      const now = new Date();
      const memberships = await tx.unitMembership.findMany({
        where: {
          unitId: unit.id,
          userId: previous.userId,
          kind: data.kind,
          endsAt: null,
        },
      });
      for (const membership of memberships) {
        if (now <= membership.startsAt)
          fail("برای تغییر ارتباط چند لحظه صبر کنید.");
        await tx.billingResponsibility.updateMany({
          where: { membershipId: membership.id, endsAt: null },
          data: { endsAt: now },
        });
        await tx.unitMembership.update({
          where: { id: membership.id },
          data: { endsAt: now },
        });
      }
      if (
        !(await tx.unitMembership.count({
          where: { userId: previous.userId, kind: data.kind, endsAt: null },
        }))
      )
        await tx.userRole.deleteMany({
          where: { userId: previous.userId, role: { name: data.kind } },
        });
    }
    if (
      userId &&
      !(await tx.unitMembership.findFirst({
        where: { unitId: unit.id, userId, kind: data.kind, endsAt: null },
      }))
    ) {
      await tx.unitMembership.create({
        data: { unitId: unit.id, userId, kind: data.kind },
      });
    }
    if (userId) {
      const role = await tx.role.upsert({
        where: { name: data.kind },
        create: { name: data.kind },
        update: {},
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        create: { userId, roleId: role.id },
        update: {},
      });
    }
    const contact = await tx.unitContact.upsert({
      where: { unitId_kind: { unitId: unit.id, kind: data.kind } },
      create: {
        unitId: unit.id,
        kind: data.kind,
        name: data.name,
        phone: data.phone || null,
        userId,
      },
      update: { name: data.name, phone: data.phone || null, userId },
    });
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
/** Contact priority never changes the legally/accounting assigned billing responsible person. */
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
