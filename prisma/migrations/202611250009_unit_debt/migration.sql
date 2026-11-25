CREATE TABLE "UnitDebt" (
  id UUID PRIMARY KEY,
  "unitId" UUID NOT NULL REFERENCES "Unit"(id),
  "periodKey" VARCHAR(7) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('HISTORICAL', 'OPENING', 'MISC')),
  reference VARCHAR(100) NOT NULL,
  description VARCHAR(300) NOT NULL,
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "UnitDebt_unitId_reference_key" ON "UnitDebt" ("unitId", reference);
CREATE INDEX "UnitDebt_unitId_periodKey_idx" ON "UnitDebt" ("unitId", "periodKey");
CREATE UNIQUE INDEX unit_debt_historical_month ON "UnitDebt" ("unitId", "periodKey") WHERE kind='HISTORICAL';
CREATE TRIGGER unit_debt_immutable BEFORE UPDATE OR DELETE ON "UnitDebt"
FOR EACH ROW EXECUTE FUNCTION delta_financial_immutable();
