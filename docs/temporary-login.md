# Temporary owner login

The development OTP flag remains development-only. A separate explicit production exception can authorize one canonical Iranian phone number for at most 24 hours. It is disabled by default and is never exposed through client configuration.

Configure server-only Vercel Secrets: `TEMP_LOGIN_PHONE`, `TEMP_LOGIN_STARTS_AT` and `TEMP_LOGIN_EXPIRES_AT` (UTC ISO timestamps), then `TEMP_LOGIN_ENABLED=true`. The duration must be positive and no longer than 24 hours; future, expired, malformed or disabled configurations fail closed. Configure this only for the account explicitly authorized by its owner. Do not commit phone numbers or environment values.

During that window, requesting an OTP for the configured account creates the existing random hashed challenge without calling SMS. Verification accepts the explicitly agreed temporary code only for that phone and challenges created after the window began. Existing five-minute expiration, attempt limits, cooldown, rate limits, replay prevention, suspension and approval checks remain. Temporary sessions expire at the same absolute end time. No user is approved or granted a role automatically.

All other accounts continue using the existing SMS provider. The nine event templates and mappings are unchanged. Audit records identify temporary requests/logins without recording codes or raw phones. No fixed code is persisted as a credential.

Disable `TEMP_LOGIN_ENABLED` to prevent new temporary logins; already issued sessions retain their hard end time and can be revoked through existing session controls. Do not use this exception as a permanent production authentication method. After verified production SMS is configured, remove the temporary environment variables.
