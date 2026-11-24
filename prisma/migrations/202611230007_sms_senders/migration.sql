BEGIN;
ALTER TABLE "SmsProviderSetting" ADD COLUMN "senderSource" VARCHAR(20) CHECK("senderSource" IS NULL OR "senderSource" IN ('DISCOVERED','MANUAL')), ADD COLUMN "senderPatternConfirmed" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "senderLines" JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof("senderLines")='array'), ADD COLUMN "senderKeyHash" VARCHAR(64), ADD COLUMN "senderCheckedAt" TIMESTAMPTZ(3);
-- Retain legacy sender text; it is never sent by the new adapter without verified discovery.
DO $$ DECLARE check_name TEXT; BEGIN
 FOR check_name IN SELECT conname FROM pg_constraint WHERE conrelid='"SmsProviderSetting"'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%fromNumber%' LOOP
  EXECUTE format('ALTER TABLE "SmsProviderSetting" DROP CONSTRAINT %I',check_name);
 END LOOP;
END $$;
ALTER TABLE "SmsProviderSetting" ADD CONSTRAINT sms_sender_configuration CHECK (
 NOT enabled OR COALESCE(("encryptedApiKey" IS NOT NULL AND (
 ("senderSource" IS NULL AND "senderKeyHash" IS NULL AND "fromNumber" ~ '^\+98[0-9]{3,17}$') OR
 ("senderSource" IN ('DISCOVERED','MANUAL') AND "senderKeyHash" IS NOT NULL AND "senderKeyHash" ~ '^[a-f0-9]{64}$' AND "senderCheckedAt" IS NOT NULL AND "fromNumber" ~ '^[0-9]{3,20}$' AND "senderPatternConfirmed" AND (("senderSource"='DISCOVERED' AND "senderLines" @> jsonb_build_array("fromNumber")) OR "senderSource"='MANUAL'))
 )),false)
);
COMMIT;
