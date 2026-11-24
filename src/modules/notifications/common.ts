import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canManage, fail, hashToken, type Actor } from "@/lib/security/core";
import { member, lock } from "@/modules/accounting/service";
export { member, lock };
export function communicationManager(actor: Actor) {
  if (!canManage(actor)) fail("دسترسی مدیریت ساختمان لازم است.");
}
export async function rateLimit(
  tx: Prisma.TransactionClient,
  userId: string,
  operation: string,
  limit = 30,
  now = new Date(),
) {
  const key = hashToken(
    `communication:${operation}:${userId}:${Math.floor(now.getTime() / 3600000)}`,
  );
  const rate = await tx.securityRateLimit.upsert({
    where: { key },
    create: { key },
    update: { count: { increment: 1 } },
  });
  if (rate.count > limit)
    fail("تعداد درخواست‌ها زیاد است؛ ساعتی بعد دوباره تلاش کنید.");
}
export async function eligibleUsers(tx: Prisma.TransactionClient = db) {
  return tx.user.findMany({
    where: {
      status: "APPROVED",
      OR: [
        {
          roles: {
            some: { role: { name: { in: ["SUPER_ADMIN", "BOARD_MEMBER"] } } },
          },
        },
        {
          memberships: {
            some: {
              startsAt: { lte: new Date() },
              endsAt: null,
              unit: { active: true },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      roles: { select: { role: { select: { name: true } } } },
      memberships: {
        where: {
          startsAt: { lte: new Date() },
          endsAt: null,
          unit: { active: true },
        },
        select: { unitId: true, kind: true },
      },
    },
  });
}
export type Audience = {
  kind: "ALL" | "OWNERS" | "TENANTS" | "UNITS" | "BOARD";
  unitId?: string | null;
};
export async function audienceUsers(
  audiences: Audience[],
  tx: Prisma.TransactionClient = db,
) {
  const users = await eligibleUsers(tx);
  return users.filter((u) =>
    audiences.some(
      (a) =>
        a.kind === "ALL" ||
        (a.kind === "BOARD" && canManage({ ...u, status: "APPROVED" })) ||
        (a.kind === "OWNERS" &&
          u.memberships.some((m) => m.kind === "OWNER")) ||
        (a.kind === "TENANTS" &&
          u.memberships.some((m) => m.kind === "TENANT")) ||
        (a.kind === "UNITS" &&
          u.memberships.some((m) => m.unitId === a.unitId)),
    ),
  );
}
export function pageNumber(raw: unknown) {
  const n = Number(raw || 1);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}
