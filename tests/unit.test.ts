import test from "node:test";
import assert from "node:assert/strict";
import { arrangeUnits, floorKey } from "../src/modules/building-layout/layout";
test("floor inference and configurable physical order never invent missing units", () => {
  assert.equal(floorKey({ number: "۳۲", floor: "نامشخص" }), "3");
  assert.equal(floorKey({ number: "32", floor: "همکف" }), "همکف");
  assert.equal(floorKey({number:"999999999999999999999999999999",floor:"-"}),"99999999999999999999999999999");
  const units = [45, 21, 32, 43, 22, 44].map(number => ({ id: String(number), number: String(number), floor: "نامشخص", physicalPosition: null as number | null }));
  const floors = arrangeUnits(units);
  assert.deepEqual(floors.map(f => f.floor), ["2", "3", "4"]);
  assert.deepEqual(floors[2].units.map(p => [p.unit.number, p.position]), [["43", 1], ["44", 2], ["45", 3]]);
  assert.deepEqual(arrangeUnits([...units].reverse()), floors);
  assert.equal(floors.flatMap(f => f.units).length, units.length);
  const positioned = arrangeUnits([{ ...units[1], physicalPosition: 3 }, units[4]])[0].units;
  assert.deepEqual(positioned.map(p => [p.unit.number, p.position]), [["22", 1], ["21", 3]]);
});
import { SmsProviderError, smsFailureDiagnostic } from "../src/modules/sms/errors";
test("SMS diagnostics retain safe codes and HTTP status without copying arbitrary messages", () => {
  assert.deepEqual(smsFailureDiagnostic(new SmsProviderError("PROVIDER_REJECTED", 403, "http")), { reason: "PROVIDER_REJECTED", httpStatus: 403, stage: "http" });
  const diagnostic = smsFailureDiagnostic(new Error("private API key and OTP must never enter logs"));
  assert.deepEqual(diagnostic, { reason: "SMS_SEND_ERROR", httpStatus: null, stage: "configuration_or_send" });
});
import { normalizePhone } from "../src/lib/validation";
import {
  canManage,
  hasRole,
  otpValid,
  sessionValid,
  otpHash,
  randomOtp,
  equalHash,
} from "../src/lib/security/core";
import { rialToToman } from "../src/lib/utils";
process.env.AUTH_SECRET = "test-only-" + "x".repeat(40);
test("Iranian phone normalization accepts Persian digits and canonical forms", () => {
  for (const raw of [
    "۰۹۱۲۳۴۵۶۷۸۹",
    "09123456789",
    "+989123456789",
    "00989123456789",
  ])
    assert.equal(normalizePhone(raw), "+989123456789");
  for (const raw of ["123", "+12025551234", "099", "091234567890"])
    assert.throws(() => normalizePhone(raw));
});
test("OTP expires and cannot exceed five attempts or be reused", () => {
  const now = new Date("2026-11-23T00:00:00Z");
  const c = {
    attempts: 0,
    expiresAt: new Date(now.getTime() + 1),
    consumedAt: null,
  };
  assert.ok(otpValid(c, now));
  assert.equal(otpValid({ ...c, attempts: 5 }, now), false);
  assert.equal(otpValid({ ...c, expiresAt: now }, now), false);
  assert.equal(otpValid({ ...c, consumedAt: now }, now), false);
});
test("cryptographic OTP hashes bind codes to a challenge", () => {
  const code = randomOtp();
  assert.match(code, /^\d{6}$/);
  assert.notEqual(otpHash("a", code), otpHash("b", code));
  assert.ok(equalHash(otpHash("a", code), otpHash("a", code)));
});
test("session expiry and revocation fail closed", () => {
  const now = new Date();
  assert.equal(sessionValid({ expiresAt: now, revokedAt: null }, now), false);
  assert.equal(
    sessionValid(
      { expiresAt: new Date(now.getTime() + 10000), revokedAt: now },
      now,
    ),
    false,
  );
});
test("unit relationships do not confer management roles", () => {
  const user = {
    id: "test",
    status: "APPROVED",
    roles: [{ role: { name: "OWNER" } }],
  };
  assert.equal(canManage(user), false);
  assert.equal(hasRole({ ...user, status: "PENDING" }, "OWNER"), false);
  assert.equal(
    canManage({
      ...user,
      roles: [...user.roles, { role: { name: "BOARD_MEMBER" } }],
    }),
    true,
  );
});
test("Rial to Toman conversion stays exact with bigint", () => {
  assert.match(rialToToman(15000000n), /تومان/);
  assert.equal(rialToToman(11n), "۱٫۱ تومان");
});

test("fixed OTP requires development and exact opt-in", async () => {
  const { acceptsDevelopmentOtp } =
    await import("../src/modules/auth/development-otp");
  const original = { ...process.env };
  try {
    for (const environment of ["development", "production", "test", ""]) {
      for (const flag of ["true", "false", "TRUE", ""]) {
        Object.assign(process.env, {
          NODE_ENV: environment,
          DEV_FIXED_OTP_ENABLED: flag,
        });
        assert.equal(
          acceptsDevelopmentOtp("1234"),
          environment === "development" && flag === "true",
        );
        assert.equal(acceptsDevelopmentOtp("123456"), false);
      }
    }
  } finally {
    process.env = original;
  }
});

test("temporary production login is single-account, bounded, expiring and challenge-scoped", async () => {
  const { temporaryLoginWindow, temporaryOtpExpiry } = await import("../src/modules/auth/temporary-login");
  const original = { ...process.env };
  const now = new Date("2026-11-24T10:00:00Z");
  try {
    Object.assign(process.env, { NODE_ENV: "production", TEMP_LOGIN_ENABLED: "true", TEMP_LOGIN_PHONE: "+989166000001", TEMP_LOGIN_STARTS_AT: "2026-11-24T09:00:00Z", TEMP_LOGIN_EXPIRES_AT: "2026-11-25T09:00:00Z" });
    assert.ok(temporaryOtpExpiry("+989166000001", "1234", now, now));
    assert.equal(temporaryOtpExpiry("+989166000002", "1234", now, now), null);
    assert.equal(temporaryOtpExpiry("+989166000001", "9999", now, now), null);
    assert.equal(temporaryOtpExpiry("+989166000001", "1234", new Date("2026-11-24T08:59:59Z"), now), null);
    assert.equal(temporaryLoginWindow("+989166000001", new Date("2026-11-25T09:00:00Z")), null);
    assert.equal(temporaryLoginWindow("+989166000001", new Date("2026-11-24T08:59:59Z")), null);
    for (const invalid of ["invalid", "2026-11-25T09:00:01Z"]) {
      process.env.TEMP_LOGIN_EXPIRES_AT = invalid;
      assert.equal(temporaryLoginWindow("+989166000001", now), null);
    }
    process.env.TEMP_LOGIN_EXPIRES_AT = "2026-11-25T09:00:00Z";
    for (const environment of ["test", "development", ""]) {
      Object.assign(process.env, { NODE_ENV: environment });
      assert.equal(temporaryLoginWindow("+989166000001", now), null);
    }
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.TEMP_LOGIN_ENABLED = "false";
    assert.equal(temporaryLoginWindow("+989166000001", now), null);
  } finally { process.env = original; }
});

test("Jalali billing uses exact Tehran midnight and leap months", async () => {
  const { periodBounds } = await import("../src/modules/billing/calendar");
  assert.equal(
    periodBounds("1403-01").startsAt.toISOString(),
    "2024-03-19T20:30:00.000Z",
  );
  const leap = periodBounds("1403-12"),
    regular = periodBounds("1404-12");
  assert.equal(
    (leap.endsAt.getTime() - leap.startsAt.getTime()) / 86400000,
    30,
  );
  assert.equal(
    (regular.endsAt.getTime() - regular.startsAt.getTime()) / 86400000,
    29,
  );
  assert.throws(() => periodBounds("1405-13"));
});

test("Jalali expense input and fractional Toman preserve exact values", async () => {
  const { parseJalaliDate, jalaliInput } =
    await import("../src/modules/billing/calendar");
  assert.equal(jalaliInput(parseJalaliDate("۱۴۰۳-۱۲-۳۰")), "1403-12-30");
  assert.throws(() => parseJalaliDate("1404-12-30"));
  assert.equal(
    rialToToman(90071992547409931n),
    "۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٫۱ تومان",
  );
});

test("Tehran scheduled times invert IANA offsets and reject DST gaps and overlaps", async () => {
  const { parseTehranDateTime, dateTimeFields } =
    await import("../src/modules/notifications/calendar");
  assert.equal(
    parseTehranDateTime("1405-09-02", "18:30").toISOString(),
    "2026-11-23T15:00:00.000Z",
  );
  assert.equal(
    parseTehranDateTime("۱۴۰۰-۰۴-۰۱", "۱۲:۰۰").toISOString(),
    "2021-06-22T07:30:00.000Z",
  );
  assert.throws(() => parseTehranDateTime("1400-01-02", "00:30"));
  assert.throws(() => parseTehranDateTime("1400-06-30", "23:30"));
  const time = parseTehranDateTime("1405-09-02", "00:15");
  assert.deepEqual(dateTimeFields(time), { date: "1405-09-02", time: "00:15" });
});

test("service worker push payloads remain generic and cannot navigate off-origin", async () => {
  const { readFileSync } = await import("node:fs"),
    { runInNewContext } = await import("node:vm");
  const listeners = new Map<string, (event: unknown) => void>();
  let shown:
    | { title: string; options: { body: string; data: { url: string } } }
    | undefined;
  let opened = "";
  const scope = {
    self: {
      addEventListener: (kind: string, callback: (event: unknown) => void) =>
        listeners.set(kind, callback),
      registration: {
        showNotification: async (
          title: string,
          options: { body: string; data: { url: string } },
        ) => {
          shown = { title, options };
        },
      },
      location: { origin: "https://delta.invalid" },
      clients: {
        matchAll: async () => [],
        openWindow: async (url: string) => {
          opened = url;
        },
      },
      skipWaiting: () => {},
    },
    URL,
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), scope);
  let pending: Promise<unknown> | undefined;
  listeners.get("push")!({
    data: {
      json: () => ({
        title: "PRIVATE",
        body: "PRIVATE BALANCE",
        url: "https://bad.invalid",
      }),
    },
    waitUntil: (promise: Promise<unknown>) => {
      pending = promise;
    },
  });
  await pending;
  assert.equal(shown!.title, "ساختمان دلتا");
  assert.ok(!shown!.options.body.includes("PRIVATE"));
  listeners.get("notificationclick")!({
    notification: { close: () => {}, data: { url: "https://bad.invalid" } },
    waitUntil: (promise: Promise<unknown>) => {
      pending = promise;
    },
  });
  await pending;
  assert.equal(opened, "https://delta.invalid/notifications");
});

test("development loopback navigation uses the configured origin without enabling production aliases", async () => {
  const { developmentOriginRedirects: redirects } =
    await import("../src/lib/security/development-origin");
  const rules = redirects("development", "http://localhost:3000");
  assert.equal(rules[0].destination, "http://localhost:3000/:path*");
  assert.deepEqual(rules[0].has[1], {
    type: "header",
    key: "sec-fetch-dest",
    value: "document",
  });
  assert.ok(new RegExp(`^${rules[0].has[0].value}$`).test("127.0.0.1"));
  assert.equal(
    redirects("development", "http://127.0.0.1:3001")[0].destination,
    "http://127.0.0.1:3001/:path*",
  );
  for (const environment of ["production", "test", undefined])
    assert.deepEqual(redirects(environment, "http://localhost:3000"), []);
  for (const origin of [
    undefined,
    "bad",
    "https://example.com",
    "http://localhost.evil",
    "http://localhost/path",
    "http://user@localhost",
    "http://localhost?x=1",
  ])
    assert.deepEqual(redirects("development", origin), []);
});

test("monthly charge is due on the first and its cycle ends at the next first", async () => {
  const { periodBounds, paymentPeriodLabel } =
    await import("../src/modules/billing/calendar");
  for (const key of ["1405-09", "1403-12", "1404-12"]) {
    const period = periodBounds(key);
    assert.equal(period.dueAt.getTime(), period.startsAt.getTime());
    assert.ok(period.endsAt > period.startsAt);
  }
  assert.equal(paymentPeriodLabel("1405-09"), "۱ آذر ۱۴۰۵ تا ۱ دی ۱۴۰۵");
  assert.equal(
    periodBounds("1405-09").endsAt.getTime(),
    periodBounds("1405-10").startsAt.getTime(),
  );
});

test("all nine SMS events require complete uniquely mapped variables and controlled emergency text", async () => {
  const {
    smsEvents,
    smsEventKeys,
    requiredVariables,
    mappedVariables,
    validateMapping,
  } = await import("../src/modules/sms/events");
  assert.equal(smsEventKeys.length, 9);
  assert.equal(
    new Set(smsEventKeys.map((key) => smsEvents[key].pattern)).size,
    9,
  );
  for (const key of smsEventKeys) {
    const names = requiredVariables(key);
    const raw: Record<string, string> = Object.fromEntries(
      names.map((name) => [
        name,
        name === "code"
          ? "654321"
          : name === "message"
            ? "اطلاعیه اضطراری ساختمان؛ برای مشاهده جزئیات وارد سامانه شوید."
            : "test value",
      ]),
    );
    const payload = smsEvents[key].schema.parse(raw);
    const mapping = Object.fromEntries(
      names.map((name, index) => [name, `provider_${index}`]),
    );
    const params = mappedVariables(key, payload, mapping);
    assert.equal(Object.keys(params).length, names.length);
    assert.ok(!("message" in params));
    const missing = { ...raw };
    delete missing[names[0]];
    assert.equal(smsEvents[key].schema.safeParse(missing).success, false);
    assert.throws(() => validateMapping(key, {}), /SMS_MAPPING_INVALID/);
    if (names.length > 1)
      assert.throws(
        () =>
          validateMapping(
            key,
            Object.fromEntries(names.map((name) => [name, "same"])),
          ),
        /SMS_MAPPING_INVALID/,
      );
  }
  assert.equal(
    smsEvents["announcement.emergency"].schema.safeParse({
      message: "free form private emergency body",
    }).success,
    false,
  );
});

test("service worker bypasses executable chunks and removes stale public asset versions", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const listeners = new Map<string, (event: unknown) => void>();
  const removed: string[] = [];
  let claimed = false;
  let pending: Promise<unknown> | undefined;
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      addEventListener: (kind: string, listener: (event: unknown) => void) =>
        listeners.set(kind, listener),
      location: { origin: "http://localhost:3000" },
      clients: {
        claim: async () => {
          claimed = true;
        },
      },
      skipWaiting: () => {},
    },
    URL,
    caches: {
      keys: async () => [
        "delta-public-v2",
        "delta-public-v3",
        "unrelated-cache",
      ],
      delete: async (key: string) => {
        removed.push(key);
        return true;
      },
    },
  });
  for (const path of [
    "/_next/static/chunks/nav.js",
    "/_next/static/chunks/app.css",
    "/_next/static/chunks/abcd1234.js",
  ]) {
    let intercepted = false;
    listeners.get("fetch")!({
      request: {
        url: "http://localhost:3000" + path,
        method: "GET",
        mode: "cors",
        headers: new Headers(),
      },
      respondWith: () => {
        intercepted = true;
      },
    });
    assert.equal(
      intercepted,
      false,
      path + " must use the network/HTTP cache rather than stale CacheStorage",
    );
  }
  listeners.get("activate")!({
    waitUntil: (promise: Promise<unknown>) => {
      pending = promise;
    },
  });
  await pending;
  assert.deepEqual(removed, ["delta-public-v2"]);
  assert.equal(claimed, true);
});
