
ALTER TABLE "SecurityRateLimit" RENAME COLUMN id TO key;
ALTER TABLE "SecurityRateLimit" DROP CONSTRAINT "SecurityRateLimit_pkey";
ALTER TABLE "SecurityRateLimit" ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "SecurityRateLimit" ADD CONSTRAINT "SecurityRateLimit_pkey" PRIMARY KEY (id);
CREATE UNIQUE INDEX "SecurityRateLimit_key_key" ON "SecurityRateLimit"(key);
CREATE OR REPLACE FUNCTION delta_relationship_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Relationship history is retained'; END IF;
 IF OLD."endsAt" IS NOT NULL OR (to_jsonb(NEW)-'endsAt'-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'endsAt'-'updatedAt') THEN RAISE EXCEPTION 'Historical relationship identity cannot be changed'; END IF;
 RETURN NEW;
END; $$;
