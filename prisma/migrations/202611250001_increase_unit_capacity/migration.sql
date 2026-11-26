ALTER TABLE "Building"
DROP CONSTRAINT delta_single_building;

ALTER TABLE "Building"
ADD CONSTRAINT delta_single_building
CHECK (key = 'delta' AND capacity BETWEEN 1 AND 30);

UPDATE "Building"
SET capacity = 30
WHERE key = 'delta';

CREATE OR REPLACE FUNCTION delta_unit_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed_capacity integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW."buildingId"::text));

  SELECT capacity INTO allowed_capacity
  FROM "Building"
  WHERE id = NEW."buildingId";

  IF (
    SELECT count(*)
    FROM "Unit"
    WHERE "buildingId" = NEW."buildingId"
      AND id <> NEW.id
  ) >= allowed_capacity THEN
    RAISE EXCEPTION 'Building unit capacity exceeded';
  END IF;

  RETURN NEW;
END;
$$;