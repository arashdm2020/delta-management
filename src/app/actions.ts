"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { profileSchema, unitSchema } from "@/lib/validation";
import { DomainError, hashToken } from "@/lib/security/core";
import {
  requireUser,
  requireManager,
  requireSuperAdmin,
  cookieName,
} from "@/modules/auth/session";
import { assertOrigin } from "@/modules/auth/http";
import {
  assignBilling,
  assignMember,
  endMember,
  saveUnit,
} from "@/modules/units/service";
import { approveUser } from "@/modules/users/service";
import { saveBuilding } from "@/modules/building/service";
import { assignBoard, endBoard } from "@/modules/board/service";
import { saveUnitContact } from "@/modules/units/contacts";
import { audit } from "@/modules/audit/service";
export type ActionResult = { ok: boolean; message: string };
export async function manageAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireManager();
  await assertOrigin();
  try {
    const operation = z
      .enum([
        "unit",
        "unit-contact",
        "approval",
        "membership",
        "membership-end",
        "billing",
        "board",
        "board-end",
        "building",
      ])
      .parse(form.get("operation"));
    const value = (key: string) => String(form.get(key) || "");
    switch (operation) {
      case "unit-contact":
        await saveUnitContact(actor, {
          unitId: value("unitId"),
          kind: value("kind"),
          name: value("name"),
          phone: value("phone"),
          approveAccess: form.has("approveAccess"),
        });
        break;
      case "unit":
        await saveUnit(
          actor,
          unitSchema.parse({
            id: value("id") || undefined,
            number: value("number"),
            floor: value("floor"),
            occupancy: value("occupancy"),
            active: form.has("active"),
          }),
        );
        break;
      case "approval":
        await approveUser(
          actor,
          z.uuid().parse(value("userId")),
          z.enum(["APPROVED", "SUSPENDED"]).parse(value("status")),
        );
        break;
      case "membership":
        await assignMember(actor, {
          unitId: value("unitId"),
          userId: value("userId"),
          kind: value("kind"),
        });
        break;
      case "membership-end":
        await endMember(actor, value("id"));
        break;
      case "billing":
        await assignBilling(actor, value("unitId"), value("membershipId"));
        break;
      case "board":
        await requireSuperAdmin();
        await assignBoard(actor, {
          userId: value("userId"),
          title: value("title"),
        });
        break;
      case "board-end":
        await requireSuperAdmin();
        await endBoard(actor, value("id"));
        break;
      case "building":
        await requireSuperAdmin();
        await saveBuilding(actor, {
          name: value("name"),
          address: value("address"),
        });
        break;
    }
    revalidatePath("/management", "layout");
    revalidatePath("/home");
    revalidatePath("/units");
    return { ok: true, message: "تغییرات با موفقیت ثبت شد." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof DomainError
          ? error.message
          : error instanceof z.ZodError
            ? "اطلاعات فرم معتبر نیست."
            : "ثبت تغییر انجام نشد؛ داده‌ها یا تداخل سوابق را بررسی کنید.",
    };
  }
}
export async function profileAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  await assertOrigin();
  const parsed = profileSchema.safeParse({ name: form.get("name") });
  if (!parsed.success)
    return { ok: false, message: "نام و نام خانوادگی را کامل وارد کنید." };
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: parsed.data });
    await audit("profile.update", user.id, user.id, {}, tx);
  });
  revalidatePath("/profile");
  return { ok: true, message: "اطلاعات ذخیره شد." };
}
export async function logout() {
  await assertOrigin();
  const cookie = await cookies();
  const token = cookie.get(cookieName)?.value;
  if (token) {
    const session = await db.session.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (session) {
      await db.$transaction(async (tx) => {
        await tx.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        await audit("auth.logout", session.userId, session.id, {}, tx);
      });
    }
  }
  cookie.delete(cookieName);
  redirect("/login");
}
export async function revokeSessions() {
  const user = await requireUser();
  await assertOrigin();
  await db.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit("auth.sessions.revoke", user.id, user.id, {}, tx);
  });
  (await cookies()).delete(cookieName);
  redirect("/login");
}
