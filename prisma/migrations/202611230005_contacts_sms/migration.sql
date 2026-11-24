-- Additive only: existing accounts, memberships and financial data are untouched.
CREATE TABLE "UnitContact" (
 "id" UUID PRIMARY KEY, "unitId" UUID NOT NULL REFERENCES "Unit"(id) ON DELETE RESTRICT,
 "kind" VARCHAR(10) NOT NULL CHECK (kind IN ('OWNER','TENANT')),
 "name" VARCHAR(100) NOT NULL CHECK (length(trim(name)) >= 3),
 "phone" VARCHAR(13) CHECK (phone IS NULL OR phone ~ '^\+989[0-9]{9}$'),
 "userId" UUID REFERENCES "User"(id) ON DELETE RESTRICT,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 UNIQUE ("unitId", kind),
 CHECK ((phone IS NULL) = ("userId" IS NULL))
);
CREATE INDEX "UnitContact_phone_idx" ON "UnitContact"(phone);
CREATE TABLE "SmsProviderSetting" (
 "key" VARCHAR(20) PRIMARY KEY CHECK (key='farazsms'),
 "enabled" BOOLEAN NOT NULL DEFAULT false,
 "encryptedApiKey" TEXT,
 "fromNumber" VARCHAR(20) NOT NULL,
 "patterns" JSONB NOT NULL CHECK (jsonb_typeof(patterns)='object'),
 "updatedById" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CHECK (NOT enabled OR ("encryptedApiKey" IS NOT NULL AND "fromNumber" ~ '^\+98[0-9]{3,17}$'))
);
