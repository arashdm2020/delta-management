import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32)
    throw new Error("AUTH_SECRET configuration missing");
  return value;
}
export const otpHash = (id: string, code: string) =>
  createHmac("sha256", secret())
    .update(id + ":" + code)
    .digest("hex");
export const randomOtp = () =>
  randomInt(0, 1000000).toString().padStart(6, "0");
export const randomToken = () => randomBytes(32).toString("base64url");
export function equalHash(a: string, b: string) {
  return (
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export const otpValid = (
  c: { attempts: number; expiresAt: Date; consumedAt: Date | null },
  now = new Date(),
) => !c.consumedAt && c.expiresAt > now && c.attempts < 5;
export const sessionValid = (
  s: { expiresAt: Date; revokedAt: Date | null },
  now = new Date(),
) => !s.revokedAt && s.expiresAt > now;
export type Actor = {
  id: string;
  status: string;
  roles: { role: { name: string } }[];
};
export const hasRole = (u: Actor, role: string) =>
  u.status === "APPROVED" && u.roles.some((r) => r.role.name === role);
export const canManage = (u: Actor) =>
  hasRole(u, "SUPER_ADMIN") || hasRole(u, "BOARD_MEMBER");
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (message: string): never => {
  throw new DomainError("INVALID", message);
};
