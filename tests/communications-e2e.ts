import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createECDH, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
process.loadEnvFile();
const { isolatedDatabase } = await import("./database");
const isolated = await isolatedDatabase();
process.env.DATABASE_URL = isolated.url;
const { db } = await import("../src/lib/db");
const { jalaliInput } = await import("../src/modules/billing/calendar");
const { runOneJob } = await import("../src/modules/billing/jobs");
Object.assign(process.env, {
  NODE_ENV: "development",
  NOTIFICATION_SMS_PROVIDER: "development",
  VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
});
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env: process.env, stdio: "pipe" },
);
const b = await db.building.create({ data: { key: "delta" } }),
  role = await db.role.create({ data: { name: "SUPER_ADMIN" } });
const admin = await db.user.create({
  data: {
    phone: "+989116000001",
    name: "COMM UI admin",
    status: "APPROVED",
    roles: { create: { roleId: role.id } },
  },
});
const owner = await db.user.create({
    data: { phone: "+989116000002", name: "COMM UI owner", status: "APPROVED" },
  }),
  other = await db.user.create({
    data: { phone: "+989116000003", name: "COMM UI other", status: "APPROVED" },
  });
for (const [n, userId, kind] of [
  ["COMM-UI-1", owner.id, "OWNER"],
  ["COMM-UI-2", other.id, "TENANT"],
] as const) {
  const unit = await db.unit.create({
    data: { buildingId: b.id, number: n, floor: "TEST" },
  });
  await db.unitMembership.create({ data: { unitId: unit.id, userId, kind } });
}
// Explicitly configured development-only emergency pattern; disabled templates never send.
await db.smsEventTemplate.update({
  where: { eventKey: "announcement.emergency" },
  data: {
    enabled: true,
    providerCode: "testEmergencyPattern",
    variableMapping: { message: "message" },
    updatedById: admin.id,
  },
});
const origin = "http://localhost:3003";
let output = "";
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3003",
  ],
  {
    env: {
      ...process.env,
      APP_ORIGIN: origin,
      NODE_ENV: "development",
      DEV_SMS: "true",
      DEV_FIXED_OTP_ENABLED: "true",
      NOTIFICATION_SMS_PROVIDER: "development",
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
server.stdout.on("data", (c) => {
  output = (output + String(c)).slice(-10000);
});
server.stderr.on("data", (c) => {
  output = (output + String(c)).slice(-10000);
});
try {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(origin + "/login")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  });
  const management = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    resident = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    intruder = await browser.newContext();
  async function login(context: typeof management, phone: string) {
    const challenge = await (
      await context.request.post(origin + "/api/auth/request", {
        headers: { Origin: origin },
        data: { phone },
      })
    ).json();
    assert.ok(challenge.challengeId);
    assert.ok(
      (
        await context.request.post(origin + "/api/auth/verify", {
          headers: { Origin: origin },
          data: { challengeId: challenge.challengeId, code: "1234" },
        })
      ).ok(),
    );
  }
  await login(management, admin.phone);
  await login(resident, owner.phone);
  await login(intruder, other.phone);
  const page = await management.newPage(),
    mobile = await resident.newPage();
  const errors: string[] = [];
  let offline = false;
  for (const p of [page, mobile]) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (
        m.type() === "error" &&
        !(offline && m.text().includes("net::ERR_INTERNET_DISCONNECTED"))
      )
        errors.push(m.text());
    });
  }
  const form = (p: typeof page, operation: string) =>
    p.locator("form").filter({
      has: p.locator(`input[name="operation"][value="${operation}"]`),
    });
  await resident.addInitScript(() => {
    Object.defineProperty(window, "permissionRequests", {
      value: 0,
      writable: true,
    });
    if ("Notification" in window)
      Notification.requestPermission = async () => {
        (window as unknown as { permissionRequests: number })
          .permissionRequests++;
        return "denied";
      };
  });
  await mobile.goto(origin + "/settings/notifications");
  await expect(
    mobile.getByRole("heading", { name: "تنظیمات اعلان‌ها" }),
  ).toBeVisible();
  assert.equal(
    await mobile.evaluate(
      () =>
        (window as unknown as { permissionRequests: number })
          .permissionRequests,
    ),
    0,
  );
  await expect(
    mobile.getByRole("button", { name: "فعال‌سازی اعلان این دستگاه" }),
  ).toBeDisabled();
  await mobile.getByLabel("دریافت پیامک اطلاع‌رسانی", { exact: true }).check();
  await mobile.getByLabel("دریافت اعلان دستگاه", { exact: true }).check();
  await mobile.getByRole("button", { name: "ذخیره ترجیحات اعلان" }).click();
  await expect
    .poll(
      async () =>
        (
          await db.notificationPreference.findUnique({
            where: { userId: owner.id },
          })
        )?.sms,
    )
    .toBe(true);
  const key = createECDH("prime256v1");
  key.generateKeys();
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/COMM-UI-TEST",
    keys: {
      p256dh: key.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
  assert.ok(
    (
      await resident.request.post(origin + "/api/push", {
        headers: { Origin: origin },
        data: { deviceName: "COMM UI device", subscription },
      })
    ).ok(),
  );
  await page.goto(origin + "/management/announcements/new");
  await page
    .getByLabel("عنوان اطلاعیه", { exact: true })
    .fill("اطلاعیه اضطراری آزمایشی");
  await page
    .getByLabel("متن اطلاعیه", { exact: true })
    .fill("این متن فقط برای پذیرش ارتباطات ساختمان است.");
  await page.getByLabel("دسته اطلاعیه").selectOption("EMERGENCY");
  await page.getByLabel("مخاطبان").selectOption("OWNERS");
  const pdf = {
    name: "COMM-UI.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 COMM UI TEST"),
  };
  await page
    .getByLabel("پیوست PDF یا تصویر، حداکثر ۲ مگابایت")
    .setInputFiles(pdf);
  await page.getByRole("button", { name: "ذخیره پیش‌نویس اطلاعیه" }).click();
  await page.waitForURL(/management\/announcements\/[a-f0-9-]+$/);
  await page
    .getByRole("button", { name: "انتشار یا زمان‌بندی اطلاعیه" })
    .click();
  await expect
    .poll(() => db.announcement.count({ where: { status: "PUBLISHED" } }))
    .toBe(1);
  const announcement = await db.announcement.findFirstOrThrow();
  await mobile.goto(origin + "/announcements");
  await expect(mobile.getByTestId("unread-badge")).toBeVisible();
  await mobile
    .getByRole("link", { name: "مشاهده اطلاعیه", exact: true })
    .click();
  await mobile.getByRole("button", { name: "ثبت مطالعه اطلاعیه" }).click();
  await expect.poll(() => db.announcementRead.count()).toBe(1);
  const attachment = await db.communicationAttachment.findFirstOrThrow({
    where: { announcementId: announcement.id },
  });
  assert.equal(
    (
      await intruder.request.get(origin + "/api/attachments/" + attachment.id)
    ).status(),
    404,
  );
  await mobile.goto(origin + "/notifications");
  await expect(
    mobile.getByRole("heading", { name: "مرکز اعلان‌ها" }),
  ).toBeVisible();
  await mobile
    .getByRole("button", { name: "علامت‌گذاری خوانده‌نشده" })
    .first()
    .click();
  await expect(mobile.getByTestId("unread-badge")).toBeVisible();
  await mobile.getByRole("button", { name: "خواندن همه اعلان‌ها" }).click();
  await expect(mobile.getByTestId("unread-badge")).toHaveCount(0);
  await mobile.goto(origin + "/requests/new");
  await mobile
    .getByLabel("عنوان درخواست", { exact: true })
    .fill("درخواست خصوصی آزمایشی");
  await mobile
    .getByLabel("شرح درخواست")
    .fill("شرح خصوصی برای بررسی مدیریت ساختمان در آزمون پذیرش.");
  await mobile.getByLabel("دسته درخواست").selectOption("ELEVATOR");
  await mobile
    .getByRole("button", { name: "ثبت درخواست", exact: true })
    .click();
  await mobile.waitForURL(/requests\/[a-f0-9-]+$/);
  const ticket = await db.ticket.findFirstOrThrow();
  await page.goto(origin + "/management/tickets/" + ticket.id);
  await form(page, "ticket-assign")
    .getByLabel("مدیر مسئول")
    .selectOption(admin.id);
  await page.getByRole("button", { name: "ثبت مسئول پیگیری" }).click();
  await expect
    .poll(
      async () =>
        (await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
          .assignedToId,
    )
    .toBe(admin.id);
  await form(page, "ticket-status")
    .getByLabel("وضعیت جدید")
    .selectOption("IN_PROGRESS");
  await form(page, "ticket-status")
    .getByLabel("دلیل تغییر وضعیت")
    .fill("شروع بررسی آزمایشی");
  await page.getByRole("button", { name: "ثبت وضعیت درخواست" }).click();
  await expect
    .poll(
      async () =>
        (await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
          .status,
    )
    .toBe("IN_PROGRESS");
  await page.getByLabel("متن پاسخ").fill("پاسخ مدیریت برای پیگیری آزمایشی");
  await page.getByRole("button", { name: "ثبت پاسخ درخواست" }).click();
  await expect.poll(() => db.ticketComment.count()).toBe(1);
  await mobile.reload();
  await expect(
    mobile.getByText("پاسخ مدیریت برای پیگیری آزمایشی", { exact: true }),
  ).toBeVisible();
  await mobile
    .getByLabel("متن پاسخ")
    .fill("پاسخ ساکن برای تکمیل اطلاعات آزمایشی");
  await mobile.getByRole("button", { name: "ثبت پاسخ درخواست" }).click();
  await expect.poll(() => db.ticketComment.count()).toBe(2);
  for (const [path, privateText] of [
    ["/requests/" + ticket.id, ticket.title],
    ["/announcements/" + announcement.id, announcement.content],
  ]) {
    const denied = await intruder.request.get(origin + path);
    const html = await denied.text();
    assert.ok([200, 404].includes(denied.status()));
    assert.ok(html.includes("صفحه پیدا نشد"));
    assert.ok(!html.includes(privateText));
    assert.ok(html.includes("noindex"));
  }
  const otherRequests = await intruder.request.get(origin + "/requests");
  assert.ok(!(await otherRequests.text()).includes(ticket.title));
  await page.goto(origin + "/management/meetings/new");
  await page
    .getByLabel("عنوان جلسه", { exact: true })
    .fill("جلسه عمومی آزمایشی");
  await page
    .getByLabel("شرح جلسه")
    .fill("جلسه پذیرش ارتباطات و تصمیم‌های آزمایشی");
  await page.getByLabel("دستور جلسه").fill("بررسی پیشنهادهای آزمایشی ساکنان");
  await page.getByLabel("تاریخ جلسه شمسی").fill(jalaliInput());
  await page.getByLabel("ساعت جلسه تهران").fill("00:00");
  await page.getByLabel("محل جلسه").fill("محل آزمایشی");
  await page.getByRole("button", { name: "ذخیره جلسه" }).click();
  await page.waitForURL(/management\/meetings\/[a-f0-9-]+$/);
  const meeting = await db.meeting.findFirstOrThrow();
  await page.getByRole("link", { name: "ویرایش صورت‌جلسه" }).click();
  await page
    .getByLabel("متن صورت‌جلسه")
    .fill("صورت‌جلسه نهایی آزمایشی؛ هیچ تصمیم واقعی ثبت نشده است.");
  await page.getByLabel("وضعیت نسخه").selectOption("FINAL");
  await page.getByRole("button", { name: "ثبت نسخه صورت‌جلسه" }).click();
  await expect
    .poll(() => db.meetingMinutes.count({ where: { status: "FINAL" } }))
    .toBe(1);
  await page.goto(origin + `/management/meetings/${meeting.id}/resolutions`);
  await form(page, "resolution")
    .getByLabel("متن مصوبه")
    .fill("مصوبه آزمایشی صرفاً برای پذیرش نرم‌افزار");
  await form(page, "resolution")
    .getByLabel("وضعیت مصوبه")
    .selectOption("PUBLISHED");
  await form(page, "resolution")
    .getByLabel("مسئول اجرای مصوبه")
    .selectOption(owner.id);
  await page.getByRole("button", { name: "ثبت مصوبه جدید" }).click();
  await expect.poll(() => db.resolutionVersion.count()).toBe(1);
  await page.goto(origin + "/management/meetings/" + meeting.id);
  const attendance = page
    .locator("form")
    .filter({ has: page.locator(`input[name="userId"][value="${owner.id}"]`) });
  await attendance.getByRole("button", { name: "ثبت حضور شرکت‌کننده" }).click();
  await expect
    .poll(
      async () =>
        (
          await db.meetingParticipant.findUniqueOrThrow({
            where: {
              meetingId_userId: { meetingId: meeting.id, userId: owner.id },
            },
          })
        ).attendance,
    )
    .toBe("PRESENT");
  await form(page, "meeting-status")
    .getByLabel("دلیل تغییر جلسه")
    .fill("تکمیل جلسه پذیرش آزمایشی");
  await page.getByRole("button", { name: "ثبت وضعیت جلسه" }).click();
  await expect
    .poll(
      async () =>
        (await db.meeting.findUniqueOrThrow({ where: { id: meeting.id } }))
          .status,
    )
    .toBe("COMPLETED");
  await mobile.goto(origin + "/meetings/" + meeting.id);
  await expect(
    mobile.getByText("صورت‌جلسه نهایی آزمایشی؛ هیچ تصمیم واقعی ثبت نشده است.", {
      exact: true,
    }),
  ).toBeVisible();
  assert.ok(!(await mobile.content()).includes(other.name!));
  for (let i = 0; i < 50; i++) await runOneJob();
  assert.ok(
    (await db.notificationDelivery.count({ where: { status: "SIMULATED" } })) >
      0,
  );
  assert.ok(
    (await db.notificationDelivery.count({
      where: { status: "SKIPPED", channel: "PUSH" },
    })) > 0,
  );
  await mobile.goto(origin + "/settings/notifications");
  await mobile
    .getByRole("button", { name: "لغو این دستگاه", exact: true })
    .click();
  await expect
    .poll(() =>
      db.pushSubscription.count({ where: { revokedAt: { not: null } } }),
    )
    .toBe(1);
  await mkdir(".local/screenshots", { recursive: true });
  for (const width of [360, 390, 768, 1440]) {
    for (const [target, routes] of [
      [
        mobile,
        [
          "/announcements",
          "/notifications",
          "/requests",
          "/requests/" + ticket.id,
          "/meetings/" + meeting.id,
          "/settings/notifications",
        ],
      ],
      [
        page,
        [
          "/management/communications",
          "/management/communications/deliveries",
          "/management/announcements/" + announcement.id,
          "/management/tickets/" + ticket.id,
          "/management/meetings/" + meeting.id,
        ],
      ],
    ] as const) {
      await target.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        await target.goto(origin + route);
        await target.locator("#main").waitFor();
        assert.ok(
          await target.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          width + " " + route,
        );
        assert.equal(await target.locator("html").getAttribute("dir"), "rtl");
        await expect(target.locator(".bottom-nav")).toBeVisible({
          visible: width < 768,
        });
      }
      await target.screenshot({
        path: `.local/screenshots/communications-${target === mobile ? "resident" : "management"}-${width}.png`,
        fullPage: true,
        caret: "initial",
      });
    }
  }
  await mobile.evaluate(() => navigator.serviceWorker.ready);
  offline = true;
  await resident.setOffline(true);
  await mobile.goto(origin + "/notifications");
  await expect(
    mobile.getByRole("heading", { name: "اتصال اینترنت برقرار نیست" }),
  ).toBeVisible();
  await resident.setOffline(false);
  const cached = await mobile.evaluate(async () => {
    const names = await caches.keys();
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (r) => new URL(r.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  assert.ok(
    cached.every(
      (path) =>
        path.startsWith("/_next/static/") ||
        path === "/offline.html" ||
        path.startsWith("/icons/"),
    ),
  );
  assert.deepEqual(errors, []);
  console.info(
    "Communication browser acceptance passed: targeting/read receipts, unread center, private tickets/replies/assignment, meetings/attendance/minutes/resolutions, preferences/devices, delivery status, 360/390/768/1440 RTL, PWA offline and private cache exclusion.",
  );
} catch (error) {
  console.error(output.slice(-5000));
  throw error;
} finally {
  await browser?.close();
  server.kill();
  if (server.exitCode === null)
    await new Promise<void>((resolve) => server.once("exit", () => resolve()));
  await db.$disconnect();
  await isolated.cleanup();
}
