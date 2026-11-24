import { headers } from "next/headers";
import { DomainError } from "@/lib/security/core";
export async function assertOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const expected = process.env.APP_ORIGIN;
  if (!expected || origin !== new URL(expected).origin)
    throw new DomainError("CSRF", "درخواست معتبر نیست.");
}
export async function requestOrigin() {
  const h = await headers();
  return process.env.TRUST_PROXY === "true"
    ? h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    : "local-untrusted";
}
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
