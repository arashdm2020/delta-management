export class SmsProviderError extends Error {
  constructor(code: string, public readonly httpStatus: number | null = null, public readonly stage: string = "provider") {
    super(code);
  }
}
const codes = new Set(["UNCONFIGURED", "SENDER_UNCONFIRMED", "SENDER_UNAVAILABLE", "PATTERN_DISABLED", "SMS_MAPPING_INVALID", "TRANSIENT", "UNKNOWN", "PROVIDER_REJECTED"]);
// Never log arbitrary error messages, request payloads or provider response bodies.
export function smsFailureDiagnostic(error: unknown) {
  return {
    reason: error instanceof Error && codes.has(error.message) ? error.message : "SMS_SEND_ERROR",
    httpStatus: error instanceof SmsProviderError ? error.httpStatus : null,
    stage: error instanceof SmsProviderError ? error.stage : "configuration_or_send",
  };
}
