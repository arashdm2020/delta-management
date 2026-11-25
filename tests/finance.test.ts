import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
process.loadEnvFile();
const { isolatedDatabase } = await import("./database");
const isolated = await isolatedDatabase();
process.env.DATABASE_URL = isolated.url;
Object.assign(process.env, {
  NODE_ENV: "development",
  PAYMENT_PROVIDER: "mock",
});
const { db } = await import("../src/lib/db");
const { createPolicy, generateInvoices, cancelInvoice, correctInvoice } =
  await import("../src/modules/billing/service");
const { currentPeriod, periodBounds } =
  await import("../src/modules/billing/calendar");
const {
  startPayment,
  simulatePayment,
  verifyPayment,
  reconcile,
  accessibleInvoice,
} = await import("../src/modules/payments/service");
const { openingBalance, post, pair, balance } =
  await import("../src/modules/accounting/service");
const { createExpense, postExpense, payExpense, reverseExpense } =
  await import("../src/modules/expenses/service");
const { dashboard, unitStatus, receipts } =
  await import("../src/modules/financial-reports/service");
const { assignBilling } = await import("../src/modules/units/service");
const { queueBilling, runOneJob, queueMonthlyCharges } =
  await import("../src/modules/billing/jobs");
const { paymentProvider } = await import("../src/modules/payments/providers");
const key = currentPeriod();
const bounds = periodBounds(key);
const [y, m] = key.split("-").map(Number);
const previous = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
const future = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
type Actor = Awaited<ReturnType<typeof db.user.findUniqueOrThrow>> & {
  roles: { role: { name: string } }[];
};
let admin: Actor, owner: Actor, tenant: Actor, outsider: Actor;
let invoice: Awaited<ReturnType<typeof db.invoice.findFirstOrThrow>>,
  otherInvoice: typeof invoice;
let successAuthority: string, successIntent: string;
let approvalMinutesId: string;
before(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  const building = await db.building.create({ data: { key: "delta" } });
  const role = await db.role.create({ data: { name: "SUPER_ADMIN" } });
  admin = await db.user.create({
    data: {
      phone: "+989110000001",
      name: "FINANCE TEST admin",
      status: "APPROVED",
      roles: { create: { roleId: role.id } },
    },
    include: { roles: { include: { role: true } } },
  });
  owner = await db.user.create({
    data: {
      phone: "+989110000002",
      name: "FINANCE TEST owner",
      status: "APPROVED",
    },
    include: { roles: { include: { role: true } } },
  });
  tenant = await db.user.create({
    data: {
      phone: "+989110000003",
      name: "FINANCE TEST tenant",
      status: "APPROVED",
    },
    include: { roles: { include: { role: true } } },
  });
  outsider = await db.user.create({
    data: {
      phone: "+989110000004",
      name: "FINANCE TEST outsider",
      status: "APPROVED",
    },
    include: { roles: { include: { role: true } } },
  });
  for (const [number, user] of [
    ["FIN-TEST-1", owner],
    ["FIN-TEST-2", tenant],
  ] as const) {
    const unit = await db.unit.create({
      data: { buildingId: building.id, number, floor: "TEST" },
    });
    const membership = await db.unitMembership.create({
      data: {
        unitId: unit.id,
        userId: user.id,
        kind: "OWNER",
        startsAt: new Date(periodBounds(previous).startsAt.getTime() - 1000),
      },
    });
    await db.billingResponsibility.create({
      data: {
        unitId: unit.id,
        userId: user.id,
        membershipId: membership.id,
        startsAt: membership.startsAt,
      },
    });
  }
});
after(async () => {
  await db.$disconnect();
  await isolated.cleanup();
});
test("policies are append-only, effective-dated and cannot overlap", async () => {
  const meeting = await db.meeting.create({
    data: {
      title: "FINANCE TEST approval",
      description: "Test approval only",
      agenda: "Charge approval",
      kind: "BOARD",
      status: "COMPLETED",
      startsAt: new Date("2020-01-01"),
      location: "TEST",
      authorId: admin.id,
    },
  });
  const minutes = await db.meetingMinutes.create({
    data: {
      meetingId: meeting.id,
      version: 1,
      status: "FINAL",
      content: "FINANCE TEST approved changes",
      authorId: admin.id,
    },
  });
  approvalMinutesId = minutes.id;

  const first = await createPolicy(
    admin,
    1000000n,
    previous,
    "",
  );
  assert.equal(first.endsAt, null, "Initial monthly amount remains effective indefinitely");
  await assert.rejects(createPolicy(admin, 2000000n, key, "", approvalMinutesId));
  await assert.rejects(
    createPolicy(admin, 2000000n, key, "unapproved change"),
    /صورتجلسه/,
  );
  await createPolicy(
    admin,
    2000000n,
    key,
    "current test policy",
    approvalMinutesId,
  );
  assert.equal(
    (
      await db.chargePolicy.findUniqueOrThrow({ where: { id: first.id } })
    ).endsAt!.toISOString(),
    bounds.startsAt.toISOString(),
  );
  await assert.rejects(createPolicy(admin, 10n, key, "duplicate date"));
  await assert.rejects(
    db.chargePolicy.create({
      data: {
        amount: 100n,
        startsAt: new Date(bounds.startsAt.getTime() + 1),
        actorId: admin.id,
        reason: "overlap",
      },
    }),
  );
  await assert.rejects(
    db.chargePolicy.update({ where: { id: first.id }, data: { amount: 999n } }),
  );
});
test("monthly invoice generation is transactional and concurrent retries are idempotent", async () => {
  const results = await Promise.all([
    generateInvoices(admin, key),
    generateInvoices(admin, key),
  ]);
  assert.equal(
    results.reduce((n, r) => n + r.created, 0),
    2,
  );
  assert.equal(await db.invoice.count(), 2);
  invoice = await db.invoice.findFirstOrThrow({
    where: { responsibleId: owner.id },
  });
  otherInvoice = await db.invoice.findFirstOrThrow({
    where: { responsibleId: tenant.id },
  });
  assert.equal(invoice.amount, 2000000n);
  await generateInvoices(admin, previous);
  assert.equal(
    (
      await db.invoice.findFirstOrThrow({
        where: { responsibleId: owner.id, periodId: { not: invoice.periodId } },
      })
    ).amount,
    1000000n,
  );
  await createPolicy(
    admin,
    3000000n,
    future,
    "future policy",
    approvalMinutesId,
  );
  assert.equal(
    (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).amount,
    2000000n,
  );
  await assert.rejects(generateInvoices(admin, future));
});
test("responsibility changes retain invoice snapshots and prior responsibility", async () => {
  await db.role.create({ data: { name: "TENANT" } });
  const m = await db.unitMembership.create({
    data: { unitId: invoice.unitId, userId: tenant.id, kind: "AUTHORIZED" },
  });
  await assignBilling(admin, invoice.unitId, m.id);
  const saved = await db.invoice.findUniqueOrThrow({
    where: { id: invoice.id },
  });
  assert.equal(saved.responsibleId, owner.id);
  assert.equal(saved.responsibleName, "FINANCE TEST owner");
  assert.equal(
    await db.billingResponsibility.count({ where: { unitId: invoice.unitId } }),
    2,
  );
  await assert.rejects(
    db.invoice.update({
      where: { id: invoice.id },
      data: { responsibleId: tenant.id },
    }),
  );
});
test("corrections are immutable, idempotent and update receivables", async () => {
  await Promise.all([
    correctInvoice(
      admin,
      invoice.id,
      1000n,
      "test correction",
      "test-correction",
    ),
    correctInvoice(
      admin,
      invoice.id,
      1000n,
      "test correction",
      "test-correction",
    ),
  ]);
  assert.equal(await db.invoiceCorrection.count(), 1);
  await assert.rejects(
    correctInvoice(
      admin,
      invoice.id,
      -3000000n,
      "invalid credit",
      "invalid-credit",
    ),
  );
  await assert.rejects(
    correctInvoice(
      admin,
      invoice.id,
      2000n,
      "different correction",
      "test-correction",
    ),
  );
});
test("browser callbacks alone cannot prove payment; intent creation is idempotent", async () => {
  const [a, b] = await Promise.all([
    startPayment(owner, invoice.id),
    startPayment(owner, invoice.id),
  ]);
  assert.equal(a.intentId, b.intentId);
  const intent = await db.paymentIntent.findUniqueOrThrow({
    where: { id: a.intentId },
  });
  successAuthority = intent.authority!;
  successIntent = intent.id;
  assert.equal((await verifyPayment(successAuthority)).status, "PENDING");
  assert.equal(await db.paymentAllocation.count(), 0);
  await assert.rejects(cancelInvoice(admin, invoice.id, "pending invoice"));
  await assert.rejects(
    correctInvoice(
      admin,
      invoice.id,
      100n,
      "pending correction",
      "pending-correction",
    ),
  );
});
test("verification failure creates retry work without a payment or ledger entry", async () => {
  await assert.rejects(
    simulatePayment(owner, successAuthority, "VERIFY_FAILURE"),
  );
  assert.equal(
    (await db.paymentIntent.findUniqueOrThrow({ where: { id: successIntent } }))
      .status,
    "RETRY",
  );
  assert.equal(await db.paymentAllocation.count(), 0);
  assert.equal(
    await db.journalEntry.count({
      where: { source: "payment:" + successIntent },
    }),
    0,
  );
  assert.ok(
    await db.outboxJob.findUnique({
      where: { key: "verify:" + successIntent },
    }),
  );
});
test("verified payment posts once under concurrent and duplicate callbacks", async () => {
  await db.mockPayment.update({
    where: { authority: successAuthority },
    data: { outcome: "SUCCESS" },
  });
  const results = await Promise.all(
    Array.from({ length: 6 }, () => verifyPayment(successAuthority)),
  );
  assert.ok(results.every((r) => r.status === "VERIFIED"));
  assert.equal(
    await db.paymentAllocation.count({ where: { intentId: successIntent } }),
    1,
  );
  assert.equal(
    await db.journalEntry.count({
      where: { source: "payment:" + successIntent },
    }),
    1,
  );
  assert.equal(await balance(db, "CLEARING"), 2001000n);
  assert.equal(await balance(db, "BANK"), 0n);
  await assert.rejects(startPayment(owner, invoice.id));
  await assert.rejects(cancelInvoice(admin, invoice.id, "paid invoice"));
  await assert.rejects(
    db.paymentAllocation.create({
      data: { intentId: successIntent, invoiceId: invoice.id, amount: 1n },
    }),
  );
});
test("failed, cancelled and delayed mock transactions never allocate prematurely", async () => {
  let intent = await startPayment(tenant, otherInvoice.id);
  let stored = await db.paymentIntent.findUniqueOrThrow({
    where: { id: intent.intentId },
  });
  assert.equal(
    (await simulatePayment(tenant, stored.authority!, "FAILED")).status,
    "FAILED",
  );
  intent = await startPayment(tenant, otherInvoice.id);
  stored = await db.paymentIntent.findUniqueOrThrow({
    where: { id: intent.intentId },
  });
  assert.equal(
    (await simulatePayment(tenant, stored.authority!, "CANCELLED")).status,
    "CANCELLED",
  );
  intent = await startPayment(tenant, otherInvoice.id);
  stored = await db.paymentIntent.findUniqueOrThrow({
    where: { id: intent.intentId },
  });
  assert.equal(
    (await simulatePayment(tenant, stored.authority!, "DELAYED")).status,
    "PENDING",
  );
  assert.equal(
    await db.paymentAllocation.count({ where: { invoiceId: otherInvoice.id } }),
    0,
  );
  await db.mockPayment.update({
    where: { authority: stored.authority! },
    data: { availableAt: new Date(Date.now() - 1) },
  });
  await Promise.all([
    verifyPayment(stored.authority!),
    verifyPayment(stored.authority!),
  ]);
  assert.equal(
    await db.paymentAllocation.count({ where: { invoiceId: otherInvoice.id } }),
    1,
  );
});
test("production and test cannot instantiate the mock even with accidental configuration", async () => {
  const previousEnv = process.env.NODE_ENV;
  try {
    for (const env of ["production", "test"]) {
      Object.assign(process.env, { NODE_ENV: env });
      assert.throws(() => paymentProvider("mock"));
    }
  } finally {
    Object.assign(process.env, { NODE_ENV: previousEnv });
  }
});
test("unbalanced journals and posted mutations are rejected by PostgreSQL", async () => {
  await assert.rejects(
    db.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          actorId: admin.id,
          source: "unbalanced-test",
          description: "test",
          occurredAt: new Date(),
        },
      });
      await tx.journalLine.create({
        data: { entryId: entry.id, accountCode: "BANK", debit: 10n },
      });
      await tx.journalEntry.update({
        where: { id: entry.id },
        data: { status: "POSTED" },
      });
    }),
  );
  const entry = await db.journalEntry.findFirstOrThrow({
    include: { lines: true },
  });
  await assert.rejects(
    db.journalEntry.update({
      where: { id: entry.id },
      data: { description: "tamper" },
    }),
  );
  await assert.rejects(db.journalEntry.delete({ where: { id: entry.id } }));
  await assert.rejects(
    db.journalLine.update({
      where: { id: entry.lines[0].id },
      data: { debit: 999n },
    }),
  );
  await assert.rejects(
    db.journalLine.create({
      data: { entryId: entry.id, accountCode: "BANK", debit: 1n },
    }),
  );
  await assert.rejects(
    db.$transaction((tx) =>
      post(tx, admin.id, "bad-service", "test", new Date(), [
        { accountCode: "BANK", debit: 1n, credit: 0n },
      ]),
    ),
  );
});
test("confirmed settlement separates fees, clearing and bank; duplicate confirmation is harmless", async () => {
  const bank = await db.financialAccount.findFirstOrThrow();
  await Promise.all([
    reconcile(admin, successIntent, bank.id, 1000n, "TEST-SETTLEMENT"),
    reconcile(admin, successIntent, bank.id, 1000n, "TEST-SETTLEMENT"),
  ]);
  assert.equal(await db.reconciliation.count(), 1);
  assert.equal(await balance(db, "BANK"), 2000000n);
  assert.equal(await balance(db, "FEES"), 1000n);
  assert.equal(await balance(db, "CLEARING"), 2000000n);
});
test("expenses post, pay, retain documents and reverse with balanced immutable entries", async () => {
  const category = await db.expenseCategory.findFirstOrThrow();
  const bank = await db.financialAccount.findFirstOrThrow();
  const expense = await createExpense(
    admin,
    {
      categoryId: category.id,
      description: "FINANCE TEST expense",
      payee: "TEST payee",
      amount: 500000n,
      occurredAt: new Date(),
    },
    {
      name: "test.pdf",
      mime: "application/pdf",
      content: new TextEncoder().encode("%PDF-1.4 test"),
    },
  );
  await Promise.all([
    postExpense(admin, expense.id),
    postExpense(admin, expense.id),
  ]);
  assert.equal(await balance(db, "AP"), -500000n);
  await payExpense(admin, expense.id, bank.id);
  assert.equal(await balance(db, "BANK"), 1500000n);
  await assert.rejects(
    db.expense.update({ where: { id: expense.id }, data: { amount: 10n } }),
  );
  await reverseExpense(admin, expense.id, "test expense reversal");
  await reverseExpense(admin, expense.id, "duplicate test reversal");
  assert.equal(await balance(db, "BANK"), 2000000n);
  assert.equal(await balance(db, "EXPENSE"), 0n);
  assert.equal(await balance(db, "AP"), 0n);
});
test("opening balances post once, and concurrent expenses cannot overspend the bank", async () => {
  const bank = await db.financialAccount.findFirstOrThrow();
  await openingBalance(admin, bank.id, 100000n, "test opening balance");
  await assert.rejects(
    openingBalance(admin, bank.id, 100000n, "duplicate opening"),
  );
  const category = await db.expenseCategory.findFirstOrThrow();
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const expense = await createExpense(admin, {
      categoryId: category.id,
      description: "Concurrent expense " + i,
      payee: "TEST vendor",
      amount: 2000000n,
      occurredAt: new Date(),
    });
    await postExpense(admin, expense.id);
    ids.push(expense.id);
  }
  const results = await Promise.allSettled(
    ids.map((id) => payExpense(admin, id, bank.id)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await balance(db, "BANK"), 100000n);
});
test("invoice cancellation reverses revenue and receivables without deleting history", async () => {
  const past = await db.invoice.findFirstOrThrow({
    where: { responsibleId: owner.id, periodId: { not: invoice.periodId } },
  });
  await cancelInvoice(admin, past.id, "test cancellation");
  await cancelInvoice(admin, past.id, "duplicate cancellation");
  assert.equal(
    (await db.invoice.findUniqueOrThrow({ where: { id: past.id } })).status,
    "CANCELLED",
  );
  assert.equal(
    await db.journalEntry.count({
      where: { source: "invoice-cancel:" + past.id },
    }),
    1,
  );
});
test("financial services enforce permissions and resident DTOs contain no private data", async () => {
  await assert.rejects(createPolicy(owner, 10n, future, "resident denied"));
  await assert.rejects(generateInvoices(owner, key));
  await assert.rejects(accessibleInvoice(tenant, invoice.id));
  await assert.rejects(accessibleInvoice(outsider, invoice.id));
  await assert.rejects(dashboard(owner));
  await assert.rejects(
    createExpense(owner, {
      categoryId: (await db.expenseCategory.findFirstOrThrow()).id,
      description: "forbidden",
      payee: "TEST",
      amount: 10n,
      occurredAt: new Date(),
    }),
  );
  const rows = await unitStatus(owner, key);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    Object.keys(rows[0]).sort(),
    ["unitNumber", "period", "amount", "paid", "outstanding", "status"].sort(),
  );
  assert.equal((await receipts(owner)).length, 1);
});
test("report totals reconcile to the ledger and every journal balances", async () => {
  const report = await dashboard(admin, key);
  assert.equal(report.receivables, await balance(db, "AR"));
  assert.equal(
    report.trial.reduce((a, r) => a + r.balance, 0n),
    0n,
  );
  for (const entry of await db.journalEntry.findMany({
    include: { lines: true },
  }))
    assert.equal(
      entry.lines.reduce((a, l) => a + l.debit - l.credit, 0n),
      0n,
    );
  assert.equal(report.collected, 4001000n);
});
test("outbox jobs are claimed concurrently and invoice retries stay idempotent", async () => {
  const scheduled = await queueMonthlyCharges();
  const repeated = await queueMonthlyCharges();
  assert.ok(scheduled);
  assert.equal(scheduled.id, repeated?.id);
  await queueBilling(admin, key);
  await queueBilling(admin, key);
  await Promise.all([runOneJob(), runOneJob(), runOneJob()]);
  for (let i = 0; i < 60; i++) await runOneJob();
  assert.equal(await db.invoice.count(), 4);
  assert.equal(
    (
      await db.outboxJob.findUniqueOrThrow({
        where: { key: "generate:" + key },
      })
    ).status,
    "DONE",
  );
});

test("database rejects duplicate provider transactions, excess allocation, negative amounts and false reversals", async () => {
  const paid = await db.paymentIntent.findUniqueOrThrow({
    where: { id: successIntent },
  });
  await assert.rejects(
    db.paymentIntent.create({
      data: {
        invoiceId: otherInvoice.id,
        actorId: tenant.id,
        provider: "mock",
        amount: 1n,
        status: "VERIFIED",
        verifiedAt: new Date(),
        providerTransactionId: paid.providerTransactionId,
      },
    }),
    (error) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002",
      ),
  );
  await assert.rejects(
    db.$transaction(async (tx) => {
      const extra = await tx.paymentIntent.create({
        data: {
          invoiceId: invoice.id,
          actorId: owner.id,
          provider: "mock",
          amount: 1n,
          status: "VERIFIED",
          verifiedAt: new Date(),
          providerTransactionId: "test-overpayment",
        },
      });
      await tx.paymentAllocation.create({
        data: { intentId: extra.id, invoiceId: invoice.id, amount: 1n },
      });
    }),
  );
  await assert.rejects(
    db.paymentIntent.create({
      data: {
        invoiceId: invoice.id,
        actorId: owner.id,
        provider: "mock",
        amount: -1n,
      },
    }),
  );
  const original = await db.journalEntry.findUniqueOrThrow({
    where: { source: "payment:" + successIntent },
  });
  await assert.rejects(
    db.$transaction((tx) =>
      post(
        tx,
        admin.id,
        "invalid-reversal",
        "false reversal",
        new Date(),
        pair("BANK", "EQUITY", paid.amount),
        original.id,
      ),
    ),
  );
  const correction = await db.invoiceCorrection.findFirstOrThrow();
  await assert.rejects(
    db.invoiceCorrection.update({
      where: { id: correction.id },
      data: { amount: 10n },
    }),
  );
});

test("billing rolls back all units if any responsibility is missing", async () => {
  const building = await db.building.findUniqueOrThrow({
    where: { key: "delta" },
  });
  const unit = await db.unit.create({
    data: {
      buildingId: building.id,
      number: "NO-RESPONSIBILITY-TEST",
      floor: "TEST",
    },
  });
  const previousInvoices = await db.invoice.count();
  await assert.rejects(generateInvoices(admin, key));
  assert.equal(await db.invoice.count(), previousInvoices);
  await db.unit.update({ where: { id: unit.id }, data: { active: false } });
});

test("non-charge income posts, cannot be edited, and reverses without changing charge collections", async () => {
  const { recordIncome, reverseIncome } =
    await import("../src/modules/accounting/income");
  const bank = await db.financialAccount.findFirstOrThrow();
  const before = await balance(db, "BANK");
  const income = await recordIncome(admin, {
    financialAccountId: bank.id,
    amount: 10000n,
    description: "TEST other income",
    payer: "TEST payer",
    reference: "TEST-INCOME-REF",
    occurredAt: new Date(),
  });
  assert.equal(await balance(db, "BANK"), before + 10000n);
  await assert.rejects(
    db.income.update({ where: { id: income.id }, data: { amount: 1n } }),
  );
  await assert.rejects(
    recordIncome(owner, {
      financialAccountId: bank.id,
      amount: 10n,
      description: "forbidden",
      payer: "TEST",
      reference: "FORBIDDEN",
      occurredAt: new Date(),
    }),
  );
  await reverseIncome(admin, income.id, "test income reversal");
  assert.equal(await balance(db, "BANK"), before);
  assert.equal(await balance(db, "OTHER_REVENUE"), 0n);
});

test("public cumulative debts retain unpaid months without exposing resident identities", async () => {
  const { unitDebtStatus } =
    await import("../src/modules/financial-reports/service");
  const rows = await unitDebtStatus(owner);
  assert.ok(rows.length > 0);
  const all = await db.invoice.findMany({
    where: { status: "ISSUED" },
    include: { corrections: true, allocations: true },
  });
  assert.equal(
    rows.reduce((sum, row) => sum + row.outstanding, 0n),
    all.reduce(
      (sum, i) =>
        sum +
        (i.amount +
          i.corrections.reduce((s, c) => s + c.amount, 0n) -
          i.allocations.reduce((s, a) => s + a.amount, 0n)),
      0n,
    ),
  );
  for (const row of rows) {
    assert.deepEqual(
      Object.keys(row).sort(),
      [
        "unitNumber",
        "amount",
        "paid",
        "outstanding",
        "unpaidMonths",
        "status",
      ].sort(),
    );
    assert.equal(row.status, row.outstanding > 0n ? "بدهکار" : "تسویه‌شده");
  }
  await assert.rejects(unitDebtStatus({ ...outsider, status: "PENDING" }));
});
