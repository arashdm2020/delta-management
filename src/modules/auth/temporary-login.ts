// Explicit, account-scoped production exception; independent of development OTP.
// Never serialize this configuration or its phone number to the browser.
export function temporaryLoginWindow(phone: string, now = new Date()) {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.TEMP_LOGIN_ENABLED !== "true" ||
    !/^\+989[0-9]{9}$/.test(process.env.TEMP_LOGIN_PHONE || "") ||
    phone !== process.env.TEMP_LOGIN_PHONE
  ) return null;
  const startsAt = new Date(process.env.TEMP_LOGIN_STARTS_AT || "");
  const expiresAt = new Date(process.env.TEMP_LOGIN_EXPIRES_AT || "");
  const duration = expiresAt.getTime() - startsAt.getTime();
  if (
    !Number.isFinite(duration) || duration <= 0 || duration > 24 * 3600000 ||
    now < startsAt || now >= expiresAt
  ) return null;
  return { startsAt, expiresAt };
}

export function temporaryOtpExpiry(
  phone: string, code: string, challengeCreatedAt: Date, now = new Date(),
) {
  const window = temporaryLoginWindow(phone, now);
  return code === "1234" && window && challengeCreatedAt >= window.startsAt &&
    challengeCreatedAt <= now
    ? window.expiresAt : null;
}
