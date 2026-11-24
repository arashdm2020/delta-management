import { db } from "@/lib/db";
import { audit } from "@/modules/audit/service";
import { canManage, hasRole, type Actor, fail } from "@/lib/security/core";
import { uuid } from "@/lib/validation";
export async function approveUser(
  actor: Actor,
  id: string,
  status: "APPROVED" | "SUSPENDED",
) {
  if (!canManage(actor)) fail("دسترسی مدیریت لازم است.");
  uuid.parse(id);
  if (!["APPROVED", "SUSPENDED"].includes(status)) fail("وضعیت معتبر نیست.");
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (user.id === actor.id || hasRole(user, "SUPER_ADMIN"))
      fail("این حساب از این بخش قابل تغییر نیست.");
    if (status === "APPROVED" && !user.name) fail("ثبت‌نام کاربر کامل نیست.");
    await tx.user.update({
      where: { id },
      data: {
        status,
        approvedAt: status === "APPROVED" ? new Date() : user.approvedAt,
      },
    });
    if (status === "SUSPENDED")
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    await audit("user." + status.toLowerCase(), actor.id, id, {}, tx);
  });
}
