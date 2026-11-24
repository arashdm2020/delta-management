export type SenderPublicView = {
  enabled: boolean;
  hasApiKey: boolean;
  fromNumber: string;
  lines: string[];
  source: string;
  patternConfirmed: boolean;
  revision: string;
  checkedAt: string | null;
  legacyConfigured: boolean;
};
export type SmsActionResult = {
  ok: boolean;
  message: string;
  provider?: SenderPublicView;
};
