BEGIN;
-- CreateTable
CREATE TABLE "ChargePolicy" (
    "id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "previousAmount" BIGINT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "reason" VARCHAR(500) NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChargePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPeriod" (
    "id" UUID NOT NULL,
    "key" VARCHAR(7) NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "responsibilityId" UUID NOT NULL,
    "responsibleId" UUID NOT NULL,
    "responsibleName" VARCHAR(100) NOT NULL,
    "unitNumber" VARCHAR(30) NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(500),
    "actorId" UUID NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "authority" VARCHAR(200),
    "providerTransactionId" VARCHAR(200),
    "amount" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'CREATING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockPayment" (
    "id" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "authority" VARCHAR(200) NOT NULL,
    "amount" BIGINT NOT NULL,
    "outcome" VARCHAR(30) NOT NULL DEFAULT 'WAITING',
    "availableAt" TIMESTAMPTZ(3),
    "transactionId" VARCHAR(200) NOT NULL,

    CONSTRAINT "MockPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" UUID NOT NULL,
    "source" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "reversalOfId" UUID,
    "actorId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "accountCode" VARCHAR(30) NOT NULL,
    "debit" BIGINT NOT NULL DEFAULT 0,
    "credit" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "accountCode" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "payee" VARCHAR(200) NOT NULL,
    "amount" BIGINT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseDocument" (
    "id" UUID NOT NULL,
    "expenseId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalance" (
    "id" UUID NOT NULL,
    "financialAccountId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "actorId" UUID NOT NULL,

    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "financialAccountId" UUID NOT NULL,
    "reference" VARCHAR(200) NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "settledAt" TIMESTAMPTZ(3) NOT NULL,
    "actorId" UUID NOT NULL,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxJob" (
    "id" UUID NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChargePolicy_startsAt_key" ON "ChargePolicy"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPeriod_key_key" ON "BillingPeriod"("key");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPeriod_startsAt_key" ON "BillingPeriod"("startsAt");

-- CreateIndex
CREATE INDEX "Invoice_responsibleId_issuedAt_idx" ON "Invoice"("responsibleId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_unitId_periodId_key" ON "Invoice"("unitId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_authority_key" ON "PaymentIntent"("authority");

-- CreateIndex
CREATE INDEX "PaymentIntent_invoiceId_status_idx" ON "PaymentIntent"("invoiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_provider_providerTransactionId_key" ON "PaymentIntent"("provider", "providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_intentId_key" ON "PaymentAllocation"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "MockPayment_intentId_key" ON "MockPayment"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "MockPayment_authority_key" ON "MockPayment"("authority");

-- CreateIndex
CREATE UNIQUE INDEX "MockPayment_transactionId_key" ON "MockPayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_source_key" ON "JournalEntry"("source");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalLine_accountCode_idx" ON "JournalLine"("accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_accountCode_key" ON "FinancialAccount"("accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalance_financialAccountId_key" ON "OpeningBalance"("financialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_intentId_key" ON "Reconciliation"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_reference_key" ON "Reconciliation"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxJob_key_key" ON "OutboxJob"("key");

-- CreateIndex
CREATE INDEX "OutboxJob_status_availableAt_idx" ON "OutboxJob"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountCode_fkey" FOREIGN KEY ("accountCode") REFERENCES "Account"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseDocument" ADD CONSTRAINT "ExpenseDocument_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 2 invariants: immediate locks plus deferred checks at the posting boundary.
ALTER TABLE "ChargePolicy" ADD CONSTRAINT policy_amount CHECK(amount>0 AND ("previousAmount" IS NULL OR "previousAmount">0)), ADD CONSTRAINT policy_period CHECK("endsAt" IS NULL OR "endsAt">"startsAt"), ADD CONSTRAINT policy_no_overlap EXCLUDE USING gist(tstzrange("startsAt","endsAt",'[)') WITH &&), ADD FOREIGN KEY("actorId") REFERENCES "User"(id);
ALTER TABLE "BillingPeriod" ADD CONSTRAINT period_dates CHECK("endsAt">"startsAt" AND "dueAt">="startsAt" AND "dueAt"<="endsAt"), ADD CONSTRAINT period_no_overlap EXCLUDE USING gist(tstzrange("startsAt","endsAt",'[)') WITH &&);
ALTER TABLE "Invoice" ADD FOREIGN KEY("unitId") REFERENCES "Unit"(id), ADD FOREIGN KEY("periodId") REFERENCES "BillingPeriod"(id), ADD FOREIGN KEY("policyId") REFERENCES "ChargePolicy"(id), ADD FOREIGN KEY("responsibilityId") REFERENCES "BillingResponsibility"(id), ADD FOREIGN KEY("responsibleId") REFERENCES "User"(id), ADD FOREIGN KEY("actorId") REFERENCES "User"(id), ADD CONSTRAINT invoice_amount CHECK(amount>0), ADD CONSTRAINT invoice_status CHECK(status IN ('ISSUED','CANCELLED') AND ((status='CANCELLED')=("cancelledAt" IS NOT NULL)));
ALTER TABLE "InvoiceItem" ADD CHECK(amount>0);
ALTER TABLE "PaymentIntent" ADD FOREIGN KEY("actorId") REFERENCES "User"(id), ADD CHECK(amount>0), ADD CHECK(status IN ('CREATING','PENDING','RETRY','VERIFIED','FAILED','CANCELLED')), ADD CHECK((status='VERIFIED')=("verifiedAt" IS NOT NULL)), ADD CHECK(status<>'VERIFIED' OR "providerTransactionId" IS NOT NULL);
CREATE UNIQUE INDEX one_live_payment_intent ON "PaymentIntent"("invoiceId") WHERE status IN ('CREATING','PENDING','RETRY');
ALTER TABLE "PaymentAllocation" ADD CHECK(amount>0);
ALTER TABLE "MockPayment" ADD FOREIGN KEY("intentId") REFERENCES "PaymentIntent"(id), ADD CHECK(amount>0), ADD CHECK(outcome IN ('WAITING','SUCCESS','FAILED','CANCELLED','DELAYED','VERIFY_FAILURE'));
ALTER TABLE "Account" ADD CHECK(kind IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'));
ALTER TABLE "JournalEntry" ADD FOREIGN KEY("actorId") REFERENCES "User"(id), ADD FOREIGN KEY("reversalOfId") REFERENCES "JournalEntry"(id), ADD CHECK(status IN ('DRAFT','POSTED')), ADD CHECK("reversalOfId" IS DISTINCT FROM id);
ALTER TABLE "JournalLine" ADD CHECK(debit>=0 AND credit>=0 AND ((debit>0 AND credit=0) OR (credit>0 AND debit=0)));
ALTER TABLE "FinancialAccount" ADD FOREIGN KEY("accountCode") REFERENCES "Account"(code);
ALTER TABLE "Expense" ADD FOREIGN KEY("categoryId") REFERENCES "ExpenseCategory"(id), ADD FOREIGN KEY("actorId") REFERENCES "User"(id), ADD CHECK(amount>0), ADD CHECK(status IN ('DRAFT','POSTED','PAID','REVERSED'));
ALTER TABLE "ExpenseDocument" ADD CHECK(octet_length(content)<=2097152 AND mime IN ('application/pdf','image/png','image/jpeg'));
ALTER TABLE "OpeningBalance" ADD FOREIGN KEY("financialAccountId") REFERENCES "FinancialAccount"(id), ADD FOREIGN KEY("actorId") REFERENCES "User"(id), ADD CHECK(amount>0);
ALTER TABLE "Reconciliation" ADD FOREIGN KEY("financialAccountId") REFERENCES "FinancialAccount"(id), ADD FOREIGN KEY("intentId") REFERENCES "PaymentIntent"(id), ADD FOREIGN KEY("actorId") REFERENCES "User"(id), ADD CHECK(amount>0 AND fee>=0 AND fee<=amount);
ALTER TABLE "OutboxJob" ADD CHECK(attempts>=0 AND status IN ('PENDING','RUNNING','DONE'));

CREATE FUNCTION delta_financial_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Financial history is immutable; post a reversal'; END; $$;
CREATE TRIGGER allocation_immutable BEFORE UPDATE OR DELETE ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION delta_financial_immutable();
CREATE TRIGGER period_immutable BEFORE UPDATE OR DELETE ON "BillingPeriod" FOR EACH ROW EXECUTE FUNCTION delta_financial_immutable();
CREATE TRIGGER opening_immutable BEFORE UPDATE OR DELETE ON "OpeningBalance" FOR EACH ROW EXECUTE FUNCTION delta_financial_immutable();
CREATE TRIGGER reconciliation_immutable BEFORE UPDATE OR DELETE ON "Reconciliation" FOR EACH ROW EXECUTE FUNCTION delta_financial_immutable();
CREATE TRIGGER account_immutable BEFORE UPDATE OR DELETE ON "Account" FOR EACH ROW EXECUTE FUNCTION delta_financial_immutable();
CREATE TRIGGER financial_account_immutable BEFORE UPDATE OR DELETE ON "FinancialAccount" FOR EACH ROW EXECUTE FUNCTION delta_financial_immutable();
CREATE FUNCTION delta_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Policy history retained'; END IF;
 IF OLD."endsAt" IS NOT NULL OR NEW."endsAt" IS NULL OR (to_jsonb(NEW)-'endsAt') IS DISTINCT FROM (to_jsonb(OLD)-'endsAt') THEN RAISE EXCEPTION 'Only close an open policy'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER policy_history BEFORE UPDATE OR DELETE ON "ChargePolicy" FOR EACH ROW EXECUTE FUNCTION delta_policy_guard();
CREATE FUNCTION delta_journal_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status='POSTED' THEN RAISE EXCEPTION 'Posted journal is immutable'; END IF;
 IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Journal identity is immutable'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER journal_immutable BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION delta_journal_guard();
CREATE FUNCTION delta_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE e "JournalEntry"; BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Journal lines are immutable'; END IF;
 SELECT * INTO e FROM "JournalEntry" WHERE id=NEW."entryId" FOR UPDATE;
 IF e.status<>'DRAFT' THEN RAISE EXCEPTION 'Cannot append to posted journal'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER line_immutable BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION delta_line_guard();
CREATE FUNCTION delta_journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE e "JournalEntry"; d NUMERIC; c NUMERIC; n BIGINT; BEGIN
 SELECT * INTO e FROM "JournalEntry" WHERE id=NEW.id;
 SELECT COALESCE(sum(debit),0),COALESCE(sum(credit),0),count(*) INTO d,c,n FROM "JournalLine" WHERE "entryId"=e.id;
 IF e.status<>'POSTED' OR d<>c OR d<=0 OR n<2 THEN RAISE EXCEPTION 'Journal must be posted and balanced at commit'; END IF;
 IF e."reversalOfId" IS NOT NULL AND EXISTS(
  SELECT 1 FROM (
   SELECT "accountCode",sum(debit) d,sum(credit) c FROM "JournalLine" WHERE "entryId"=e."reversalOfId" GROUP BY "accountCode"
  ) original FULL JOIN (
   SELECT "accountCode",sum(debit) d,sum(credit) c FROM "JournalLine" WHERE "entryId"=e.id GROUP BY "accountCode"
  ) reversal USING("accountCode") WHERE COALESCE(original.d,0)<>COALESCE(reversal.c,0) OR COALESCE(original.c,0)<>COALESCE(reversal.d,0)
 ) THEN RAISE EXCEPTION 'Reversal must exactly invert original accounts'; END IF;
 IF e."reversalOfId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "JournalEntry" WHERE id=e."reversalOfId" AND status='POSTED' AND "reversalOfId" IS NULL) THEN RAISE EXCEPTION 'Invalid reversal target'; END IF;
 RETURN NULL; END; $$;
CREATE CONSTRAINT TRIGGER journal_balance AFTER INSERT OR UPDATE ON "JournalEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION delta_journal_balanced();
CREATE FUNCTION delta_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Invoices retained'; END IF;
 IF TG_OP='INSERT' AND NOT EXISTS(
  SELECT 1 FROM "BillingResponsibility" r JOIN "BillingPeriod" b ON b.id=NEW."periodId" JOIN "ChargePolicy" p ON p.id=NEW."policyId"
  WHERE r.id=NEW."responsibilityId" AND r."unitId"=NEW."unitId" AND r."userId"=NEW."responsibleId" AND r."startsAt"<=b."startsAt" AND (r."endsAt" IS NULL OR r."endsAt">b."startsAt") AND p."startsAt"<=b."startsAt" AND (p."endsAt" IS NULL OR p."endsAt">b."startsAt") AND p.amount=NEW.amount
 ) THEN RAISE EXCEPTION 'Invoice must snapshot effective policy and responsibility'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status<>'ISSUED' OR NEW.status<>'CANCELLED' OR (to_jsonb(NEW)-'status'-'cancelledAt'-'cancellationReason') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'cancelledAt'-'cancellationReason') THEN RAISE EXCEPTION 'Invoice snapshot immutable'; END IF;
  IF EXISTS(SELECT 1 FROM "PaymentAllocation" WHERE "invoiceId"=OLD.id) OR EXISTS(SELECT 1 FROM "PaymentIntent" WHERE "invoiceId"=OLD.id AND status IN ('CREATING','PENDING','RETRY')) THEN RAISE EXCEPTION 'Paid or pending invoice cannot be cancelled'; END IF;
 END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER invoice_history BEFORE UPDATE OR DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION delta_invoice_guard();
CREATE FUNCTION delta_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' OR EXISTS(SELECT 1 FROM "JournalEntry" WHERE source='invoice:'||NEW."invoiceId"::text) THEN RAISE EXCEPTION 'Issued items immutable'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER item_history BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceItem" FOR EACH ROW EXECUTE FUNCTION delta_item_guard();
CREATE FUNCTION delta_invoice_posted() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE i "Invoice"; BEGIN
 SELECT * INTO i FROM "Invoice" WHERE id=NEW.id;
 IF (SELECT COALESCE(sum(amount),0) FROM "InvoiceItem" WHERE "invoiceId"=i.id)<>i.amount OR NOT EXISTS(SELECT 1 FROM "JournalEntry" WHERE source='invoice:'||i.id::text AND status='POSTED') THEN RAISE EXCEPTION 'Invoice requires matching items and journal'; END IF;
 IF i.status='CANCELLED' AND NOT EXISTS(SELECT 1 FROM "JournalEntry" WHERE source='invoice-cancel:'||i.id::text AND status='POSTED') THEN RAISE EXCEPTION 'Cancellation requires reversal'; END IF;
 RETURN NULL; END; $$;
CREATE CONSTRAINT TRIGGER invoice_posted AFTER INSERT OR UPDATE ON "Invoice" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION delta_invoice_posted();
CREATE FUNCTION delta_intent_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment history retained'; END IF;
 IF OLD.status IN ('VERIFIED','FAILED','CANCELLED') OR (to_jsonb(NEW)-'status'-'authority'-'providerTransactionId'-'verifiedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'authority'-'providerTransactionId'-'verifiedAt') OR (OLD.authority IS NOT NULL AND NEW.authority IS DISTINCT FROM OLD.authority) THEN RAISE EXCEPTION 'Payment identity immutable'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER intent_history BEFORE UPDATE OR DELETE ON "PaymentIntent" FOR EACH ROW EXECUTE FUNCTION delta_intent_guard();
CREATE FUNCTION delta_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE i "Invoice"; p "PaymentIntent"; BEGIN
 SELECT * INTO i FROM "Invoice" WHERE id=NEW."invoiceId" FOR UPDATE;
 SELECT * INTO p FROM "PaymentIntent" WHERE id=NEW."intentId" FOR UPDATE;
 IF p.status<>'VERIFIED' OR p."invoiceId"<>i.id OR i.status<>'ISSUED' OR NEW.amount+(SELECT COALESCE(sum(amount),0) FROM "PaymentAllocation" WHERE "intentId"=p.id)>p.amount OR NEW.amount+(SELECT COALESCE(sum(amount),0) FROM "PaymentAllocation" WHERE "invoiceId"=i.id)>i.amount+(SELECT COALESCE(sum(amount),0) FROM "InvoiceCorrection" WHERE "invoiceId"=i.id) THEN RAISE EXCEPTION 'Invalid or excessive allocation'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER allocation_limit BEFORE INSERT ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION delta_allocation_guard();
CREATE FUNCTION delta_verified_posted() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE p "PaymentIntent"; BEGIN
 SELECT * INTO p FROM "PaymentIntent" WHERE id=NEW.id;
 IF p.status='VERIFIED' AND ((SELECT COALESCE(sum(amount),0) FROM "PaymentAllocation" WHERE "intentId"=p.id)<>p.amount OR NOT EXISTS(SELECT 1 FROM "JournalEntry" WHERE source='payment:'||p.id::text AND status='POSTED')) THEN RAISE EXCEPTION 'Verified payment requires allocation and journal'; END IF;
 RETURN NULL; END; $$;
CREATE CONSTRAINT TRIGGER verified_posted AFTER INSERT OR UPDATE ON "PaymentIntent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION delta_verified_posted();
CREATE FUNCTION delta_expense_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Expense history retained'; END IF;
 IF OLD.status<>'DRAFT' AND ((to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR NOT ((OLD.status='POSTED' AND NEW.status IN ('PAID','REVERSED')) OR (OLD.status='PAID' AND NEW.status='REVERSED'))) THEN RAISE EXCEPTION 'Posted expense immutable'; END IF;
 IF OLD.status='DRAFT' AND NEW.status NOT IN ('DRAFT','POSTED') THEN RAISE EXCEPTION 'Invalid expense transition'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER expense_history BEFORE UPDATE OR DELETE ON "Expense" FOR EACH ROW EXECUTE FUNCTION delta_expense_guard();
CREATE FUNCTION delta_document_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' OR (SELECT status FROM "Expense" WHERE id=NEW."expenseId")<>'DRAFT' THEN RAISE EXCEPTION 'Posted attachments immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER document_history BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseDocument" FOR EACH ROW EXECUTE FUNCTION delta_document_guard();

INSERT INTO "Account"(code,name,kind) VALUES
 ('AR','حساب‌های دریافتنی','ASSET'),('REVENUE','درآمد شارژ','REVENUE'),('CLEARING','وجوه در انتظار تسویه','ASSET'),('BANK','بانک ساختمان','ASSET'),('AP','حساب‌های پرداختنی','LIABILITY'),('EXPENSE','هزینه‌های ساختمان','EXPENSE'),('FEES','کارمزد درگاه','EXPENSE'),('EQUITY','مانده ابتدای دوره','EQUITY');
INSERT INTO "FinancialAccount"(id,name,"accountCode") VALUES(gen_random_uuid(),'بانک ساختمان','BANK');
INSERT INTO "ExpenseCategory"(id,name) SELECT gen_random_uuid(),name FROM unnest(ARRAY['حقوق نگهبان','برق','آسانسور','نظافت','تعمیرات','لوازم ساختمان','سایر']) name;

CREATE TABLE "InvoiceCorrection" (id UUID PRIMARY KEY, "invoiceId" UUID NOT NULL REFERENCES "Invoice"(id), amount BIGINT NOT NULL CHECK(amount<>0), reason VARCHAR(500) NOT NULL, "actorId" UUID NOT NULL REFERENCES "User"(id), "requestKey" VARCHAR(100) NOT NULL UNIQUE, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER correction_immutable BEFORE UPDATE OR DELETE ON "InvoiceCorrection" FOR EACH ROW EXECUTE FUNCTION delta_financial_immutable();
CREATE FUNCTION delta_correction_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE i "Invoice"; total NUMERIC; BEGIN
 SELECT * INTO i FROM "Invoice" WHERE id=NEW."invoiceId" FOR UPDATE;
 total=i.amount+NEW.amount+(SELECT COALESCE(sum(amount),0) FROM "InvoiceCorrection" WHERE "invoiceId"=i.id);
 IF i.status<>'ISSUED' OR total<=0 OR total>9223372036854775807 OR total<(SELECT COALESCE(sum(amount),0) FROM "PaymentAllocation" WHERE "invoiceId"=i.id) OR EXISTS(SELECT 1 FROM "PaymentIntent" WHERE "invoiceId"=i.id AND status IN ('CREATING','PENDING','RETRY')) THEN RAISE EXCEPTION 'Invalid invoice correction or payment in progress'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER correction_limit BEFORE INSERT ON "InvoiceCorrection" FOR EACH ROW EXECUTE FUNCTION delta_correction_guard();
CREATE FUNCTION delta_correction_posted() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "JournalEntry" WHERE source='correction:'||NEW.id::text AND status='POSTED') THEN RAISE EXCEPTION 'Correction requires journal'; END IF; RETURN NULL; END; $$;
CREATE CONSTRAINT TRIGGER correction_posted AFTER INSERT ON "InvoiceCorrection" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION delta_correction_posted();
CREATE FUNCTION delta_source_posted() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='Expense' THEN
  IF NEW.status IN ('POSTED','PAID','REVERSED') AND NOT EXISTS(SELECT 1 FROM "JournalEntry" WHERE source='expense:'||NEW.id::text AND status='POSTED') THEN RAISE EXCEPTION 'Expense requires journal'; END IF;
  IF NEW.status='PAID' AND NOT EXISTS(SELECT 1 FROM "JournalEntry" WHERE source='expense-pay:'||NEW.id::text AND status='POSTED') THEN RAISE EXCEPTION 'Expense payment requires journal'; END IF;
  IF NEW.status='REVERSED' AND NOT EXISTS(SELECT 1 FROM "JournalEntry" r JOIN "JournalEntry" e ON r."reversalOfId"=e.id WHERE e.source='expense:'||NEW.id::text) THEN RAISE EXCEPTION 'Expense requires reversal'; END IF;
 ELSIF TG_TABLE_NAME='OpeningBalance' THEN
  IF NOT EXISTS(SELECT 1 FROM "JournalEntry" WHERE source='opening:'||NEW.id::text AND status='POSTED') THEN RAISE EXCEPTION 'Opening balance requires journal'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM "PaymentIntent" WHERE id=NEW."intentId" AND status='VERIFIED' AND amount=NEW.amount) OR NOT EXISTS(SELECT 1 FROM "JournalEntry" WHERE source='settlement:'||NEW.id::text AND status='POSTED') THEN RAISE EXCEPTION 'Settlement requires verified payment and journal'; END IF;
 END IF; RETURN NULL; END; $$;
CREATE CONSTRAINT TRIGGER expense_posted AFTER INSERT OR UPDATE ON "Expense" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION delta_source_posted();
CREATE CONSTRAINT TRIGGER opening_posted AFTER INSERT ON "OpeningBalance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION delta_source_posted();
CREATE CONSTRAINT TRIGGER settlement_posted AFTER INSERT ON "Reconciliation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION delta_source_posted();

CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");
CREATE INDEX "InvoiceCorrection_invoiceId_idx" ON "InvoiceCorrection"("invoiceId");
CREATE INDEX "ExpenseDocument_expenseId_idx" ON "ExpenseDocument"("expenseId");
CREATE INDEX "JournalEntry_occurredAt_idx" ON "JournalEntry"("occurredAt");
CREATE INDEX "Expense_occurredAt_idx" ON "Expense"("occurredAt");

INSERT INTO "Account"(code,name,kind) VALUES('OTHER_REVENUE','سایر درآمدهای ساختمان','REVENUE');
CREATE TABLE "Income" (id UUID PRIMARY KEY,"financialAccountId" UUID NOT NULL REFERENCES "FinancialAccount"(id),amount BIGINT NOT NULL CHECK(amount>0),description VARCHAR(500) NOT NULL,payer VARCHAR(200) NOT NULL,reference VARCHAR(200) NOT NULL UNIQUE,"occurredAt" TIMESTAMPTZ(3) NOT NULL,"actorId" UUID NOT NULL REFERENCES "User"(id),status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED','REVERSED')),"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "Income_occurredAt_idx" ON "Income"("occurredAt");
CREATE FUNCTION delta_income_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'POSTED' OR NEW.status<>'REVERSED' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Income is immutable; post a reversal'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER income_history BEFORE UPDATE OR DELETE ON "Income" FOR EACH ROW EXECUTE FUNCTION delta_income_guard();
CREATE FUNCTION delta_income_posted() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE i "Income"; BEGIN
 SELECT * INTO i FROM "Income" WHERE id=NEW.id;
 IF NOT EXISTS(SELECT 1 FROM "JournalEntry" WHERE source='income:'||i.id::text AND status='POSTED') OR (i.status='REVERSED' AND NOT EXISTS(SELECT 1 FROM "JournalEntry" r JOIN "JournalEntry" e ON r."reversalOfId"=e.id WHERE e.source='income:'||i.id::text AND r.status='POSTED')) THEN RAISE EXCEPTION 'Income requires journal and reversal'; END IF; RETURN NULL; END; $$;
CREATE CONSTRAINT TRIGGER income_posted AFTER INSERT OR UPDATE ON "Income" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION delta_income_posted();

COMMIT;
