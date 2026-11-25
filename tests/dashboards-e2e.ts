import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
process.loadEnvFile();
const { isolatedDatabase } = await import("./database");
const isolated = await isolatedDatabase();
process.env.DATABASE_URL = isolated.url;
const { db } = await import("../src/lib/db");
const { registerUnitResident } = await import("../src/modules/units/contacts");
const { createPolicy, generateInvoices } =
  await import("../src/modules/billing/service");
const { currentPeriod, periodBounds } =
  await import("../src/modules/billing/calendar");
const origin = "http://localhost:3004";
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env: process.env, stdio: "pipe" },
);
const building = await db.building.create({ data: { key: "delta" } });
for (const name of ["SUPER_ADMIN", "BOARD_MEMBER", "OWNER", "TENANT"] as const)
  await db.role.create({ data: { name } });
const admin = await db.user.create({
  data: {
    phone: "+989154000001",
    name: "TEST layout admin",
    status: "APPROVED",
    roles: { create: { role: { connect: { name: "SUPER_ADMIN" } } } },
  },
  include: { roles: { include: { role: true } } },
});
const owner = await db.user.create({
  data: { phone: "+989154000002", name: "TEST payer", status: "APPROVED" },
});
const units = new Map<string, string>();
const startsAt = new Date(
  periodBounds(currentPeriod()).startsAt.getTime() - 1000,
);
for (const number of [32, 23, 22, 21, 31, 33, 45, 44, 43]) {
  const unit = await db.unit.create({
    data: {
      buildingId: building.id,
      number: String(number),
      floor: String(Math.floor(number / 10)),
      occupancy:
        number === 33 ? "VACANT" : number === 45 ? "UNKNOWN" : "OCCUPIED",
    },
  });
  units.set(unit.number, unit.id);
  const m = await db.unitMembership.create({
    data: { unitId: unit.id, userId: owner.id, kind: "OWNER", startsAt },
  });
  await db.billingResponsibility.create({
    data: { unitId: unit.id, userId: owner.id, membershipId: m.id, startsAt },
  });
}
await registerUnitResident(admin, {
  unitId: units.get("32"),
  name: "TEST tenant A",
  phone: "09154000003",
  kind: "TENANT",
  primary: true,
});
await registerUnitResident(admin, {
  unitId: units.get("31"),
  name: "TEST tenant A",
  phone: "09154000003",
  kind: "TENANT",
});
await registerUnitResident(admin, {
  unitId: units.get("32"),
  name: "TEST tenant B",
  phone: "09154000004",
  kind: "TENANT",
});
const pending = await db.user.create({
  data: { phone: "+989154000005", name: "TEST pending" },
});
await db.unitMembership.create({
  data: { unitId: units.get("43")!, userId: pending.id, kind: "TENANT" },
});
await createPolicy(admin, 1000000n, currentPeriod(), "TEST initial charge");
await generateInvoices(admin, currentPeriod());
const invoiceSnapshot = await db.invoice.findMany({ orderBy: { id: "asc" } });
let output = "";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3004",
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "development",
      DELTA_ACCEPTANCE_DIST: "true",
      APP_ORIGIN: origin,
      DEV_SMS: "true",
      DEV_FIXED_OTP_ENABLED: "true",
      MEMBERS_ONLY_LOGIN: "false",
      PAYMENT_PROVIDER: "mock",
      NOTIFICATION_SMS_PROVIDER: "development",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
server.stdout.on("data", (chunk) => {
  output = (output + String(chunk)).slice(-16000);
});
server.stderr.on("data", (chunk) => {
  output = (output + String(chunk)).slice(-16000);
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(origin + "/login")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  });
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  async function signIn(context: (typeof contexts)[number], phone: string) {
    const request = await context.request.post(origin + "/api/auth/request", {
      headers: { Origin: origin },
      data: { phone },
    });
    assert.equal(request.status(), 200);
    const { challengeId } = await request.json();
    const result = await context.request.post(origin + "/api/auth/verify", {
      headers: { Origin: origin },
      data: { challengeId, code: "1234" },
    });
    assert.equal(result.status(), 200);
  }
  for (const [i, phone] of [
    "09154000001",
    "09154000003",
    "09154000004",
    "09154000005",
    "09154000002",
  ].entries())
    await signIn(contexts[i], phone);
  const page = await contexts[0].newPage(),
    resident = await contexts[1].newPage(),
    second = await contexts[2].newPage(),
    pendingPage = await contexts[3].newPage();
  const ownerPage = await contexts[4].newPage();
  const errors: string[] = [];
  for (const p of [page, resident, second, pendingPage])
    p.on("pageerror", (e) => errors.push(e.message));
  ownerPage.on("pageerror", (e) => errors.push(e.message));
  const form = (label: string) =>
    page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: label, exact: true }) });
  await page.goto(origin + "/home");
  await expect(page.locator('[data-unit-numbers="32"]')).toBeVisible();
  assert.equal(await page.locator("[data-unit-card]").count(), 9);
  await page.goto(origin + "/management/units/" + units.get("32"));
  const add = form("افزودن ساکن");
  await add.locator('input[name="name"]').fill("TEST tenant C");
  await add.locator('input[name="phone"]').fill("09154000006");
  await add.getByRole("button").click();
  await expect(add.getByRole("status")).toBeVisible();
  await expect
    .poll(() =>
      db.unitMembership.count({
        where: { unitId: units.get("32"), kind: "TENANT", endsAt: null },
      }),
    )
    .toBe(3);
  assert.equal(
    (
      await db.unitContact.findUniqueOrThrow({
        where: { unitId_kind: { unitId: units.get("32")!, kind: "TENANT" } },
      })
    ).userId,
    (await db.user.findUniqueOrThrow({ where: { phone: "+989154000003" } })).id,
  );
  const position = form("ذخیرهٔ جایگاه");
  await position.locator('select[name="position"]').selectOption("1");
  await position.getByRole("button").click();
  await expect(position.getByRole("status")).toBeVisible();
  await page.goto(origin + "/management");
  const floor = page.getByRole("region", { name: "طبقه 3", exact: true });
  assert.equal(
    await floor
      .locator("[data-unit-card]")
      .first()
      .getAttribute("data-unit-numbers"),
    "32",
  );
  const group = form("ثبت گروه فیزیکی");
  for (const number of ["21", "22"])
    await group
      .locator(`input[name="unitIds"][value="${units.get(number)}"]`)
      .check();
  await group.locator('input[name="occupantLabel"]').fill("TEST Dr Manafi");
  await group.getByRole("button").click();
  await expect(group.getByRole("status")).toBeVisible();
  const combined = page.locator('[data-unit-numbers="21+22"]');
  await expect(combined).toBeVisible();
  assert.equal(
    await combined.evaluate((el) => (el as HTMLElement).style.gridColumnEnd),
    "span 2",
  );
  await expect(combined).not.toContainText("TEST Dr Manafi");
  await expect(
    page.getByText("TEST Dr Manafi", { exact: false }),
  ).toBeVisible();
  await combined.getByText("عملیات", { exact: true }).click();
  await expect(
    combined.getByRole("link", { name: "پرداخت 21", exact: true }),
  ).toHaveAttribute("href", /#payments$/);
  await expect(
    combined.getByRole("link", { name: "پیامک 22", exact: true }),
  ).toHaveAttribute("href", /#board-sms$/);
  await combined.getByText("عملیات", { exact: true }).click();
  assert.equal(await page.locator('[data-unit-numbers="21"]').count(), 0);
  await expect(
    combined.getByRole("list", { name: "تفکیک ماندهٔ واحدها" }),
  ).toContainText("21");
  await expect(
    combined.getByRole("list", { name: "تفکیک ماندهٔ واحدها" }),
  ).toContainText("22");
  const payer = form("تعیین پرداخت‌کنندهٔ مشترک");
  await payer.locator('select[name="userId"]').selectOption(owner.id);
  await payer.getByRole("button").click();
  await expect(payer.getByRole("status")).toBeVisible();
  assert.deepEqual(
    await db.invoice.findMany({ orderBy: { id: "asc" } }),
    invoiceSnapshot,
  );
  await resident.goto(origin + "/home");
  await expect(
    resident
      .getByRole("navigation", { name: "انتخاب واحد فعال" })
      .getByRole("link"),
  ).toHaveCount(2);
  await resident.getByRole("link", { name: "واحد 32", exact: true }).click();
  await expect(
    resident.getByRole("heading", { name: "واحد 32 · طبقه 3", exact: true }),
  ).toBeVisible();
  assert.ok(
    !(await resident.locator("body").innerText()).includes("TEST tenant B"),
  );
  await resident.goto(origin + "/home?unit=" + units.get("21"));
  await expect(
    resident.getByRole("heading", { name: "صفحه پیدا نشد", exact: true }),
  ).toBeVisible();
  await second.goto(origin + "/home");
  await ownerPage.goto(origin + "/home?unit=" + units.get("32"));
  const invoiceLink = ownerPage
    .locator('a[href^="/charges/invoices/"]')
    .first();
  await expect(invoiceLink).toBeVisible();
  const invoiceHref = await invoiceLink.getAttribute("href");
  await invoiceLink.click();
  await ownerPage.waitForURL(origin + invoiceHref);
  await ownerPage.locator("#main").waitFor();
  assert.ok(
    !(await ownerPage.locator("body").innerText()).includes("صفحه پیدا نشد"),
  );
  await expect(
    second
      .getByRole("navigation", { name: "انتخاب واحد فعال" })
      .getByRole("link"),
  ).toHaveCount(1);
  await pendingPage.goto(origin + "/home");
  await pendingPage.waitForURL(origin + "/pending");
  await expect(
    pendingPage.getByText("واحد معرفی‌شده:", { exact: false }),
  ).toContainText("43");
  assert.ok(
    !(await pendingPage.locator("body").innerText()).includes("ماندهٔ شارژ"),
  );
  await mkdir(".local/screenshots", { recursive: true });
  for (const width of [360, 390, 768, 1440]) {
    for (const [target, path] of [
      [page, "/management"],
      [resident, "/home?unit=" + units.get("32")],
    ] as const) {
      await target.setViewportSize({ width, height: 900 });
      await target.goto(origin + path);
      await target.locator("#main").waitFor();
      assert.ok(
        await target.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width} ${path}`,
      );
      assert.equal(await target.locator("html").getAttribute("dir"), "rtl");
      await expect(target.locator(".bottom-nav")).toBeVisible({
        visible: width < 768,
      });
    }
    assert.equal(
      await page
        .getByRole("region", { name: "طبقه 2", exact: true })
        .locator(".grid-cols-3")
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
      3,
    );
    await page.screenshot({
      path: `.local/screenshots/building-map-${width}.png`,
      fullPage: true,
    });
  }
  await form("پایان گروه فیزیکی").getByRole("button").click();
  await expect(page.locator('[data-unit-numbers="21+22"]')).toHaveCount(0);
  await expect(page.locator('[data-unit-numbers="21"]')).toBeVisible();
  assert.deepEqual(
    await db.invoice.findMany({ orderBy: { id: "asc" } }),
    invoiceSnapshot,
  );
  await page.goto(origin + "/management/units/" + units.get("22") + "#charge");
  const charge = form("ثبت سند بدهی");
  await charge.locator('select[name="kind"]').selectOption("MISC");
  await charge.locator('input[name="amount"]').fill("15000");
  await charge.locator('input[name="reference"]').fill("E2E unit 22 charge");
  await charge.locator('input[name="reason"]').fill("E2E miscellaneous debt");
  await charge.getByRole("button").click();
  await expect(charge.getByRole("status")).toBeVisible();
  await expect(page.locator("#statement")).toContainText(
    "E2E miscellaneous debt",
  );

  await page.getByRole("link", { name: "پیامک", exact: true }).click();
  const sms = page.locator("#board-sms");
  await expect(sms.locator('select[name="kind"]')).toHaveValue("UNIT");
  await sms.getByRole("button", { name: "پیش‌نمایش گیرندگان" }).click();
  await expect(sms.getByText("+989154000002", { exact: true })).toBeVisible();
  assert.equal(
    await db.outboxJob.count({ where: { kind: "COMM_BOARD_SMS" } }),
    0,
  );
  await sms
    .getByRole("button", { name: "تأیید ارسال به همین گیرندگان" })
    .click();
  await expect(sms.getByRole("status")).toContainText("صف ارسال");
  assert.equal(
    await db.outboxJob.count({ where: { kind: "COMM_BOARD_SMS" } }),
    1,
  );
  await resident.goto(origin + "/management/communications");
  await expect(resident.locator("#board-sms")).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.info(
    "Dashboard browser acceptance passed: Unit 32 visible for admin without membership; independent residents; primary contact retained; physical order, merged card, common payer and ungrouping; resident unit switching/IDOR; pending isolation; 360/390/768/1440 RTL and bottom navigation. No real SMS or payments.",
  );
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await browser?.close();
  server.kill();
  if (server.exitCode === null)
    await new Promise<void>((resolve) => server.once("exit", () => resolve()));
  await db.$disconnect();
  await isolated.cleanup();
}
