import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
process.loadEnvFile();
const { isolatedDatabase } = await import("./database");
const isolated = await isolatedDatabase();
process.env.DATABASE_URL = isolated.url;
const { db } = await import("../src/lib/db");
const { requestOtp, verifyOtp } = await import("../src/modules/auth/service");
const { saveUnit, assignMember, assignBilling, endMember, visibleUnit } =
  await import("../src/modules/units/service");
const { approveUser } = await import("../src/modules/users/service");
const { assignBoard, endBoard } = await import("../src/modules/board/service");
let admin: Awaited<ReturnType<typeof db.user.create>> & {
  roles: { role: { name: string } }[];
};
let resident: typeof admin;
let tenant: typeof admin;
let unit: Awaited<ReturnType<typeof db.unit.create>>;
before(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  await db.building.create({ data: { key: "delta" } });
  for (const name of [
    "SUPER_ADMIN",
    "BOARD_MEMBER",
    "OWNER",
    "TENANT",
  ] as const)
    await db.role.create({ data: { name } });
  const role = await db.role.findUniqueOrThrow({
    where: { name: "SUPER_ADMIN" },
  });
  admin = await db.user.create({
    data: {
      phone: "+989100000001",
      name: "Test administrator",
      status: "APPROVED",
      roles: { create: { roleId: role.id } },
    },
    include: { roles: { include: { role: true } } },
  });
  resident = await db.user.create({
    data: { phone: "+989100000002", name: "Test owner" },
    include: { roles: { include: { role: true } } },
  });
  tenant = await db.user.create({
    data: { phone: "+989100000003", name: "Test tenant" },
    include: { roles: { include: { role: true } } },
  });
});
after(async () => {
  await db.$disconnect();
  await isolated.cleanup();
});
test("OTP flow generates hashed challenges, cooldown, attempts, reuse and expiration", async () => {
  let captured = "";
  const challenge = await requestOtp(
    "+989100000004",
    "test-origin",
    async (_phone, code) => {
      captured = code;
    },
  );
  const stored = await db.oTPChallenge.findUniqueOrThrow({
    where: { id: challenge.challengeId },
  });
  assert.notEqual(stored.codeHash, captured);
  assert.equal(stored.attempts, 0);
  await assert.rejects(
    requestOtp("+989100000004", "test-origin", async () => {}),
  );
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      verifyOtp(
        challenge.challengeId,
        captured === "000000" ? "111111" : "000000",
        "test-origin",
      ),
    );
  await assert.rejects(
    verifyOtp(challenge.challengeId, captured, "test-origin"),
  );
  const second = await requestOtp(
    "+989100000005",
    "test-origin",
    async (_phone, code) => {
      captured = code;
    },
  );
  const result = await verifyOtp(second.challengeId, captured, "test-origin");
  assert.equal(result.user.status, "PENDING");
  assert.ok(result.token);
  await assert.rejects(verifyOtp(second.challengeId, captured, "test-origin"));
  const expired = await requestOtp(
    "+989100000006",
    "test-origin",
    async (_phone, code) => {
      captured = code;
    },
  );
  await db.oTPChallenge.update({
    where: { id: expired.challengeId },
    data: {
      createdAt: new Date(Date.now() - 600000),
      expiresAt: new Date(Date.now() - 10000),
    },
  });
  await assert.rejects(verifyOtp(expired.challengeId, captured, "test-origin"));
});
test("management approves users and assigns multiple owners and tenancy", async () => {
  await assert.rejects(
    saveUnit(resident, {
      number: "TEST-A",
      floor: "TEST",
      occupancy: "UNKNOWN",
      active: true,
    }),
  );
  unit = await saveUnit(admin, {
    number: "TEST-A",
    floor: "TEST",
    occupancy: "UNKNOWN",
    active: true,
  });
  await assert.rejects(
    assignMember(admin, {
      unitId: unit.id,
      userId: resident.id,
      kind: "OWNER",
    }),
  );
  await approveUser(admin, resident.id, "APPROVED");
  await approveUser(admin, tenant.id, "APPROVED");
  resident = await db.user.findUniqueOrThrow({
    where: { id: resident.id },
    include: { roles: { include: { role: true } } },
  });
  await assignMember(admin, {
    unitId: unit.id,
    userId: resident.id,
    kind: "OWNER",
  });
  await assignMember(admin, {
    unitId: unit.id,
    userId: tenant.id,
    kind: "OWNER",
  });
  await assignMember(admin, {
    unitId: unit.id,
    userId: tenant.id,
    kind: "TENANT",
  });
  assert.equal(
    await db.unitMembership.count({ where: { unitId: unit.id, endsAt: null } }),
    3,
  );
  assert.equal((await visibleUnit(resident, unit.id)).id, unit.id);
  await assert.rejects(
    assignMember(resident, {
      unitId: unit.id,
      userId: tenant.id,
      kind: "TENANT",
    }),
  );
  await assert.rejects(
    assignBilling(
      resident,
      unit.id,
      (await db.unitMembership.findFirstOrThrow({ where: { unitId: unit.id } }))
        .id,
    ),
  );

  const outsider = await db.user.create({
    data: { phone: "+989100000007", name: "Test outsider", status: "APPROVED" },
    include: { roles: { include: { role: true } } },
  });
  await assert.rejects(visibleUnit(outsider, unit.id));
});
test("billing replacement preserves history and concurrent overlap is rejected by PostgreSQL", async () => {
  const memberships = await db.unitMembership.findMany({
    where: { unitId: unit.id, endsAt: null },
    orderBy: { createdAt: "asc" },
  });
  await assignBilling(admin, unit.id, memberships[0].id);
  await assignBilling(admin, unit.id, memberships[2].id);
  assert.equal(
    await db.billingResponsibility.count({
      where: { unitId: unit.id, endsAt: null },
    }),
    1,
  );
  assert.equal(
    await db.billingResponsibility.count({ where: { unitId: unit.id } }),
    2,
  );
  await assert.rejects(
    db.billingResponsibility.create({
      data: {
        unitId: unit.id,
        userId: memberships[1].userId,
        membershipId: memberships[1].id,
      },
    }),
  );
  const b = await db.building.findUniqueOrThrow({ where: { key: "delta" } });
  const concurrent = await db.unit.create({
    data: { buildingId: b.id, number: "TEST-CONCURRENT", floor: "TEST" },
  });
  const m = await db.unitMembership.create({
    data: { unitId: concurrent.id, userId: resident.id, kind: "OWNER" },
  });
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      db.billingResponsibility.create({
        data: {
          unitId: concurrent.id,
          userId: resident.id,
          membershipId: m.id,
        },
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(
    db.unitMembership.update({
      where: { id: memberships[0].id },
      data: { unitId: concurrent.id },
    }),
  );
  await endMember(admin, memberships[2].id);
  assert.equal(
    await db.billingResponsibility.count({
      where: { unitId: unit.id, endsAt: null },
    }),
    0,
  );
});
test("board role is independent and suspension revokes sessions", async () => {
  await assert.rejects(
    assignBoard(resident, {
      userId: tenant.id,
      title: "Forbidden appointment",
    }),
  );
  await assignBoard(admin, { userId: resident.id, title: "Test board term" });
  const board = await db.user.findUniqueOrThrow({
    where: { id: resident.id },
    include: { roles: { include: { role: true } } },
  });
  assert.ok(board.roles.some((r) => r.role.name === "BOARD_MEMBER"));
  assert.ok(
    await db.unitMembership.count({
      where: { userId: resident.id, kind: "OWNER" },
    }),
  );
  const member = await db.boardMember.findFirstOrThrow({
    where: { userId: resident.id, endsAt: null },
  });
  await endBoard(admin, member.id);
  assert.equal(
    await db.userRole.count({
      where: { userId: resident.id, role: { name: "BOARD_MEMBER" } },
    }),
    0,
  );
  const session = await db.session.create({
    data: {
      userId: resident.id,
      tokenHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  await approveUser(admin, resident.id, "SUSPENDED");
  assert.ok(
    (await db.session.findUniqueOrThrow({ where: { id: session.id } }))
      .revokedAt,
  );
  await assert.rejects(approveUser(admin, admin.id, "SUSPENDED"));
});
test("database enforces 18 units and immutable audit history", async () => {
  const building = await db.building.findUniqueOrThrow({
    where: { key: "delta" },
  });
  const current = await db.unit.count();
  for (let n = current; n < 18; n++)
    await db.unit.create({
      data: { buildingId: building.id, number: "TEST-" + n, floor: "TEST" },
    });
  await assert.rejects(
    db.unit.create({
      data: { buildingId: building.id, number: "TEST-OVERFLOW", floor: "TEST" },
    }),
  );
  const log = await db.auditLog.findFirstOrThrow();
  await assert.rejects(
    db.auditLog.update({ where: { id: log.id }, data: { action: "tampered" } }),
  );
  await assert.rejects(db.auditLog.delete({ where: { id: log.id } }));
});

test("database rate counters limit both phone and request origin", async () => {
  const phone = "+989200000001";
  for (let i = 0; i < 5; i++) {
    const c = await requestOtp(phone, "phone-rate-origin", async () => {});
    await db.oTPChallenge.update({
      where: { id: c.challengeId },
      data: { createdAt: new Date(Date.now() - 61000) },
    });
  }
  await assert.rejects(requestOtp(phone, "phone-rate-origin", async () => {}));
  for (let i = 0; i < 20; i++)
    await requestOtp(
      "+989" + String(300000000 + i),
      "origin-rate-limit",
      async () => {},
    );
  await assert.rejects(
    requestOtp("+989300000099", "origin-rate-limit", async () => {}),
  );
});

test("fixed OTP is gated at verification and retains challenge security", async () => {
  const original = { ...process.env };
  try {
    let index = 20;
    for (const environment of ["production", "test", "development"]) {
      Object.assign(process.env, {
        NODE_ENV: environment,
        DEV_FIXED_OTP_ENABLED: "true",
      });
      const challenge = await requestOtp(
        "+9891000000" + index++,
        "fixed-gate",
        async () => {},
      );
      if (environment !== "development") {
        await assert.rejects(
          verifyOtp(challenge.challengeId, "1234", "fixed-gate"),
        );
        assert.equal(
          (
            await db.oTPChallenge.findUniqueOrThrow({
              where: { id: challenge.challengeId },
            })
          ).attempts,
          1,
        );
      } else {
        const result = await verifyOtp(
          challenge.challengeId,
          "1234",
          "fixed-gate",
        );
        assert.equal(result.user.status, "PENDING");
        await assert.rejects(
          verifyOtp(challenge.challengeId, "1234", "fixed-gate"),
        );
      }
    }
    Object.assign(process.env, {
      NODE_ENV: "development",
      DEV_FIXED_OTP_ENABLED: "false",
    });
    const disabled = await requestOtp(
      "+989100000023",
      "fixed-gate",
      async () => {},
    );
    await assert.rejects(verifyOtp(disabled.challengeId, "1234", "fixed-gate"));
    process.env.DEV_FIXED_OTP_ENABLED = "true";
    for (let i = 1; i < 5; i++)
      await assert.rejects(
        verifyOtp(disabled.challengeId, "9999", "fixed-gate"),
      );
    await assert.rejects(verifyOtp(disabled.challengeId, "1234", "fixed-gate"));
    const expired = await requestOtp(
      "+989100000024",
      "fixed-gate",
      async () => {},
    );
    await db.oTPChallenge.update({
      where: { id: expired.challengeId },
      data: {
        createdAt: new Date(Date.now() - 600000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await assert.rejects(verifyOtp(expired.challengeId, "1234", "fixed-gate"));
    await assert.rejects(
      assignBilling(
        resident,
        unit.id,
        (
          await db.unitMembership.findFirstOrThrow({
            where: { unitId: unit.id },
          })
        ).id,
      ),
    );
    await assert.rejects(
      assignMember(resident, {
        unitId: unit.id,
        userId: tenant.id,
        kind: "TENANT",
      }),
    );
  } finally {
    process.env = original;
  }
});

test("management preregisters optional owner/tenant contacts without requiring login or silently approving access", async () => {
  const { saveUnitContact, preferredUnitContact } =
    await import("../src/modules/units/contacts");
  await assert.rejects(
    saveUnitContact(resident, {
      unitId: unit.id,
      kind: "OWNER",
      name: "TEST forbidden",
      phone: "09170000001",
    }),
  );
  const ownerContact = await saveUnitContact(admin, {
    unitId: unit.id,
    kind: "OWNER",
    name: "TEST preregistered owner",
    phone: "09170000001",
  });
  const ownerAccount = await db.user.findUniqueOrThrow({
    where: { id: ownerContact.userId! },
  });
  assert.equal(ownerAccount.status, "PENDING");
  let captured = "";
  const challenge = await requestOtp(
    ownerAccount.phone,
    "preregistration-test",
    async (_phone, code) => {
      captured = code;
    },
  );
  const login = await verifyOtp(
    challenge.challengeId,
    captured,
    "preregistration-test",
  );
  assert.equal(login.user.id, ownerAccount.id);
  assert.equal(login.user.status, "PENDING");

  assert.equal(
    await db.session.count({ where: { userId: ownerAccount.id } }),
    1,
  );
  assert.equal(
    await db.unitMembership.count({
      where: {
        userId: ownerAccount.id,
        unitId: unit.id,
        kind: "OWNER",
        endsAt: null,
      },
    }),
    1,
  );
  const unknownTenant = await saveUnitContact(admin, {
    unitId: unit.id,
    kind: "TENANT",
    name: "TEST tenant number later",
    phone: "",
  });
  assert.equal(unknownTenant.userId, null);
  assert.equal(
    preferredUnitContact({ active: true, occupancy: "OCCUPIED" }, [
      ownerContact,
      unknownTenant,
    ])?.kind,
    "OWNER",
  );
  const tenantContact = await saveUnitContact(admin, {
    unitId: unit.id,
    kind: "TENANT",
    name: "TEST preregistered tenant",
    phone: "۰۹۱۷۰۰۰۰۰۰۲",
    approveAccess: true,
  });
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: tenantContact.userId! } }))
      .status,
    "APPROVED",
  );
  assert.equal(
    preferredUnitContact({ active: true, occupancy: "OCCUPIED" }, [
      ownerContact,
      tenantContact,
    ])?.kind,
    "TENANT",
  );
  assert.equal(
    preferredUnitContact({ active: true, occupancy: "VACANT" }, [
      ownerContact,
      tenantContact,
    ])?.kind,
    "OWNER",
  );
  assert.equal(
    preferredUnitContact({ active: false, occupancy: "OCCUPIED" }, [
      ownerContact,
      tenantContact,
    ])?.kind,
    "OWNER",
  );
  await saveUnitContact(admin, {
    unitId: unit.id,
    kind: "TENANT",
    name: "TEST revised tenant",
    phone: "09170000002",
  });
  assert.equal(
    await db.unitMembership.count({
      where: {
        userId: tenantContact.userId!,
        unitId: unit.id,
        kind: "TENANT",
        endsAt: null,
      },
    }),
    1,
  );
  await db.user.update({
    where: { id: tenantContact.userId! },
    data: { status: "SUSPENDED" },
  });
  await assert.rejects(
    saveUnitContact(admin, {
      unitId: unit.id,
      kind: "TENANT",
      name: "TEST tenant",
      phone: "09170000002",
      approveAccess: true,
    }),
  );
  const replacement = await saveUnitContact(admin, {
    unitId: unit.id,
    kind: "TENANT",
    name: "TEST new tenant",
    phone: "09170000003",
  });
  assert.notEqual(replacement.userId, tenantContact.userId);
  assert.equal(
    await db.unitMembership.count({
      where: { userId: tenantContact.userId!, unitId: unit.id, endsAt: null },
    }),
    0,
  );
  assert.ok(
    await db.unitMembership.count({
      where: {
        userId: tenantContact.userId!,
        unitId: unit.id,
        endsAt: { not: null },
      },
    }),
  );
});

test("SMS settings are super-admin only, encrypted and redacted; Faraz pattern acceptance is not delivery", async () => {
  const { saveSmsSettings, smsSettingsView, decryptSmsKey } =
    await import("../src/modules/sms/settings");
  const { sendFarazPattern } = await import("../src/modules/sms/faraz");
  const config = {
    enabled: true,
    apiKey: "test-only-api-key-never-real",
    clearApiKey: false,
    fromNumber: "+983000505",
    patterns: {
      OTP: { code: "testOtp", variable: "code" },
      general: { code: "testNotice", variable: "message" },
    },
  };
  await assert.rejects(saveSmsSettings(resident, config));
  await assert.rejects(smsSettingsView(resident));
  await saveSmsSettings(admin, config);
  const stored = await db.smsProviderSetting.findUniqueOrThrow({
    where: { key: "farazsms" },
  });
  assert.notEqual(stored.encryptedApiKey, config.apiKey);
  assert.equal(decryptSmsKey(stored.encryptedApiKey!), config.apiKey);
  const view = await smsSettingsView(admin);
  assert.ok(view.hasApiKey);
  assert.ok(!JSON.stringify(view).includes(config.apiKey));
  let sent = 0;
  const mock: typeof fetch = async (url, init) => {
    sent++;
    assert.equal(String(url), "https://edge.ippanel.com/v1/api/send");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      config.apiKey,
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      sending_type: "pattern",
      from_number: config.fromNumber,
      code: "testOtp",
      recipients: ["+989170000001"],
      params: { code: "654321" },
    });
    return Response.json({
      meta: { status: true },
      data: { message_outbox_ids: [1123594208] },
    });
  };
  assert.deepEqual(
    await sendFarazPattern("09170000001", "OTP", "654321", mock),
    { status: "ACCEPTED", providerMessageId: "1123594208" },
  );
  assert.equal(sent, 1);
  await assert.rejects(
    sendFarazPattern("09170000001", "financial", "generic", mock),
    /UNCONFIGURED/,
  );
  await assert.rejects(
    sendFarazPattern("09170000001", "OTP", "654321", async () => {
      throw new Error("network");
    }),
    /UNKNOWN/,
  );
  await assert.rejects(
    sendFarazPattern(
      "09170000001",
      "OTP",
      "654321",
      async () => new Response("", { status: 429 }),
    ),
    /TRANSIENT/,
  );
  await assert.rejects(
    sendFarazPattern("09170000001", "OTP", "654321", async () =>
      Response.json({ meta: { status: false }, data: null }),
    ),
    /PROVIDER_REJECTED/,
  );
  await saveSmsSettings(admin, { ...config, apiKey: "", enabled: false });
  assert.equal((await smsSettingsView(admin)).hasApiKey, true);
  await assert.rejects(
    sendFarazPattern("09170000001", "OTP", "654321", mock),
    /UNCONFIGURED/,
  );
  await saveSmsSettings(admin, {
    ...config,
    apiKey: "",
    enabled: false,
    clearApiKey: true,
  });
  assert.equal((await smsSettingsView(admin)).hasApiKey, false);
});

test("nine independent SMS event patterns map multiple variables, reject incomplete dispatch and retain audit identity", async () => {
  const { smsEvents, smsEventKeys, requiredVariables } =
    await import("../src/modules/sms/events");
  const { saveEventTemplate, saveReminderPolicy } =
    await import("../src/modules/sms/template-service");
  const { saveSmsSettings } = await import("../src/modules/sms/settings");
  const { sendFarazEvent } = await import("../src/modules/sms/faraz");
  await saveSmsSettings(admin, {
    enabled: true,
    apiKey: "only-test-not-real",
    clearApiKey: false,
    fromNumber: "+983000505",
  });
  let calls = 0;
  for (const event of smsEventKeys) {
    const variables = requiredVariables(event);
    const mapping = Object.fromEntries(variables.map((v) => [v, "v_" + v]));
    const payload = smsEvents[event].schema.parse(
      Object.fromEntries(
        variables.map((v) => [
          v,
          v === "code"
            ? "654321"
            : v === "message"
              ? "اطلاعیه اضطراری ساختمان؛ برای مشاهده جزئیات وارد سامانه شوید."
              : "TEST event value",
        ]),
      ),
    );
    await assert.rejects(
      saveEventTemplate(resident, {
        eventKey: event,
        providerCode: "testCode",
        enabled: true,
        variableMapping: mapping,
        description: "test",
      }),
    );
    await saveEventTemplate(admin, {
      eventKey: event,
      providerCode: "test_" + smsEvents[event].pattern,
      enabled: true,
      variableMapping: mapping,
      description: "TEST nine-event template",
    });
    const mock: typeof fetch = async (_url, init) => {
      calls++;
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.code, "test_" + smsEvents[event].pattern);
      assert.deepEqual(
        sent.params,
        Object.fromEntries(
          Object.entries(payload).map(([key, value]) => [mapping[key], value]),
        ),
      );
      return Response.json({
        meta: { status: true },
        data: { message_outbox_ids: [9000 + calls] },
      });
    };
    const result = await sendFarazEvent("09170000001", event, payload, mock);
    assert.equal(result.status, "ACCEPTED");
    assert.ok(!JSON.stringify(result).includes("654321"));
    const missing = { ...payload } as Record<string, string>;
    delete missing[variables[0]];
    await assert.rejects(
      sendFarazEvent("09170000001", event, missing as typeof payload, mock),
      /SMS_PAYLOAD_INVALID/,
    );
    await assert.rejects(
      db.smsEventTemplate.update({
        where: { eventKey: event },
        data: { variableMapping: {} },
      }),
    );
    await saveEventTemplate(admin, {
      eventKey: event,
      providerCode: "",
      enabled: false,
      variableMapping: {},
      description: "disabled safely",
    });
    await assert.rejects(
      sendFarazEvent("09170000001", event, payload, mock),
      /PATTERN_DISABLED/,
    );
  }
  assert.equal(calls, 9);
  await assert.rejects(
    saveReminderPolicy(admin, {
      beforeDueDays: 3,
      overdueDays: 7,
      followupDays: 2,
      meetingHours: 24,
    }),
  );
  await saveReminderPolicy(admin, {
    beforeDueDays: 5,
    overdueDays: 3,
    followupDays: null,
    meetingHours: 36,
  });
  assert.equal(
    (
      await db.smsReminderPolicy.findUniqueOrThrow({
        where: { key: "default" },
      })
    ).meetingHours,
    36,
  );
  const history = await db.auditLog.findMany({
    where: { action: "sms.template.save" },
  });
  assert.ok(history.length >= 18);
  assert.ok(!JSON.stringify(history).includes("654321"));
  assert.ok(!JSON.stringify(history).includes("only-test-not-real"));
});

test("additive event migration preserves legacy settings and migrates only unambiguous OTP", async () => {
  const { readdirSync } = await import("node:fs");
  const { PrismaClient } = await import("@prisma/client");
  const nested = await isolatedDatabase();
  const env = { ...process.env, DATABASE_URL: nested.url };
  const migrationRoot = "prisma/migrations";
  const migrationNames = readdirSync(migrationRoot)
    .filter((name) => /^\d/.test(name))
    .sort();
  const client = new PrismaClient({ datasources: { db: { url: nested.url } } });
  try {
    for (const name of migrationNames.filter(
      (name) => !name.endsWith("sms_events"),
    ))
      execFileSync(
        process.execPath,
        [
          "node_modules/prisma/build/index.js",
          "db",
          "execute",
          "--schema",
          "prisma/schema.prisma",
          "--file",
          `${migrationRoot}/${name}/migration.sql`,
        ],
        { env, stdio: "pipe" },
      );
    const user = await client.user.create({
      data: { phone: "+989177000001", name: "MIGRATION TEST administrator" },
    });
    const legacy = {
      OTP: { code: "existingOtpCode", variable: "login_code" },
      financial: { code: "keepFinancialCode", variable: "old_message" },
    };
    await client.smsProviderSetting.create({
      data: {
        key: "farazsms",
        enabled: true,
        encryptedApiKey: "preserve-original-ciphertext",
        fromNumber: "+983000505",
        patterns: legacy,
        updatedById: user.id,
      },
    });
    execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "db",
        "execute",
        "--schema",
        "prisma/schema.prisma",
        "--file",
        `${migrationRoot}/202611230006_sms_events/migration.sql`,
      ],
      { env, stdio: "pipe" },
    );
    const setting = await client.smsProviderSetting.findUniqueOrThrow({
      where: { key: "farazsms" },
    });
    assert.deepEqual(setting.patterns, legacy);
    assert.equal(setting.encryptedApiKey, "preserve-original-ciphertext");
    const otp = await client.smsEventTemplate.findUniqueOrThrow({
      where: { eventKey: "auth.otp" },
    });
    assert.equal(otp.providerCode, "existingOtpCode");
    assert.equal(otp.enabled, true);
    assert.deepEqual(otp.variableMapping, { code: "login_code" });
    assert.equal(
      await client.smsEventTemplate.count({ where: { enabled: false } }),
      8,
    );
    assert.equal(
      (
        await client.smsEventTemplate.findUniqueOrThrow({
          where: { eventKey: "billing.invoice.issued" },
        })
      ).providerCode,
      null,
    );
  } finally {
    await client.$disconnect();
    await nested.cleanup();
  }
});
