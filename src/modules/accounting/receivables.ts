import type { Prisma } from "@prisma/client";

export type ReceivableEntry = {
  id: string;
  unitId: string | null;
  obligationId: string | null;
  source: string;
  originalSource: string;
  dueAt: Date | null;
  occurredAt: Date;
  description: string;
  reversed: boolean;
  delta: bigint;
};

// Legacy financial records are linked through their immutable journal sources.
export function receivableEntries(tx: Prisma.TransactionClient) {
  return tx.$queryRaw<ReceivableEntry[]>`
    SELECT j.id, COALESCE(i."unitId", d."unitId") AS "unitId",
      COALESCE(i.id, d.id) AS "obligationId", j.source,
      COALESCE(original.source, j.source) AS "originalSource",
      COALESCE(period."dueAt", d."dueAt") AS "dueAt", j."occurredAt",
      j.description, EXISTS (SELECT 1 FROM "JournalEntry" r
        WHERE r."reversalOfId" = j.id AND r.status = 'POSTED') AS reversed,
      (line.debit - line.credit) AS delta
    FROM "JournalLine" line
    JOIN "JournalEntry" j ON j.id = line."entryId" AND j.status = 'POSTED'
    LEFT JOIN "JournalEntry" original ON original.id = j."reversalOfId"
    LEFT JOIN "InvoiceCorrection" c
      ON COALESCE(original.source, j.source) = 'correction:' || c.id::text
    LEFT JOIN "PaymentIntent" p
      ON COALESCE(original.source, j.source) = 'payment:' || p.id::text
    LEFT JOIN "Invoice" i ON i.id = COALESCE(c."invoiceId", p."invoiceId") OR
      COALESCE(original.source, j.source) = 'invoice:' || i.id::text
    LEFT JOIN "BillingPeriod" period ON period.id = i."periodId"
    LEFT JOIN "UnitDebt" d
      ON split_part(COALESCE(original.source, j.source), ':', 1) = 'unit-debt'
      AND split_part(COALESCE(original.source, j.source), ':', 2) = d.id::text
    WHERE line."accountCode" = 'AR'
    ORDER BY j."occurredAt", j."createdAt", j.id
  `;
}

export function summarizeReceivables(
  entries: ReceivableEntry[],
  start: Date,
  end: Date,
  now: Date,
) {
  const units = new Map<
    string,
    { outstanding: bigint; overdue: bigint; paid: bigint }
  >();
  const obligations = new Map<
    string,
    { unitId: string; dueAt: Date | null; balance: bigint }
  >();
  let outstanding = 0n;
  let monthlyCharges = 0n;
  let monthlyCollections = 0n;
  let otherReceivables = 0n;
  let collected = 0n;
  for (const entry of entries) {
    const { delta, originalSource, occurredAt, unitId, obligationId, dueAt } =
      entry;
    const payment =
      originalSource.startsWith("payment:") ||
      originalSource.split(":")[2] === "payment";
    outstanding += delta;
    if (originalSource.startsWith("unit-debt:")) otherReceivables += delta;
    if (payment) collected -= delta;
    if (occurredAt >= start && occurredAt < end) {
      if (payment) monthlyCollections -= delta;
      else monthlyCharges += delta;
    }
    if (!unitId || !obligationId) continue;
    const unit = units.get(unitId) ?? {
      outstanding: 0n,
      overdue: 0n,
      paid: 0n,
    };
    unit.outstanding += delta;
    if (payment) unit.paid -= delta;
    units.set(unitId, unit);
    const obligation = obligations.get(obligationId) ?? {
      unitId,
      dueAt,
      balance: 0n,
    };
    obligation.balance += delta;
    obligations.set(obligationId, obligation);
  }
  for (const { unitId, dueAt, balance } of obligations.values()) {
    if (dueAt && dueAt < now && balance > 0n)
      units.get(unitId)!.overdue += balance;
  }
  return {
    units,
    outstanding,
    monthlyCharges,
    monthlyCollections,
    otherReceivables,
    collected,
  };
}
