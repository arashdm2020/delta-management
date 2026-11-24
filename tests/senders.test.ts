import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
process.loadEnvFile();
process.env.FARAZSMS_API_KEY = "";
const { isolatedDatabase } = await import("./database");
const isolated = await isolatedDatabase();
process.env.DATABASE_URL = isolated.url;
const { db } = await import("../src/lib/db");
const { saveSmsSettings, smsSettingsView, decryptSmsKey } =
  await import("../src/modules/sms/settings");
const { refreshSenderLines } =
  await import("../src/modules/sms/sender-settings");
const { discoverAccessibleLines, parseAccessibleLines } =
  await import("../src/modules/sms/lines");
type Actor = import("../src/lib/security/core").Actor;
let admin: Actor, resident: Actor;
const response =
  (lines: string[]): typeof fetch =>
  async (_url, init) => {
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init.headers).get("Accept"), "application/json");
    assert.ok(new Headers(init.headers).has("Api-Key"));
    return Response.json({
      status: "success",
      data: lines.map((number) => ({ number })),
    });
  };
before(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  const role = await db.role.create({ data: { name: "SUPER_ADMIN" } });
  admin = await db.user.create({
    data: {
      phone: "+989176000001",
      name: "TEST sender administrator",
      status: "APPROVED",
      roles: { create: { roleId: role.id } },
    },
    include: { roles: { include: { role: true } } },
  });
  resident = await db.user.create({
    data: { phone: "+989176000002", name: "TEST resident", status: "APPROVED" },
    include: { roles: { include: { role: true } } },
  });
});
after(async () => {
  await db.$disconnect();
  await isolated.cleanup();
});
test("SDK-derived candidate envelopes are strict, sanitized and never guess line fields", async () => {
  assert.deepEqual(
    parseAccessibleLines({
      status: "success",
      data: [{ number: "300100" }, { number: "300100", is_dedicated: false }],
    }).numbers,
    ["300100"],
  );
  assert.deepEqual(
    parseAccessibleLines({
      status: "success",
      data: { data: [{ number: "300200" }], last_page: 1, current_page: 1 },
    }).numbers,
    ["300200"],
  );
  assert.deepEqual(
    parseAccessibleLines({ status: "success", data: [] }).numbers,
    [],
  );
  assert.throws(
    () =>
      parseAccessibleLines({
        status: "success",
        data: [{ line_number: "PRIVATE_ACCOUNT_VALUE" }],
      }),
    (error) =>
      error instanceof Error &&
      error.message.includes("number") &&
      !error.message.includes("PRIVATE_ACCOUNT_VALUE"),
  );
  assert.throws(() => parseAccessibleLines([{ number: "300100" }]), /ساختار/);
  assert.throws(() =>
    parseAccessibleLines({
      status: "success",
      data: [{ number: Number.MAX_SAFE_INTEGER + 1 }],
    }),
  );
});
test("admin-only discovery proposes one candidate but never infers pattern authorization", async () => {
  await assert.rejects(
    refreshSenderLines(resident, "test-key", undefined, response(["300100"])),
  );
  const count = await refreshSenderLines(
    admin,
    "TEST-key-one",
    "",
    response(["300100"]),
  );
  assert.equal(count, 1);
  const view = await smsSettingsView(admin);
  assert.equal(view.fromNumber, "300100");
  assert.equal(view.patternConfirmed, false);
  assert.equal(view.enabled, false);
  assert.ok(!JSON.stringify(view).includes("TEST-key-one"));
  await assert.rejects(
    saveSmsSettings(admin, {
      enabled: true,
      apiKey: "",
      clearApiKey: false,
      fromNumber: "300100",
      patternConfirmed: false,
      expectedRevision: view.revision,
    }),
  );
  await saveSmsSettings(admin, {
    enabled: true,
    apiKey: "",
    clearApiKey: false,
    fromNumber: "300100",
    patternConfirmed: true,
    expectedRevision: view.revision,
  });
  assert.equal((await smsSettingsView(admin)).enabled, true);
});
test("rotation with multiple lines clears old selection and requires explicit valid selection", async () => {
  let view = await smsSettingsView(admin);
  await refreshSenderLines(
    admin,
    "TEST-key-two",
    view.revision,
    response(["300100", "300200"]),
  );
  view = await smsSettingsView(admin);
  assert.equal(view.fromNumber, "");
  assert.equal(view.enabled, false);
  assert.equal(view.patternConfirmed, false);
  await assert.rejects(
    saveSmsSettings(admin, {
      enabled: true,
      apiKey: "",
      clearApiKey: false,
      fromNumber: "999999",
      patternConfirmed: true,
      expectedRevision: view.revision,
    }),
  );
  await saveSmsSettings(admin, {
    enabled: true,
    apiKey: "",
    clearApiKey: false,
    fromNumber: "300200",
    patternConfirmed: true,
    expectedRevision: view.revision,
  });
  assert.equal((await smsSettingsView(admin)).fromNumber, "300200");
});
test("invalid keys, timeout and malformed responses leave stored configuration untouched", async () => {
  const before = await db.smsProviderSetting.findUniqueOrThrow({
    where: { key: "farazsms" },
  });
  for (const transport of [
    async () => new Response("", { status: 401 }),
    async () => {
      throw new Error("SECRET_DO_NOT_LOG");
    },
    async () => Response.json({ unexpected: "SECRET_DO_NOT_LOG" }),
  ]) {
    await assert.rejects(
      refreshSenderLines(
        admin,
        "TEST-invalid-key",
        before.updatedAt.toISOString(),
        transport,
      ),
      (error) =>
        error instanceof Error &&
        !error.message.includes("SECRET_DO_NOT_LOG") &&
        !error.message.includes("TEST-invalid-key"),
    );
    assert.deepEqual(
      await db.smsProviderSetting.findUniqueOrThrow({
        where: { key: "farazsms" },
      }),
      before,
    );
  }
  await assert.rejects(
    discoverAccessibleLines(
      "TEST-key",
      async () => new Response("", { status: 403 }),
    ),
  );
});
test("refresh removes an unavailable selected line without an arbitrary fallback", async () => {
  let view = await smsSettingsView(admin);
  await refreshSenderLines(
    admin,
    "",
    view.revision,
    response(["500100", "500200"]),
  );
  view = await smsSettingsView(admin);
  assert.equal(view.fromNumber, "");
  assert.equal(view.enabled, false);
  assert.equal(view.patternConfirmed, false);
  await refreshSenderLines(admin, "", view.revision, response([]));
  view = await smsSettingsView(admin);
  assert.deepEqual(view.lines, []);
  assert.equal(view.fromNumber, "");
});
test("manual fallback requires explicit authorization and binds authorization to credentials", async () => {
  const base = {
    enabled: true,
    apiKey: "TEST-manual-key",
    clearApiKey: false,
    fromNumber: "500123",
    manual: true,
  };
  await assert.rejects(
    saveSmsSettings(admin, { ...base, patternConfirmed: false }),
  );
  await assert.rejects(
    saveSmsSettings(resident, { ...base, patternConfirmed: true }),
  );
  await saveSmsSettings(admin, { ...base, patternConfirmed: true });
  const stored = await db.smsProviderSetting.findUniqueOrThrow({
    where: { key: "farazsms" },
  });
  assert.equal(stored.senderSource, "MANUAL");
  assert.equal(decryptSmsKey(stored.encryptedApiKey!), base.apiKey);
  assert.notEqual(stored.encryptedApiKey, base.apiKey);
  await assert.rejects(
    db.smsProviderSetting.update({
      where: { key: "farazsms" },
      data: { senderPatternConfirmed: false },
    }),
  );
  await assert.rejects(
    saveSmsSettings(admin, {
      ...base,
      apiKey: "TEST-rotated-key",
      patternConfirmed: false,
    }),
  );
});
test("concurrent saves and delayed refresh cannot overwrite newer credentials", async () => {
  let view = await smsSettingsView(admin);
  const form = {
    enabled: false,
    apiKey: "",
    clearApiKey: false,
    fromNumber: view.fromNumber,
    manual: true,
    patternConfirmed: true,
    expectedRevision: view.revision,
  };
  const results = await Promise.allSettled([
    saveSmsSettings(admin, form),
    saveSmsSettings(admin, form),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  view = await smsSettingsView(admin);
  let started!: () => void, release!: () => void;
  const fetching = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = refreshSenderLines(
    admin,
    "TEST-delayed-key",
    view.revision,
    async () => {
      started();
      await gate;
      return Response.json({ status: "success", data: [{ number: "600001" }] });
    },
  );
  const observed = pending.then(
    () => null,
    (error) => error,
  );
  await fetching;
  await saveSmsSettings(admin, {
    ...form,
    apiKey: "TEST-newest-key",
    expectedRevision: view.revision,
  });
  release();
  assert.ok((await observed) instanceof Error);
  assert.equal(
    decryptSmsKey(
      (
        await db.smsProviderSetting.findUniqueOrThrow({
          where: { key: "farazsms" },
        })
      ).encryptedApiKey!,
    ),
    "TEST-newest-key",
  );
});

test("migration 007 preserves legacy enabled configuration and all nine event mappings", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { readdirSync } = await import("node:fs");
  const nested = await isolatedDatabase();
  const client = new PrismaClient({ datasources: { db: { url: nested.url } } });
  const env = { ...process.env, DATABASE_URL: nested.url };
  try {
    for (const name of readdirSync("prisma/migrations")
      .filter((name) => /^\d/.test(name) && !name.endsWith("sms_senders"))
      .sort())
      execFileSync(
        process.execPath,
        [
          "node_modules/prisma/build/index.js",
          "db",
          "execute",
          "--schema",
          "prisma/schema.prisma",
          "--file",
          `prisma/migrations/${name}/migration.sql`,
        ],
        { env, stdio: "pipe" },
      );
    const owner = await client.user.create({
      data: { phone: "+989176999001", name: "TEST legacy SMS administrator" },
    });
    const legacy = {
      financial: { code: "TEST-retain-pattern", variable: "old_message" },
    };
    await client.$executeRaw`INSERT INTO "SmsProviderSetting" (key,enabled,"encryptedApiKey","fromNumber",patterns,"updatedById","updatedAt") VALUES ('farazsms',true,'TEST-ciphertext-preserved','+983000505',${JSON.stringify(legacy)}::jsonb,${owner.id}::uuid,now())`;
    const before =
      await client.$queryRaw`SELECT to_jsonb(s) AS record FROM "SmsProviderSetting" s`;
    const patterns = await client.smsEventTemplate.findMany({
      orderBy: { eventKey: "asc" },
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
        "prisma/migrations/202611230007_sms_senders/migration.sql",
      ],
      { env, stdio: "pipe" },
    );
    const after =
      await client.$queryRaw`SELECT to_jsonb(s)-'senderSource'-'senderPatternConfirmed'-'senderLines'-'senderKeyHash'-'senderCheckedAt' AS record FROM "SmsProviderSetting" s`;
    assert.deepEqual(after, before);
    assert.deepEqual(
      await client.smsEventTemplate.findMany({ orderBy: { eventKey: "asc" } }),
      patterns,
    );
    const setting = await client.smsProviderSetting.findUniqueOrThrow({
      where: { key: "farazsms" },
    });
    assert.equal(setting.enabled, true);
    assert.equal(setting.senderPatternConfirmed, false);
    assert.equal(setting.senderSource, null);
  } finally {
    await client.$disconnect();
    await nested.cleanup();
  }
});
