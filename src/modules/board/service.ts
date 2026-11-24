import { db } from "@/lib/db";
import { hasRole, type Actor, fail } from "@/lib/security/core";
import { audit } from "@/modules/audit/service";
import { z } from "zod";
export async function assignBoard(actor: Actor, input: unknown) {
  if (!hasRole(actor, "SUPER_ADMIN"))
    fail("فقط مدیر ارشد می‌تواند نقش هیئت‌مدیره را تغییر دهد.");
  const { userId, title } = z
    .object({ userId: z.uuid(), title: z.string().trim().min(3).max(100) })
    .parse(input);
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.status !== "APPROVED") fail("کاربر باید تأیید شده باشد.");
    const building = await tx.building.findUniqueOrThrow({
      where: { key: "delta" },
    });
    let term = await tx.boardTerm.findFirst({
      where: { buildingId: building.id, endsAt: null, title },
    });
    term ??= await tx.boardTerm.create({
      data: { buildingId: building.id, title, startsAt: new Date() },
    });
    if (await tx.boardMember.findFirst({ where: { userId, endsAt: null } }))
      fail("عضویت فعال قبلاً ثبت شده است.");
    await tx.boardMember.create({ data: { userId, termId: term.id } });
    const role = await tx.role.findUniqueOrThrow({
      where: { name: "BOARD_MEMBER" },
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });
    await audit("board.assign", actor.id, userId, {}, tx);
  });
}
export async function endBoard(actor: Actor, id: string) {
  if (!hasRole(actor, "SUPER_ADMIN")) fail("دسترسی کافی نیست.");
  z.uuid().parse(id);
  return db.$transaction(async (tx) => {
    const member = await tx.boardMember.update({
      where: { id },
      data: { endsAt: new Date() },
    });
    const role = await tx.role.findUniqueOrThrow({
      where: { name: "BOARD_MEMBER" },
    });
    await tx.userRole.deleteMany({
      where: { userId: member.userId, roleId: role.id },
    });
    await audit("board.end", actor.id, id, {}, tx);
  });
}
