// Server-only configuration: never export this flag through NEXT_PUBLIC_*.
export function fixedOtpEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_FIXED_OTP_ENABLED === "true"
  );
}
export function acceptsDevelopmentOtp(code: string) {
  return fixedOtpEnabled() && code === "1234";
}
