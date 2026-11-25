import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
process.loadEnvFile();
const { isolatedDatabase } = await import("./database");
const isolated = await isolatedDatabase();
process.env.DATABASE_URL = isolated.url;
Object.assign(process.env, {
  NODE_ENV: "development",
  PAYMENT_PROVIDER: "mock",
});
const { db } = await import("../src/lib/db");
const { managementOverview, residentOverview, pendingOverview } =
  await import("../src/modules/dashboards/service");
const {
  createPhysicalGroup,
  endPhysicalGroup,
  assignPhysicalGroupPayer,
  setUnitPosition,
} = await import("../src/modules/building-layout/service");
const { registerUnitResident, saveUnitContact } =
  await import("../src/modules/units/contacts");
const { createPolicy, generateInvoices } =
  await import("../src/modules/billing/service");
const { currentPeriod, periodBounds } =
  await import("../src/modules/billing/calendar");
const { startPayment, simulatePayment } =
  await import("../src/modules/payments/service");
const { audienceUsers } = await import("../src/modules/notifications/common");
type Actor = import("../src/lib/security/core").Actor;
let admin: Actor,
  board: Actor,
  owner: Actor,
  a: Actor,
  b: Actor,
  pending: Actor,
  outsider: Actor;
let buildingId: string;
const unitIds = new Map<string, string>();
let groupId: string;
const actor = async (
  phone: string,
  name: string,
  role?: "SUPER_ADMIN" | "BOARD_MEMBER",
  status: "APPROVED" | "PENDING" = "APPROVED",
) =>
  db.user.create({
    data: {
      phone,
      name,
      status,
      ...(role
        ? { roles: { create: { role: { connect: { name: role } } } } }
        : {}),
    },
    include: { roles: { include: { role: true } } },
  });
before(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  buildingId = (await db.building.create({ data: { key: "delta" } })).id;
  for (const name of [
    "SUPER_ADMIN",
    "BOARD_MEMBER",
    "OWNER",
    "TENANT",
  ] as const)
    await db.role.create({ data: { name } });
  admin = await actor("+989155000001", "TEST dashboard admin", "SUPER_ADMIN");
  board = await actor("+989155000002", "TEST board", "BOARD_MEMBER");
  owner = await actor("+989155000003", "TEST responsible owner");
  a = await actor("+989155000004", "TEST tenant A");
  b = await actor("+989155000005", "TEST tenant B");
  pending = await actor("+989155000006", "TEST pending", undefined, "PENDING");
  outsider = await actor("+989155000007", "TEST outsider");
  const startsAt = new Date(
    periodBounds(currentPeriod()).startsAt.getTime() - 1000,
  );
  for (const number of [45, 32, 21, 44, 23, 31, 22, 43, 33]) {
    const u = await db.unit.create({
      data: {
        buildingId,
        number: String(number),
        floor: String(Math.floor(number / 10)),
        occupancy: "OCCUPIED",
      },
    });
    unitIds.set(u.number, u.id);
    const m = await db.unitMembership.create({
      data: { unitId: u.id, userId: owner.id, kind: "OWNER", startsAt },
    });
    await db.billingResponsibility.create({
      data: { unitId: u.id, userId: owner.id, membershipId: m.id, startsAt },
    });
  }
  for (const [person, number] of [
    [a, "32"],
    [b, "32"],
    [a, "31"],
    [pending, "43"],
  ] as const)
    await db.unitMembership.create({
      data: {
        unitId: unitIds.get(number)!,
        userId: person.id,
        kind: "TENANT",
        startsAt,
      },
    });
});
after(async () => {
  await db.$disconnect();
  await isolated.cleanup();
});
test("Unit 32 appears for managers without personal unit membership; pending access stays private", async () => {
  const data = await managementOverview(admin);
  assert.ok(data.units.some((u) => u.number === "32"));
  assert.equal(data.units.length, 9);
  assert.equal((await managementOverview(board)).units.length, 9);
  assert.equal(
    await db.unitMembership.count({ where: { userId: admin.id } }),
    0,
  );
  await assert.rejects(managementOverview(a));
  await assert.rejects(managementOverview(pending));
  const personal = await pendingOverview(pending);
  assert.deepEqual(
    personal.map((m) => m.unit.number),
    ["43"],
  );
  assert.ok(!JSON.stringify(personal).includes("amount"));
  await assert.rejects(residentOverview(pending));
});
test("two independent tenants share Unit 32 and one tenant switches between two units", async () => {
  const first = await residentOverview(a, unitIds.get("32"));
  const second = await residentOverview(b);
  assert.equal(first.units.length, 2);
  assert.equal(first.selected.number, "32");
  assert.equal(second.selected.number, "32");
  assert.equal(
    (await residentOverview(a, unitIds.get("31"))).selected.number,
    "31",
  );
  await assert.rejects(residentOverview(a, unitIds.get("21")));
  await assert.rejects(residentOverview(outsider));
  const before = await db.unitMembership.count({
    where: { unitId: unitIds.get("32"), endsAt: null },
  });
  await registerUnitResident(admin, {
    unitId: unitIds.get("32"),
    kind: "TENANT",
    name: "TEST tenant C",
    phone: "09155000008",
  });
  assert.equal(
    await db.unitMembership.count({
      where: { unitId: unitIds.get("32"), endsAt: null },
    }),
    before + 1,
  );
  await saveUnitContact(admin, {
    unitId: unitIds.get("32"),
    kind: "TENANT",
    name: "TEST primary tenant A",
    phone: "09155000004",
    approveAccess: true,
  });
  await saveUnitContact(admin, {
    unitId: unitIds.get("32"),
    kind: "TENANT",
    name: "TEST primary tenant B",
    phone: "09155000005",
    approveAccess: true,
  });
  assert.equal(
    await db.unitMembership.count({
      where: { unitId: unitIds.get("32"), endsAt: null },
    }),
    before + 1,
  );
  await assert.rejects(
    registerUnitResident(a, {
      unitId: unitIds.get("32"),
      kind: "TENANT",
      name: "TEST forbidden",
      phone: "09155000009",
    }),
  );
  const audience = await audienceUsers([
    { kind: "UNITS", unitId: unitIds.get("32") },
    { kind: "UNITS", unitId: unitIds.get("31") },
  ]);
  assert.equal(audience.filter((u) => u.id === a.id).length, 1);
  assert.ok(audience.some((u) => u.id === b.id));
});
test("floor order is independent of insertion order and groups span only adjacent positions", async () => {
  const { floorKey } = await import("../src/modules/building-layout/layout");
  for (const unit of [
    { number: "۳۲", floor: "-" },
    { number: "43", floor: "نامشخص" },
    { number: "32", floor: "۳" },
    { number: "999999999999999999999999999999", floor: "-" },
  ]) {
    const result = await db.$queryRaw<
      { floor: string }[]
    >`SELECT delta_layout_floor(${unit.number},${unit.floor}) AS floor`;
    assert.equal(result[0].floor, floorKey(unit));
  }
  const initial = await managementOverview(admin);
  assert.deepEqual(
    initial.floors.map((f) => f.floor),
    ["2", "3", "4"],
  );
  assert.deepEqual(
    initial.floors[2].units.map((p) => p.unit.number),
    ["43", "44", "45"],
  );
  await assert.rejects(
    createPhysicalGroup(admin, {
      unitIds: [unitIds.get("21"), unitIds.get("23")],
    }),
  );
  await assert.rejects(
    createPhysicalGroup(admin, {
      unitIds: [unitIds.get("21"), unitIds.get("32")],
    }),
  );
  const group = await createPhysicalGroup(admin, {
    unitIds: [unitIds.get("22"), unitIds.get("21")],
    occupantLabel: "TEST merged occupant",
  });
  groupId = group.id;
  assert.equal(group.label, "21 + 22");
  assert.deepEqual(
    (await db.physicalGroupMember.findMany({ where: { groupId } }))
      .map((m) => m.unitNumber)
      .sort(),
    ["21", "22"],
  );
  await assert.rejects(
    createPhysicalGroup(board, {
      unitIds: [unitIds.get("22"), unitIds.get("23")],
    }),
  );
  await assert.rejects(
    setUnitPosition(a, { unitId: unitIds.get("32"), position: 1 }),
  );
  await assert.rejects(
    setUnitPosition(admin, { unitId: unitIds.get("21"), position: 3 }),
  );
});
test("physical merging preserves two invoices, a common payer and totals without double counting", async () => {
  await createPolicy(
    admin,
    1000000n,
    currentPeriod(),
    "TEST initial monthly charge",
  );
  await generateInvoices(admin, currentPeriod());
  const original = await db.invoice.findMany({ orderBy: { id: "asc" } });
  assert.equal(original.length, 9);
  assert.equal(
    original.filter((i) => ["21", "22"].includes(i.unitNumber)).length,
    2,
  );
  const firstGroupUnit = [unitIds.get("21")!, unitIds.get("22")!].sort()[0];
  await db.unitMembership.create({
    data: { unitId: firstGroupUnit, userId: a.id, kind: "AUTHORIZED" },
  });
  const responsibilitySnapshot = await db.billingResponsibility.findMany({
    orderBy: { id: "asc" },
  });
  const oldResponsibilities = responsibilitySnapshot.length;
  await assert.rejects(assignPhysicalGroupPayer(admin, groupId, a.id));
  assert.equal(await db.billingResponsibility.count(), oldResponsibilities);
  assert.deepEqual(
    await db.billingResponsibility.findMany({ orderBy: { id: "asc" } }),
    responsibilitySnapshot,
    "A failure on the second unit must roll back the first reassignment",
  );
  await assignPhysicalGroupPayer(admin, groupId, owner.id);
  await generateInvoices(admin, currentPeriod());
  assert.deepEqual(
    await db.invoice.findMany({ orderBy: { id: "asc" } }),
    original,
  );
  const overview = await managementOverview(admin);
  assert.equal(overview.outstanding, 9000000n);
  const grouped = overview.units.filter((u) => ["21", "22"].includes(u.number));
  assert.equal(
    grouped.reduce((s, u) => s + u.outstanding, 0n),
    2000000n,
  );
  assert.equal(
    overview.units.find((u) => u.number === "32")!.outstanding,
    1000000n,
  );
  assert.equal(
    (await residentOverview(a, unitIds.get("32"))).invoices.length,
    0,
  );
  const invoice = original.find((i) => i.unitNumber === "21")!;
  const intent = await startPayment(owner, invoice.id);
  const stored = await db.paymentIntent.findUniqueOrThrow({
    where: { id: intent.intentId },
  });
  await simulatePayment(owner, stored.authority!, "SUCCESS");
  const afterPayment = await managementOverview(admin);
  assert.equal(afterPayment.collected, 1000000n);
  assert.equal(afterPayment.outstanding, 8000000n);
  assert.equal(
    (await residentOverview(owner, unitIds.get("21"))).payments.length,
    1,
  );
  assert.equal(
    (await residentOverview(owner, unitIds.get("22"))).payments.length,
    0,
  );
});
test("PostgreSQL guards physical layout, cross-building membership and historical records", async () => {
  await assert.rejects(
    db.unit.update({
      where: { id: unitIds.get("23")! },
      data: { floor: "۲", physicalPosition: 1 },
    }),
  );
  await assert.rejects(
    db.unit.update({
      where: { id: unitIds.get("23")! },
      data: { floor: "نامشخص", physicalPosition: 1 },
    }),
  );
  await assert.rejects(
    db.unit.update({
      where: { id: unitIds.get("21")! },
      data: { physicalPosition: null },
    }),
  );
  await assert.rejects(db.physicalUnitGroup.delete({ where: { id: groupId } }));
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.physicalUnitGroup.create({
        data: {
          buildingId,
          floor: "3",
          label: "TEST invalid single",
          members: { create: { unitId: unitIds.get("32")!, unitNumber: "32" } },
        },
      });
    }),
  );
  await assert.rejects(db.building.create({ data: { key: "TEST-other" } }));
  await assert.rejects(
    db.physicalGroupMember.create({
      data: {
        groupId,
        unitId: unitIds.get("33")!,
        buildingId: crypto.randomUUID(),
        unitNumber: "33",
      },
    }),
  );
});
test("concurrent group creation has one winner and leaves no overlapping physical occupancy", async () => {
  const input = { unitIds: [unitIds.get("31"), unitIds.get("32")] };
  const results = await Promise.allSettled([
    createPhysicalGroup(admin, input),
    createPhysicalGroup(board, input),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    await db.physicalGroupMember.count({
      where: { unitId: { in: input.unitIds as string[] }, endsAt: null },
    }),
    2,
  );
  const winner = results.find(
    (r) => r.status === "fulfilled",
  ) as PromiseFulfilledResult<Awaited<ReturnType<typeof createPhysicalGroup>>>;
  await endPhysicalGroup(admin, winner.value.id);
});
test("ungrouping and regrouping retain physical history and all financial records", async () => {
  const invoices = await db.invoice.findMany({ orderBy: { id: "asc" } });
  const journals = await db.journalEntry.count();
  await endPhysicalGroup(admin, groupId);
  await endPhysicalGroup(admin, groupId);
  assert.ok(
    (await db.physicalUnitGroup.findUniqueOrThrow({ where: { id: groupId } }))
      .endsAt,
  );
  assert.equal(
    await db.physicalGroupMember.count({
      where: { groupId, endsAt: { not: null } },
    }),
    2,
  );
  const again = await createPhysicalGroup(admin, {
    unitIds: [unitIds.get("21"), unitIds.get("22")],
  });
  assert.notEqual(again.id, groupId);
  assert.deepEqual(
    await db.invoice.findMany({ orderBy: { id: "asc" } }),
    invoices,
  );
  assert.equal(await db.journalEntry.count(), journals);
});
test("additive layout migration preserves v7 units, invoices and posted ledger on an isolated database", async () => {
  const clone = await isolatedDatabase();
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({ datasources: { db: { url: clone.url } } });
  try {
    const execute = (name: string) =>
      execFileSync(
        process.execPath,
        [
          "node_modules/prisma/build/index.js",
          "db",
          "execute",
          "--file",
          `prisma/migrations/${name}/migration.sql`,
          "--schema",
          "prisma/schema.prisma",
        ],
        { env: { ...process.env, DATABASE_URL: clone.url }, stdio: "pipe" },
      );
    for (const migration of readdirSync("prisma/migrations")
      .filter((m) => /^20261123000[1-7]_/.test(m))
      .sort())
      execute(migration);
    const building = await client.building.create({ data: { key: "delta" } });
    const user = await client.user.create({
      data: {
        phone: "+989155000099",
        name: "TEST legacy owner",
        status: "APPROVED",
      },
    });
    const unit = await client.unit.create({
      data: { buildingId: building.id, number: "32", floor: "3" },
      select: { id: true },
    });
    const bounds = periodBounds(currentPeriod());
    const membership = await client.unitMembership.create({
      data: {
        unitId: unit.id,
        userId: user.id,
        kind: "OWNER",
        startsAt: bounds.startsAt,
      },
    });
    const responsibility = await client.billingResponsibility.create({
      data: {
        unitId: unit.id,
        userId: user.id,
        membershipId: membership.id,
        startsAt: bounds.startsAt,
      },
    });
    const policy = await client.chargePolicy.create({
      data: {
        actorId: user.id,
        amount: 1000000n,
        startsAt: bounds.startsAt,
        reason: "TEST legacy charge",
      },
    });
    const period = await client.billingPeriod.create({
      data: {
        key: bounds.key,
        startsAt: bounds.startsAt,
        endsAt: bounds.endsAt,
        dueAt: bounds.dueAt,
      },
    });
    const { post, pair } = await import("../src/modules/accounting/service");
    await client.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          unitId: unit.id,
          unitNumber: "32",
          periodId: period.id,
          policyId: policy.id,
          responsibilityId: responsibility.id,
          responsibleId: user.id,
          responsibleName: user.name!,
          actorId: user.id,
          amount: 1000000n,
          items: {
            create: { description: "TEST legacy invoice", amount: 1000000n },
          },
        },
      });
      await post(
        tx,
        user.id,
        "invoice:" + invoice.id,
        "TEST legacy posted charge",
        bounds.startsAt,
        pair("AR", "REVENUE", 1000000n),
      );
    });
    const tables = await client.$queryRaw<
      { tablename: string }[]
    >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename`;
    async function snapshot() {
      const rows = [];
      for (const { tablename } of tables) {
        const table = '"' + tablename.replaceAll('"', '""') + '"';
        rows.push(
          await client.$queryRawUnsafe(
            `SELECT md5(COALESCE(string_agg((to_jsonb(t)-'physicalPosition')::text,'' ORDER BY (to_jsonb(t)-'physicalPosition')::text),'')) AS hash FROM ${table} t`,
          ),
        );
      }
      return rows;
    }
    const before = await snapshot();
    execute("202611240008_building_layout");
    assert.deepEqual(await snapshot(), before);
    assert.ok(
      await client.$queryRaw`SELECT "physicalPosition" FROM "Unit" LIMIT 1`,
    );
    assert.equal(await client.invoice.count(), 1);
    assert.equal(
      await client.journalEntry.count({ where: { status: "POSTED" } }),
      1,
    );
  } finally {
    await client.$disconnect();
    await clone.cleanup();
  }
});

test("selected-unit debt, miscellaneous charges, partial payments, reversal and ledger reconciliation", async () => {
  const { randomUUID } = await import("node:crypto");
  const { recordUnitDebt, updateUnitDebt } =
    await import("../src/modules/billing/unit-debt");
  const { recordInvoicePayment } =
    await import("../src/modules/payments/manual");
  const { balance } = await import("../src/modules/accounting/service");
  const current = currentPeriod();
  const end = periodBounds(current).startsAt;
  const month = currentPeriod(new Date(end.getTime() - 1));
  const unitId = unitIds.get("21")!;
  const baseline = await managementOverview(board);
  const historical = {
    id: randomUUID(),
    unitId,
    kind: "HISTORICAL" as const,
    period: month,
    reference: "migration batch 21",
    description: "prior month unpaid",
    amount: 500000n,
  };
  await assert.rejects(recordUnitDebt(a, historical));
  const debt = await recordUnitDebt(board, historical);
  await recordUnitDebt(board, historical);
  await assert.rejects(
    recordUnitDebt(board, {
      ...historical,
      id: randomUUID(),
      reference: "another historical record",
    }),
  );
  await assert.rejects(
    recordUnitDebt(board, {
      ...historical,
      id: randomUUID(),
      reference: "existing invoice",
      period: current,
    }),
  );
  await recordUnitDebt(board, {
    ...historical,
    id: randomUUID(),
    kind: "OPENING",
    reference: "opening journal",
    amount: 300000n,
  });
  const misc = await recordUnitDebt(board, {
    ...historical,
    id: randomUUID(),
    kind: "MISC",
    period: current,
    reference: "misc receipt 21",
    amount: 200000n,
  });
  const account = await db.financialAccount.findFirstOrThrow();
  const receipt = {
    id: randomUUID(),
    debtId: debt.id,
    operation: "payment" as const,
    reason: "Bank receipt 21",
    amount: 250000n,
    financialAccountId: account.id,
  };
  await updateUnitDebt(board, receipt);
  await updateUnitDebt(board, receipt);
  await assert.rejects(
    updateUnitDebt(board, { ...receipt, id: randomUUID(), amount: 250001n }),
  );
  const adjustment = await updateUnitDebt(board, {
    id: randomUUID(),
    debtId: misc.id,
    operation: "decrease",
    amount: 100000n,
    reason: "credit approved",
  });
  await updateUnitDebt(board, {
    id: randomUUID(),
    debtId: misc.id,
    operation: "reverse",
    entryId: adjustment.id,
    reason: "reverse credit",
  });
  const invoice = await db.invoice.findFirstOrThrow({
    where: { unitId: unitIds.get("22")! },
  });
  const manual = {
    id: randomUUID(),
    invoiceId: invoice.id,
    financialAccountId: account.id,
    amount: 100000n,
    reason: "Bank receipt INV21",
  };
  await recordInvoicePayment(board, manual);
  await recordInvoicePayment(board, manual);
  const updated = await managementOverview(board);
  assert.equal(updated.outstanding, await balance(db, "AR"));
  assert.equal(updated.otherReceivables - baseline.otherReceivables, 750000n);
  assert.equal(
    updated.monthlyCollections - baseline.monthlyCollections,
    350000n,
  );
  assert.equal(
    updated.units.find((u) => u.number === "21")!.outstanding -
      baseline.units.find((u) => u.number === "21")!.outstanding,
    750000n,
  );
  assert.equal(
    updated.units.find((u) => u.number === "22")!.outstanding,
    baseline.units.find((u) => u.number === "22")!.outstanding - 100000n,
  );
  assert.ok(updated.units.find((u) => u.number === "21")!.overdue > 0n);
  await assert.rejects(
    db.unitDebt.update({
      where: { id: debt.id },
      data: { description: "overwrite" },
    }),
  );
});

test("billing falls back to the sole tenant or owner and requires an explicit designation for ambiguity", async () => {
  const { billingCandidate, designatePayerForPeriod } =
    await import("../src/modules/billing/responsibility");
  const { assignBilling } = await import("../src/modules/units/service");
  const building = await db.building.findUniqueOrThrow({
    where: { key: "delta" },
  });
  const unit = await db.unit.create({
    data: { number: "56", floor: "5", buildingId: building.id },
  });
  const startsAt = periodBounds(currentPeriod()).startsAt;
  await db.unitMembership.create({
    data: { unitId: unit.id, userId: owner.id, startsAt, kind: "OWNER" },
  });
  assert.equal(
    (await billingCandidate(db, unit.id, new Date())).member?.userId,
    owner.id,
  );
  const tenant = await db.unitMembership.create({
    data: { unitId: unit.id, userId: a.id, startsAt, kind: "TENANT" },
  });
  assert.equal(
    (await billingCandidate(db, unit.id, new Date())).member?.userId,
    a.id,
  );
  await db.unitMembership.create({
    data: { unitId: unit.id, userId: b.id, startsAt, kind: "TENANT" },
  });
  await assert.rejects(generateInvoices(board, currentPeriod()), /چند عضو/);
  await db.unitMembership.updateMany({
    where: { unitId: unit.id, userId: b.id },
    data: { endsAt: new Date() },
  });
  await assignBilling(board, unit.id, tenant.id);
  assert.equal(
    (await billingCandidate(db, unit.id, new Date())).assigned?.userId,
    a.id,
  );
  const second = await db.unit.create({
    data: { number: "57", floor: "5", buildingId: building.id },
  });
  await db.unitMembership.create({
    data: { unitId: second.id, userId: a.id, startsAt, kind: "TENANT" },
  });
  await designatePayerForPeriod(board, {
    unitId: unit.id,
    membershipId: tenant.id,
    period: currentPeriod(),
    reason: "Tenant designated for this cutoff",
  });
  await generateInvoices(board, currentPeriod());
  assert.equal(
    (await db.invoice.findFirstOrThrow({ where: { unitId: unit.id } }))
      .responsibleId,
    a.id,
  );
  assert.equal(
    (await db.invoice.findFirstOrThrow({ where: { unitId: second.id } }))
      .responsibleId,
    a.id,
  );
});

test("board SMS selects and deduplicates recipients and only dispatches confirmed previews in simulation", async () => {
  const {
    boardRecipients,
    previewBoardSms,
    confirmBoardSms,
    dispatchBoardSms,
  } = await import("../src/modules/sms/board");
  const tenant = await db.user.findUniqueOrThrow({ where: { id: a.id } });
  const owners = await boardRecipients(board, { kind: "OWNER", selected: [] });
  const tenants = await boardRecipients(board, {
    kind: "TENANT",
    selected: [],
  });
  assert.ok(owners.length > 0);
  assert.equal(tenants.filter((phone) => phone === tenant.phone).length, 1);
  assert.ok(
    (
      await boardRecipients(board, {
        kind: "UNIT",
        selected: [unitIds.get("32")!],
      })
    ).includes(tenant.phone),
  );
  assert.ok(
    (await boardRecipients(board, { kind: "FLOOR", selected: ["3"] })).includes(
      tenant.phone,
    ),
  );
  assert.deepEqual(
    await boardRecipients(board, { kind: "CONTACT", selected: [a.id] }),
    [tenant.phone],
  );
  assert.ok(
    (await boardRecipients(board, { kind: "DEBT", selected: [] })).length > 0,
  );
  await assert.rejects(boardRecipients(a, { kind: "ALL", selected: [] }));
  const input = { kind: "CONTACT" as const, selected: [a.id] };
  const preview = await previewBoardSms(board, input);
  process.env.NOTIFICATION_SMS_PROVIDER = "development";
  try {
    await assert.rejects(
      confirmBoardSms(board, input, { ...preview, signature: "forged" }),
    );
    await confirmBoardSms(board, input, preview);
    await confirmBoardSms(board, input, preview);
    const jobs = await db.outboxJob.findMany({
      where: { kind: "COMM_BOARD_SMS" },
    });
    assert.equal(jobs.length, 1);
    await dispatchBoardSms(jobs[0].payload as Record<string, unknown>);
    await dispatchBoardSms(jobs[0].payload as Record<string, unknown>);
    const records = await db.auditLog.findMany({
      where: { action: "sms.board.result" },
    });
    assert.equal(records.length, 1);
    assert.equal(
      (records[0].details as { status: string }).status,
      "SIMULATED",
    );
  } finally {
    delete process.env.NOTIFICATION_SMS_PROVIDER;
  }
});
