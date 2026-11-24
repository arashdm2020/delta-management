BEGIN;
-- Preserve legacy provider settings. Only OTP has an unambiguous variable migration.
CREATE FUNCTION delta_sms_mapping_valid(event TEXT, mapping JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE required TEXT[]; name TEXT;
BEGIN
 required := CASE event
WHEN 'auth.otp' THEN ARRAY['code']
WHEN 'billing.invoice.issued' THEN ARRAY['period','unit','amount','due_date']
WHEN 'billing.invoice.reminder' THEN ARRAY['unit','amount','due_date']
WHEN 'billing.invoice.overdue' THEN ARRAY['unit','amount','due_date']
WHEN 'billing.payment.confirmed' THEN ARRAY['unit','amount','receipt']
WHEN 'meeting.invitation' THEN ARRAY['title','date','time','location']
WHEN 'meeting.reminder' THEN ARRAY['title','date','time']
WHEN 'ticket.status.changed' THEN ARRAY['ticket','status']
WHEN 'announcement.emergency' THEN ARRAY['message']
 ELSE NULL END;
 IF required IS NULL OR jsonb_typeof(mapping)<>'object' THEN RETURN false; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(mapping)) <> cardinality(required) THEN RETURN false; END IF;
 FOREACH name IN ARRAY required LOOP
  IF NOT mapping ? name OR jsonb_typeof(mapping->name)<>'string' OR (mapping->>name) !~ '^[a-zA-Z][a-zA-Z0-9_]{0,39}$' THEN RETURN false; END IF;
 END LOOP;
 RETURN (SELECT count(DISTINCT value) FROM jsonb_each_text(mapping))=cardinality(required);
END $$;
CREATE TABLE "SmsEventTemplate" (
 "eventKey" VARCHAR(80) PRIMARY KEY, "patternName" VARCHAR(80) NOT NULL UNIQUE,
 "providerCode" VARCHAR(100), "enabled" BOOLEAN NOT NULL DEFAULT false,
 "variableMapping" JSONB NOT NULL CHECK(jsonb_typeof("variableMapping")='object'),
 "category" VARCHAR(30) NOT NULL, "description" VARCHAR(500) NOT NULL,
 "updatedById" UUID REFERENCES "User"(id) ON DELETE RESTRICT,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CHECK ("eventKey" IN ('auth.otp','billing.invoice.issued','billing.invoice.reminder','billing.invoice.overdue','billing.payment.confirmed','meeting.invitation','meeting.reminder','ticket.status.changed','announcement.emergency')),
 CHECK ("providerCode" IS NULL OR "providerCode" ~ '^[a-zA-Z0-9_-]{1,100}$'),
 CHECK (NOT enabled OR ("providerCode" IS NOT NULL AND delta_sms_mapping_valid("eventKey", "variableMapping")))
);
CREATE INDEX "SmsEventTemplate_category_enabled_idx" ON "SmsEventTemplate"(category,enabled);
CREATE TABLE "SmsReminderPolicy" (
 "key" VARCHAR(20) PRIMARY KEY CHECK(key='default'),
 "beforeDueDays" INTEGER NOT NULL DEFAULT 3 CHECK("beforeDueDays" BETWEEN 1 AND 30),
 "overdueDays" INTEGER NOT NULL DEFAULT 2 CHECK("overdueDays" BETWEEN 1 AND 30),
 "followupDays" INTEGER DEFAULT 7 CHECK("followupDays" IS NULL OR ("followupDays">"overdueDays" AND "followupDays"<=90)),
 "meetingHours" INTEGER NOT NULL DEFAULT 24 CHECK("meetingHours" BETWEEN 1 AND 168),
 "updatedById" UUID REFERENCES "User"(id) ON DELETE RESTRICT,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
INSERT INTO "SmsReminderPolicy"(key,"updatedAt") VALUES('default',now());
INSERT INTO "SmsEventTemplate"("eventKey","patternName","category","variableMapping","description","updatedAt") VALUES('auth.otp','delta_login','security','{"code": "code"}','delta_login',now());
INSERT INTO "SmsEventTemplate"("eventKey","patternName","category","variableMapping","description","updatedAt") VALUES('billing.invoice.issued','delta_charge_issued','financial','{"period": "period", "unit": "unit", "amount": "amount", "due_date": "due_date"}','delta_charge_issued',now());
INSERT INTO "SmsEventTemplate"("eventKey","patternName","category","variableMapping","description","updatedAt") VALUES('billing.invoice.reminder','delta_charge_reminder','financial','{"unit": "unit", "amount": "amount", "due_date": "due_date"}','delta_charge_reminder',now());
INSERT INTO "SmsEventTemplate"("eventKey","patternName","category","variableMapping","description","updatedAt") VALUES('billing.invoice.overdue','delta_charge_overdue','financial','{"unit": "unit", "amount": "amount", "due_date": "due_date"}','delta_charge_overdue',now());
INSERT INTO "SmsEventTemplate"("eventKey","patternName","category","variableMapping","description","updatedAt") VALUES('billing.payment.confirmed','delta_payment_success','financial','{"unit": "unit", "amount": "amount", "receipt": "receipt"}','delta_payment_success',now());
INSERT INTO "SmsEventTemplate"("eventKey","patternName","category","variableMapping","description","updatedAt") VALUES('meeting.invitation','delta_meeting_invite','meetings','{"title": "title", "date": "date", "time": "time", "location": "location"}','delta_meeting_invite',now());
INSERT INTO "SmsEventTemplate"("eventKey","patternName","category","variableMapping","description","updatedAt") VALUES('meeting.reminder','delta_meeting_reminder','meetings','{"title": "title", "date": "date", "time": "time"}','delta_meeting_reminder',now());
INSERT INTO "SmsEventTemplate"("eventKey","patternName","category","variableMapping","description","updatedAt") VALUES('ticket.status.changed','delta_ticket_update','tickets','{"ticket": "ticket", "status": "status"}','delta_ticket_update',now());
INSERT INTO "SmsEventTemplate"("eventKey","patternName","category","variableMapping","description","updatedAt") VALUES('announcement.emergency','delta_urgent_alert','operational','{"message": "message"}','delta_urgent_alert',now());
UPDATE "SmsEventTemplate" t SET "providerCode"=s.patterns->'OTP'->>'code', "variableMapping"=jsonb_build_object('code',s.patterns->'OTP'->>'variable'), enabled=s.enabled, "updatedById"=s."updatedById", "updatedAt"=now()
FROM "SmsProviderSetting" s WHERE t."eventKey"='auth.otp' AND s.key='farazsms'
AND s.patterns->'OTP'->>'code' ~ '^[a-zA-Z0-9_-]{1,100}$' AND s.patterns->'OTP'->>'variable' ~ '^[a-zA-Z][a-zA-Z0-9_]{0,39}$';

ALTER TABLE "SmsDelivery" ADD COLUMN "dispatchKey" VARCHAR(64) UNIQUE;
ALTER TABLE "SmsDelivery" ADD COLUMN "eventKey" VARCHAR(80) REFERENCES "SmsEventTemplate"("eventKey") ON DELETE RESTRICT;
CREATE INDEX "SmsDelivery_eventKey_idx" ON "SmsDelivery"("eventKey");
CREATE FUNCTION delta_sms_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD."eventKey" IS NOT NULL AND NEW."eventKey" IS DISTINCT FROM OLD."eventKey" THEN RAISE EXCEPTION 'SMS event identity is immutable'; END IF;
 IF OLD."dispatchKey" IS NOT NULL AND NEW."dispatchKey" IS DISTINCT FROM OLD."dispatchKey" THEN RAISE EXCEPTION 'SMS dispatch identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sms_event_identity BEFORE UPDATE ON "SmsDelivery" FOR EACH ROW EXECUTE FUNCTION delta_sms_event_guard();

-- Permit binding the newly added event once while retaining every prior identity/terminal guard.
CREATE OR REPLACE FUNCTION delta_sms_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'providerMessageId'-'eventKey'-'dispatchKey') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'providerMessageId'-'eventKey'-'dispatchKey') OR OLD.status IN ('ACCEPTED','SIMULATED','SKIPPED','FAILED','UNKNOWN') THEN RAISE EXCEPTION 'SMS target and terminal outcome immutable'; END IF; RETURN NEW; END; $$;

COMMIT;
