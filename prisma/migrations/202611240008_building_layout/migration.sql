BEGIN;
ALTER TABLE "Unit" ADD COLUMN "physicalPosition" INTEGER CHECK ("physicalPosition" BETWEEN 1 AND 3);
CREATE UNIQUE INDEX "Unit_id_buildingId_key" ON "Unit"(id,"buildingId");
CREATE FUNCTION delta_layout_floor(unit_number TEXT, floor_label TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT CASE
 WHEN translate(trim(floor_label),'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789') NOT IN ('','نامشخص','UNKNOWN','-') THEN translate(trim(floor_label),'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789')
 WHEN translate(trim(unit_number),'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789') ~ '^[0-9]+$' THEN COALESCE(NULLIF(ltrim(regexp_replace(translate(trim(unit_number),'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789'),'[0-9]$',''),'0'),''),'0')
 ELSE 'نامشخص' END;
$$;
CREATE UNIQUE INDEX unit_physical_position ON "Unit"("buildingId",delta_layout_floor(number,floor),"physicalPosition") WHERE "physicalPosition" IS NOT NULL;
CREATE TABLE "PhysicalUnitGroup" (
 id UUID PRIMARY KEY, "buildingId" UUID NOT NULL REFERENCES "Building"(id) ON DELETE RESTRICT,
 floor VARCHAR(30) NOT NULL CHECK(length(trim(floor))>0), label VARCHAR(100) NOT NULL CHECK(length(trim(label))>0),
 "occupantLabel" VARCHAR(100), "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "endsAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 UNIQUE(id,"buildingId"), CHECK("endsAt" IS NULL OR "endsAt">"startsAt")
);
CREATE INDEX "PhysicalUnitGroup_buildingId_endsAt_idx" ON "PhysicalUnitGroup"("buildingId","endsAt");
CREATE TABLE "PhysicalGroupMember" (
 id UUID PRIMARY KEY, "groupId" UUID NOT NULL, "unitId" UUID NOT NULL, "buildingId" UUID NOT NULL,
 "unitNumber" VARCHAR(30) NOT NULL, "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "endsAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 FOREIGN KEY("groupId","buildingId") REFERENCES "PhysicalUnitGroup"(id,"buildingId") ON DELETE RESTRICT,
 FOREIGN KEY("unitId","buildingId") REFERENCES "Unit"(id,"buildingId") ON DELETE RESTRICT,
 UNIQUE("groupId","unitId"), CHECK("endsAt" IS NULL OR "endsAt">"startsAt"),
 EXCLUDE USING gist ("unitId" WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&)
);
CREATE INDEX "PhysicalGroupMember_unitId_endsAt_idx" ON "PhysicalGroupMember"("unitId","endsAt");
CREATE TRIGGER physical_group_history BEFORE UPDATE OR DELETE ON "PhysicalUnitGroup" FOR EACH ROW EXECUTE FUNCTION delta_relationship_guard();
CREATE TRIGGER physical_member_history BEFORE UPDATE OR DELETE ON "PhysicalGroupMember" FOR EACH ROW EXECUTE FUNCTION delta_relationship_guard();

-- Deferred checks permit atomic grouping/ungrouping but reject incomplete groups,
-- cross-floor spans, non-adjacent positions and mismatched historical intervals.
CREATE FUNCTION delta_physical_layout_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g RECORD; n INTEGER; lo INTEGER; hi INTEGER; group_ids UUID[];
BEGIN
 IF TG_TABLE_NAME='Unit' THEN SELECT array_agg("groupId") INTO group_ids FROM "PhysicalGroupMember" WHERE "unitId"=NEW.id AND "endsAt" IS NULL;
 ELSIF TG_TABLE_NAME='PhysicalGroupMember' THEN group_ids:=ARRAY[NEW."groupId"];
 ELSE group_ids:=ARRAY[NEW.id]; END IF;
 FOR g IN SELECT * FROM "PhysicalUnitGroup" WHERE id=ANY(COALESCE(group_ids,'{}'::uuid[])) LOOP
  SELECT count(*) INTO n FROM "PhysicalGroupMember" WHERE "groupId"=g.id;
  IF n NOT BETWEEN 2 AND 3 THEN RAISE EXCEPTION 'Physical group requires two or three units'; END IF;
  IF EXISTS(SELECT 1 FROM "PhysicalGroupMember" m WHERE m."groupId"=g.id AND (m."startsAt"<>g."startsAt" OR m."endsAt" IS DISTINCT FROM g."endsAt")) THEN RAISE EXCEPTION 'Physical group intervals must agree'; END IF;
  IF g."endsAt" IS NULL THEN
   IF EXISTS(SELECT 1 FROM "PhysicalGroupMember" m JOIN "Unit" u ON u.id=m."unitId" WHERE m."groupId"=g.id AND (delta_layout_floor(u.number,u.floor)<>g.floor OR u."physicalPosition" IS NULL OR u.number<>m."unitNumber")) THEN RAISE EXCEPTION 'Ungroup before changing grouped unit layout or number'; END IF;
   SELECT min(u."physicalPosition"),max(u."physicalPosition") INTO lo,hi FROM "PhysicalGroupMember" m JOIN "Unit" u ON u.id=m."unitId" WHERE m."groupId"=g.id;
   IF hi-lo+1<>n THEN RAISE EXCEPTION 'Grouped units must be adjacent'; END IF;
  END IF;
 END LOOP;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER physical_group_consistency AFTER INSERT OR UPDATE ON "PhysicalUnitGroup" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION delta_physical_layout_guard();
CREATE CONSTRAINT TRIGGER physical_member_consistency AFTER INSERT OR UPDATE ON "PhysicalGroupMember" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION delta_physical_layout_guard();
CREATE CONSTRAINT TRIGGER physical_unit_consistency AFTER UPDATE ON "Unit" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION delta_physical_layout_guard();
COMMIT;
