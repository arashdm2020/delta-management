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
const { currentPeriod, periodBounds } =
  await import("../src/modules/billing/calendar");
const key = currentPeriod(),
  bounds = periodBounds(key),
  origin = "http://localhost:3002";
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env: process.env, stdio: "pipe" },
);
const building = await db.building.create({ data: { key: "delta" } });
const role = await db.role.create({ data: { name: "SUPER_ADMIN" } });
await db.user.create({
  data: {
    name: "FINANCE UI TEST admin",
    phone: "+989111000001",
    status: "APPROVED",
    roles: { create: { roleId: role.id } },
  },
});
const resident = await db.user.create({
  data: {
    name: "FINANCE UI TEST resident",
    phone: "+989111000002",
    status: "APPROVED",
  },
});
const unit = await db.unit.create({
  data: { buildingId: building.id, number: "FINANCE-UI-TEST", floor: "TEST" },
});
const membership = await db.unitMembership.create({
  data: {
    unitId: unit.id,
    userId: resident.id,
    kind: "OWNER",
    startsAt: new Date(bounds.startsAt.getTime() - 1000),
  },
});
await db.billingResponsibility.create({
  data: {
    unitId: unit.id,
    userId: resident.id,
    membershipId: membership.id,
    startsAt: membership.startsAt,
  },
});
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3002",
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "development",
      DELTA_ACCEPTANCE_DIST: "true",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=${new URL("./provider-fetch-fixture.mjs", import.meta.url).href}`,
      APP_ORIGIN: origin,
      DEV_SMS: "true",
      DEV_FIXED_OTP_ENABLED: "true",
      PAYMENT_PROVIDER: "mock",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput = (serverOutput + String(chunk)).slice(-20000);
});
server.stderr.on("data", (chunk) => {
  serverOutput = (serverOutput + String(chunk)).slice(-20000);
});
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if ((await fetch(origin + "/login")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  });
  const recovery = await browser.newContext();
  const recoveryPage = await recovery.newPage();
  let recoveryRequests = 0;
  await recoveryPage.route("**/api/auth/request", async route => {
    recoveryRequests++;
    await route.fulfill({ json: { challengeId: "e909e093-14fb-4d30-a8da-30cb9f4302d5", deliveryStatus: "unknown" } });
  });
  await recoveryPage.goto(origin + "/login");
  await recoveryPage.getByLabel("شماره تلفن همراه", { exact: true }).fill("09111000008");
  await recoveryPage.getByRole("button", { name: "دریافت کد ورود", exact: true }).click();
  await expect(recoveryPage.getByLabel("کد یک‌بارمصرف پیامک‌شده", { exact: true })).toBeVisible();
  await expect(recoveryPage.getByRole("status").filter({ hasText: "نتیجهٔ سرویس ارسال قطعی نیست" })).toBeVisible();
  await recoveryPage.reload();
  await expect(recoveryPage.getByLabel("کد یک‌بارمصرف پیامک‌شده", { exact: true })).toBeVisible();
  assert.equal(recoveryRequests, 1, "Reload must not resend an uncertain submission");
  await recovery.close();
  const admin = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "allow",
  });
  const residentContext = await browser.newContext({
    viewport: { width: 360, height: 800 },
    serviceWorkers: "allow",
  });
  async function login(context: typeof admin, phone: string) {
    const challenge = await (
      await context.request.post(origin + "/api/auth/request", {
        headers: { Origin: origin },
        data: { phone },
      })
    ).json();
    assert.ok(challenge.challengeId);
    const result = await context.request.post(origin + "/api/auth/verify", {
      headers: { Origin: origin },
      data: { challengeId: challenge.challengeId, code: "1234" },
    });
    assert.ok(result.ok());
  }
  await login(admin, "+989111000001");
  await login(residentContext, resident.phone);
  const page = await admin.newPage(),
    mobile = await residentContext.newPage();
  const errors: string[] = [];
  let intentionalOffline = false;
  for (const target of [page, mobile]) {
    target.on("pageerror", (error) => errors.push(error.message));
    target.on("console", (message) => {
      if (
        message.type() === "error" &&
        !(
          intentionalOffline &&
          message.text().includes("net::ERR_INTERNET_DISCONNECTED")
        )
      )
        errors.push(message.text());
      if (message.type() === "warning")
        console.info("Browser warning:", message.text());
    });
  }
  const form = (label: string) =>
    page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: label, exact: true }) });
  await page.goto(origin + "/management/units/" + unit.id);
  const contactForm = (label: string) =>
    page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: label, exact: true }) });
  const ownerForm = contactForm("ذخیرهٔ اطلاعات مالک");
  await ownerForm
    .locator('input[name="name"]')
    .fill("FINANCE UI TEST owner contact");
  await ownerForm.locator('input[name="phone"]').fill("09111000002");
  await ownerForm.getByRole("button").click();
  await expect(ownerForm.getByRole("status")).toBeVisible();
  const tenantForm = contactForm("ذخیرهٔ اطلاعات مستأجر");
  await tenantForm
    .locator('input[name="name"]')
    .fill("FINANCE UI TEST tenant later");
  await tenantForm.getByRole("button").click();
  await expect(tenantForm.getByRole("status")).toBeVisible();
  assert.equal(
    (
      await db.unitContact.findUniqueOrThrow({
        where: { unitId_kind: { unitId: unit.id, kind: "TENANT" } },
      })
    ).phone,
    null,
  );
  await tenantForm.locator('input[name="phone"]').fill("09111000009");
  await expect(tenantForm.locator('input[name="approveAccess"]')).toBeChecked();
  await tenantForm.getByRole("button").click();
  await expect
    .poll(
      async () =>
        (await db.user.findUnique({ where: { phone: "+989111000009" } }))
          ?.status,
    )
    .toBe("APPROVED");
  await page.goto(origin + "/management/sms");
  await page
    .getByLabel("کلید API فراز پیامک", { exact: true })
    .fill("browser-sender-one");
  await page
    .getByRole("button", { name: "دریافت / تازه‌سازی خطوط", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "دریافت / تازه‌سازی خطوط", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() => page.locator('select[name="fromNumber"]').inputValue())
    .toBe("3000505");
  await expect(
    page.locator('input[name="patternConfirmed"]'),
  ).not.toBeChecked();
  await page
    .getByLabel("کلید API فراز پیامک", { exact: true })
    .fill("browser-sender-many");
  await page
    .getByRole("button", { name: "دریافت / تازه‌سازی خطوط", exact: true })
    .click();
  await expect(page.locator('select[name="fromNumber"] option')).toHaveCount(3);
  assert.equal(
    await page.locator('select[name="fromNumber"]').inputValue(),
    "",
  );
  await page.locator('select[name="fromNumber"]').selectOption("500202");
  await page.locator('input[name="patternConfirmed"]').check();
  await page
    .getByRole("button", { name: "ذخیرهٔ تنظیمات پیامک", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await db.smsProviderSetting.findUnique({ where: { key: "farazsms" } }))
          ?.fromNumber,
    )
    .toBe("500202");
  await page
    .getByLabel("کلید API فراز پیامک", { exact: true })
    .fill("browser-sender-invalid");
  await page
    .getByRole("button", { name: "دریافت / تازه‌سازی خطوط", exact: true })
    .click();
    await expect(
      page
        .getByRole("form", { name: "تنظیمات سرویس‌دهنده" })
        .getByRole("alert"),
    ).toContainText("KEY_INVALID");
  assert.equal(
    (
      await db.smsProviderSetting.findUniqueOrThrow({
        where: { key: "farazsms" },
      })
    ).fromNumber,
    "500202",
  );
  await page
    .getByLabel("کلید API فراز پیامک", { exact: true })
    .fill("browser-test-key-never-real");
  await page.locator('input[name="manual"]').check();
  await page.locator('input[name="manualNumber"]').fill("3000505");
  await page.locator('input[name="patternConfirmed"]').check();

  await page
    .getByRole("button", { name: "ذخیرهٔ تنظیمات پیامک", exact: true })
    .click();
  await expect(page.getByRole("status")).toBeVisible();
  await page
    .getByRole("button", { name: "ویرایش ثبت شارژ ماهانه", exact: true })
    .click();
  const patternEditor = page.getByRole("form", { name: "ویرایش پترن" });
  await patternEditor.locator('input[name="enabled"]').check();
  await patternEditor
    .getByRole("button", { name: "ذخیرهٔ پترن", exact: true })
    .click();
  await expect(patternEditor.getByRole("alert")).toContainText(
    "کد پترن لازم است",
  );
  await patternEditor
    .locator('input[name="providerCode"]')
    .fill("testInvoicePattern");
  for (const variable of ["period", "unit", "amount", "due_date"])
    await patternEditor
      .getByLabel(`نگاشت ${variable}`, { exact: true })
      .fill(`p_${variable}`);
  await patternEditor.locator('input[name="enabled"]').check();
  await patternEditor
    .getByRole("button", { name: "ذخیرهٔ پترن", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await db.smsEventTemplate.findUnique({
            where: { eventKey: "billing.invoice.issued" },
          })
        )?.enabled,
    )
    .toBe(true);
  await patternEditor.getByLabel("نگاشت unit", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    patternEditor.getByLabel("نگاشت amount", { exact: true }),
  ).toBeFocused();
  await page.getByLabel("فیلتر دسته").selectOption("financial");
  await expect(
    page.getByRole("button", { name: "ویرایش دعوت به جلسه", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("فیلتر دسته").selectOption("all");
  await page.reload();
  assert.equal(await page.locator('input[name="apiKey"]').inputValue(), "");
  assert.ok(!(await page.content()).includes("browser-test-key-never-real"));
  assert.equal(
    (
      await db.smsProviderSetting.findUniqueOrThrow({
        where: { key: "farazsms" },
      })
    ).enabled,
    false,
  );
  await mobile.goto(origin + "/management/sms");
  await expect(mobile).toHaveURL(/unauthorized/);
  await page.goto(origin + "/management/finance");
  await page.locator("#main").waitFor();
  await form("ثبت مبلغ شارژ").getByLabel("شارژ ماهانه (تومان)").fill("200000");
  await form("ثبت مبلغ شارژ")
    .getByLabel("شروع اعمال مبلغ / اولین ماه مشمول")
    .selectOption(key);
  await form("ثبت مبلغ شارژ")
    .getByLabel("دلیل ثبت / تغییر")
    .fill("FINANCE UI TEST policy");
  await page
    .getByRole("button", { name: "ثبت مبلغ شارژ", exact: true })
    .click();
  await expect.poll(() => db.chargePolicy.count()).toBe(1);
  // Monthly charges accrue through the worker; the manager never clicks issuance.
  for (let attempt = 0; attempt < 2; attempt++) {
    execFileSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/finance-worker.ts", "100"],
      {
        env: { ...process.env, NODE_ENV: "development", DEV_SMS: "true" },
        stdio: "pipe",
      },
    );
  }
  assert.equal(await db.invoice.count(), 1);
  const storedPeriod = await db.billingPeriod.findUniqueOrThrow({
    where: { key },
  });
  assert.equal(storedPeriod.dueAt.getTime(), bounds.startsAt.getTime());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "شارژ ماهانهٔ ثابت", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "بدهی انباشته واحدها" }),
  ).toBeVisible();
  const invoice = await db.invoice.findFirstOrThrow();
  await mobile.goto(origin + "/charges");
  await expect(
    mobile.getByRole("heading", { name: "شارژ و صورتحساب‌ها" }),
  ).toBeVisible();
  await mobile.getByRole("link", { name: "مشاهده و پرداخت" }).click();
  await expect(
    mobile.getByRole("heading", { name: "صورتحساب واحد FINANCE-UI-TEST" }),
  ).toBeVisible();
  await mobile
    .getByRole("button", { name: "پرداخت آنلاین", exact: true })
    .click();
  await mobile.waitForURL("**/payments/mock/**");
  await mobile.getByRole("button", { name: "اجرای پرداخت آزمایشی" }).click();
  await mobile.waitForURL("**/payments/receipt/**");
  await expect(
    mobile.getByRole("heading", { name: "رسید پرداخت شارژ" }),
  ).toBeVisible();
  await expect.poll(() => db.paymentAllocation.count()).toBe(1);
  const intent = await db.paymentIntent.findFirstOrThrow({
    where: { status: "VERIFIED" },
  });
  const callbacks = await Promise.all([
    admin.request.get(
      origin + "/api/payments/callback?authority=" + intent.authority,
    ),
    admin.request.get(
      origin + "/api/payments/callback?authority=" + intent.authority,
    ),
  ]);
  assert.ok(callbacks.every((response) => response.ok()));
  assert.equal(await db.paymentAllocation.count(), 1);
  await mobile.goto(origin + "/reports");
  await expect(
    mobile.getByRole("heading", { name: "شفافیت مالی ساختمان" }),
  ).toBeVisible();
  await expect(
    mobile.getByText("پرداخت‌شده", { exact: true }).first(),
  ).toBeVisible();
  const content = await mobile.content();
  assert.ok(!content.includes(resident.phone));
  assert.ok(!content.includes(intent.providerTransactionId!));
  await mobile.goto(origin + "/management/finance");
  await mobile.waitForURL("**/unauthorized");
  await page.goto(origin + "/management/expenses");
  await page.locator("#main").waitFor();
  await page.getByLabel("مبلغ هزینه (تومان)").fill("1000");
  await page.getByLabel("دریافت‌کننده / فروشنده").fill("TEST vendor");
  await page.getByLabel("شرح هزینه").fill("FINANCE UI TEST expense");
  await page.getByLabel("پیوست PDF یا تصویر، حداکثر ۲ مگابایت").setInputFiles({
    name: "test.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 TEST document"),
  });
  await page.getByRole("button", { name: "ثبت هزینه", exact: true }).click();
  await expect.poll(() => db.expense.count()).toBe(1);
  await expect(
    page.getByRole("button", { name: "ثبت قطعی هزینه" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ثبت قطعی هزینه" }).click();
  await expect
    .poll(async () => (await db.expense.findFirstOrThrow()).status)
    .toBe("POSTED");
  const doc = await db.expenseDocument.findFirstOrThrow();
  assert.ok(
    (await admin.request.get(origin + "/api/finance/documents/" + doc.id)).ok(),
  );
  const denied = await residentContext.request.get(
    origin + "/api/finance/documents/" + doc.id,
    { maxRedirects: 0 },
  );
  assert.equal(denied.status(), 307);
  await page.goto(origin + "/management/finance");
  await page.locator("#main").waitFor();
  const settlement = form("تأیید تسویه بانکی");
  await settlement.getByLabel("مرجع مستند تسویه").fill("UI-TEST-SETTLEMENT");
  await page.getByRole("button", { name: "تأیید تسویه بانکی" }).click();
  await expect.poll(() => db.reconciliation.count()).toBe(1);
  await page.goto(origin + "/management/expenses");
  await page.getByRole("button", { name: "ثبت پرداخت از بانک" }).click();
  await expect
    .poll(async () => (await db.expense.findFirstOrThrow()).status)
    .toBe("PAID");
  await page.goto(origin + "/management/finance/income");
  await page.getByLabel("مبلغ درآمد (تومان)").fill("100");
  await page.getByLabel("واریزکننده", { exact: true }).fill("UI TEST payer");
  await page.getByLabel("مرجع سند واریز").fill("UI-TEST-INCOME");
  await page.getByLabel("شرح درآمد").fill("UI TEST non-charge income");
  await page.getByRole("button", { name: "ثبت درآمد مستند" }).click();
  await expect.poll(() => db.income.count()).toBe(1);
  await page.getByLabel("دلیل برگشت درآمد").fill("UI TEST income reversal");
  await page.getByRole("button", { name: "برگشت درآمد", exact: true }).click();
  await expect
    .poll(async () => (await db.income.findFirstOrThrow()).status)
    .toBe("REVERSED");
  await mkdir(".local/screenshots", { recursive: true });
  for (const width of [360, 390, 768, 1440]) {
    for (const [target, routes] of [
      [
        mobile,
        [
          "/charges",
          "/charges/invoices/" + invoice.id,
          "/payments",
          "/reports",
        ],
      ],
      [
        page,
        [
          "/management/finance",
          "/management/expenses",
          "/management/finance/payments",
          "/management/finance/income",
          "/management/sms",
          "/management/units/" + unit.id,
        ],
      ],
    ] as const) {
      await target.setViewportSize({ width, height: 900 });
      for (const path of routes) {
        await target.goto(origin + path);
        await target.locator("#main").waitFor();
        assert.ok(
          await target.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          width + " " + path,
        );
        assert.equal(await target.locator("html").getAttribute("dir"), "rtl");
        await expect(target.locator(".bottom-nav")).toBeVisible({
          visible: width < 768,
        });
      }
      if (target === page) {
        await target.goto(origin + "/management/sms");
        await target.screenshot({
          path: `.local/screenshots/sms-events-${width}.png`,
          fullPage: true,
          caret: "initial",
        });
        await target.goto(origin + "/management/finance");
        await target.locator("#main").waitFor();
        await target.screenshot({
          path: `.local/screenshots/finance-dashboard-${width}.png`,
          fullPage: true,
          caret: "initial",
        });
      }
      await target.screenshot({
        path: `.local/screenshots/finance-${target === mobile ? "resident" : "management"}-${width}.png`,
        fullPage: true,
        caret: "initial",
      });
    }
  }
  await mobile.evaluate(() => navigator.serviceWorker.ready);
  intentionalOffline = true;
  await residentContext.setOffline(true);
  await mobile.goto(origin + "/charges");
  await expect(
    mobile.getByRole("heading", { name: "اتصال اینترنت برقرار نیست" }),
  ).toBeVisible();
  await residentContext.setOffline(false);
  const cached = await mobile.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys.map(async (key) =>
          (await (await caches.open(key)).keys()).map(
            (r) => new URL(r.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  assert.ok(
    cached.every(
      (path) =>
        [
          "/offline.html",
          "/icons/icon-192.png",
          "/icons/icon-512.png",
          "/icons/maskable-512.png",
        ].includes(path) || /^\/_next\/static\//.test(path),
    ),
  );
  assert.deepEqual(errors, []);
  console.info(
    "Financial browser acceptance passed: administrator policy/issuance, resident invoice/mock payment/receipt/privacy, duplicate callbacks, expense attachment/post/payment, settlement, 360/390/768/1440 RTL responsive layouts, PWA offline and cache isolation.",
  );
} catch (error) {
  console.error(serverOutput);
  throw error;
} finally {
  await browser?.close();
  server.kill();
  if (server.exitCode === null)
    await new Promise<void>((resolve) => server.once("exit", () => resolve()));
  await db.$disconnect();
  await isolated.cleanup();
}
