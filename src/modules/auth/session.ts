import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  canManage,
  hasRole,
  hashToken,
  sessionValid,
} from "@/lib/security/core";
export const cookieName = "delta_session";
export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });
  return session && sessionValid(session) && session.user.status !== "SUSPENDED"
    ? session.user
    : null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
export async function requireApproved() {
  const user = await requireUser();
  if (!user.name) redirect("/complete");
  if (user.status !== "APPROVED") redirect("/pending");
  if (
    !canManage(user) &&
    !(await db.unitMembership.findFirst({
      where: {
        userId: user.id,
        endsAt: null,
        startsAt: { lte: new Date() },
        unit: { active: true },
      },
    }))
  )
    redirect("/pending");
  return user;
}
export async function requireManager() {
  const user = await requireApproved();
  if (!canManage(user)) redirect("/unauthorized");
  return user;
}
export async function requireSuperAdmin() {
  const user = await requireManager();
  if (!hasRole(user, "SUPER_ADMIN")) redirect("/unauthorized");
  return user;
}
