-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('SUPER_ADMIN', 'BOARD_MEMBER', 'OWNER', 'TENANT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipKind" AS ENUM ('OWNER', 'TENANT', 'AUTHORIZED');

-- CreateEnum
CREATE TYPE "Occupancy" AS ENUM ('UNKNOWN', 'VACANT', 'OCCUPIED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(13) NOT NULL,
    "name" VARCHAR(100),
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OTPChallenge" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(13) NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OTPChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityRateLimit" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SecurityRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'delta',
    "name" VARCHAR(100) NOT NULL DEFAULT 'ساختمان دلتا',
    "city" VARCHAR(100) NOT NULL DEFAULT 'اردبیل',
    "address" VARCHAR(500),
    "capacity" INTEGER NOT NULL DEFAULT 18,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "floor" VARCHAR(30) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "occupancy" "Occupancy" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitMembership" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "MembershipKind" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UnitMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingResponsibility" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BillingResponsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardTerm" (
    "id" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BoardTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardMember" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BoardMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "targetId" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "OTPChallenge_phone_createdAt_idx" ON "OTPChallenge"("phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Building_key_key" ON "Building"("key");

-- CreateIndex
CREATE INDEX "Unit_active_number_idx" ON "Unit"("active", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_buildingId_number_key" ON "Unit"("buildingId", "number");

-- CreateIndex
CREATE INDEX "UnitMembership_userId_endsAt_idx" ON "UnitMembership"("userId", "endsAt");

-- CreateIndex
CREATE INDEX "UnitMembership_unitId_endsAt_idx" ON "UnitMembership"("unitId", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnitMembership_id_unitId_userId_key" ON "UnitMembership"("id", "unitId", "userId");

-- CreateIndex
CREATE INDEX "BillingResponsibility_unitId_startsAt_idx" ON "BillingResponsibility"("unitId", "startsAt");

-- CreateIndex
CREATE INDEX "BoardMember_userId_endsAt_idx" ON "BoardMember"("userId", "endsAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt", "id");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitMembership" ADD CONSTRAINT "UnitMembership_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitMembership" ADD CONSTRAINT "UnitMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingResponsibility" ADD CONSTRAINT "BillingResponsibility_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingResponsibility" ADD CONSTRAINT "BillingResponsibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingResponsibility" ADD CONSTRAINT "BillingResponsibility_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "UnitMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardTerm" ADD CONSTRAINT "BoardTerm_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardMember" ADD CONSTRAINT "BoardMember_termId_fkey" FOREIGN KEY ("termId") REFERENCES "BoardTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardMember" ADD CONSTRAINT "BoardMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL invariants not expressible in the Prisma schema.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Building" ADD CONSTRAINT delta_single_building CHECK (key = 'delta' AND capacity = 18);
ALTER TABLE "User" ADD CONSTRAINT iranian_mobile CHECK (phone ~ '^\+989[0-9]{9}$');
ALTER TABLE "OTPChallenge" ADD CONSTRAINT otp_attempts CHECK (attempts BETWEEN 0 AND 5);
ALTER TABLE "OTPChallenge" ADD CONSTRAINT otp_expiry CHECK ("expiresAt" > "createdAt");
ALTER TABLE "Session" ADD CONSTRAINT session_expiry CHECK ("expiresAt" > "createdAt");
ALTER TABLE "Unit" ADD CONSTRAINT real_unit_labels CHECK (length(trim(number)) > 0 AND length(trim(floor)) > 0);
ALTER TABLE "UnitMembership" ADD CONSTRAINT membership_period CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "BillingResponsibility" ADD CONSTRAINT billing_period CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "BoardTerm" ADD CONSTRAINT term_period CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "BoardMember" ADD CONSTRAINT board_period CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "BillingResponsibility" ADD CONSTRAINT billing_membership_identity FOREIGN KEY ("membershipId","unitId","userId") REFERENCES "UnitMembership"(id,"unitId","userId") ON DELETE RESTRICT;
ALTER TABLE "BillingResponsibility" ADD CONSTRAINT no_billing_overlap EXCLUDE USING gist ("unitId" WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&);
ALTER TABLE "UnitMembership" ADD CONSTRAINT no_duplicate_membership_period EXCLUDE USING gist ("unitId" WITH =,"userId" WITH =,kind WITH =,tstzrange("startsAt","endsAt",'[)') WITH &&);
CREATE UNIQUE INDEX one_open_board_membership ON "BoardMember"("userId") WHERE "endsAt" IS NULL;
CREATE UNIQUE INDEX one_open_otp ON "OTPChallenge"(phone) WHERE "consumedAt" IS NULL;
CREATE FUNCTION delta_unit_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW."buildingId"::text));
 IF (SELECT count(*) FROM "Unit" WHERE "buildingId"=NEW."buildingId" AND id<>NEW.id) >= 18 THEN RAISE EXCEPTION 'Delta has at most 18 registered units'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER delta_unit_capacity BEFORE INSERT OR UPDATE OF "buildingId" ON "Unit" FOR EACH ROW EXECUTE FUNCTION delta_unit_capacity();
CREATE FUNCTION delta_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit history is immutable'; END; $$;
CREATE TRIGGER delta_audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION delta_audit_immutable();
CREATE FUNCTION delta_relationship_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Relationship history is retained'; END IF;
 IF OLD."endsAt" IS NOT NULL OR NEW."startsAt"<>OLD."startsAt" OR NEW."userId"<>OLD."userId" THEN RAISE EXCEPTION 'Historical relationship cannot be changed'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER delta_membership_history BEFORE UPDATE OR DELETE ON "UnitMembership" FOR EACH ROW EXECUTE FUNCTION delta_relationship_guard();
CREATE TRIGGER delta_billing_history BEFORE UPDATE OR DELETE ON "BillingResponsibility" FOR EACH ROW EXECUTE FUNCTION delta_relationship_guard();
CREATE TRIGGER delta_board_history BEFORE UPDATE OR DELETE ON "BoardMember" FOR EACH ROW EXECUTE FUNCTION delta_relationship_guard();
CREATE FUNCTION delta_billing_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "UnitMembership";
BEGIN
 SELECT * INTO m FROM "UnitMembership" WHERE id=NEW."membershipId";
 IF m.id IS NULL OR NEW."startsAt"<m."startsAt" OR (m."endsAt" IS NOT NULL AND (NEW."endsAt" IS NULL OR NEW."endsAt">m."endsAt")) THEN RAISE EXCEPTION 'Billing responsibility requires a valid membership period'; END IF;
 IF NEW."unitId"<>m."unitId" OR NEW."userId"<>m."userId" THEN RAISE EXCEPTION 'Billing identity differs from membership'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER delta_billing_guard BEFORE INSERT OR UPDATE ON "BillingResponsibility" FOR EACH ROW EXECUTE FUNCTION delta_billing_guard();
