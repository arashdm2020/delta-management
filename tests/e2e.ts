import { chromium, webkit, devices, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
process.loadEnvFile();
const { isolatedDatabase } = await import("./database");
const isolated = await isolatedDatabase(true);
const testUrl = isolated.url;
process.env.DATABASE_URL = testUrl;
const { db } = await import("../src/lib/db");
execFileSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,stdio:"pipe"});
await db.building.upsert({ where: { key: "delta" }, create: { key: "delta" }, update: {} });
for (const name of ["SUPER_ADMIN", "BOARD_MEMBER", "OWNER", "TENANT"] as const)
  await db.role.upsert({ where: { name }, create: { name }, update: {} });
const origin = "http://localhost:3001";
let output = "";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3001",
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: testUrl,
      APP_ORIGIN: origin,
      DEV_SMS: "true",
      DEV_FIXED_OTP_ENABLED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
server.stdout.on("data", (chunk) => {
  output = (output + String(chunk)).slice(-100000);
});
server.stderr.on("data", () => {});
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "allow",
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", message => { if (/\b1234\b/.test(message.text())) errors.push("OTP exposed in browser console"); });
try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(origin + "/login")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await page.goto(origin + "/home");
  await page.waitForURL("**/login");
  await page.getByRole("button", { name: "فعلاً نصب نمی‌کنم" }).click();
  const denied = await context.request.post(origin + "/api/auth/request", {
    data: { phone: "09101010101" },
    headers: { Origin: "https://untrusted.invalid" },
  });
  assert.equal(denied.status(), 400);
  await page.getByRole("button", { name: "دریافت کد ورود" }).click();
  await page.locator("p[role=alert]").waitFor();
  await page.keyboard.press("Tab");
  assert.ok(await page.evaluate(() => document.activeElement?.tagName !== "BODY"));
  await page.getByLabel("شماره تلفن همراه").fill("09101010101");
  const sent = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/request"),
  );
  await page.route("**/api/auth/request", async route => {
    await new Promise(resolve => setTimeout(resolve, 750));
    await route.continue();
  });
  await page.getByRole("button", { name: "دریافت کد ورود" }).click();
  await expect(page.getByRole("button",{name:"در حال ارسال…"})).toBeDisabled();
  const result = await (await sent).json();
  assert.ok(result.challengeId);
  assert.ok(!JSON.stringify(result).includes("1234"));
  assert.equal("code" in result, false);
  const code = "1234";
  await page.getByLabel("کد یک‌بارمصرف پیامک‌شده").fill("9999");
  await page.getByRole("button", { name: "تأیید و ورود", exact: true }).click();
  await page.locator("p[role=alert]").waitFor();
  await page.getByLabel("کد یک‌بارمصرف پیامک‌شده").fill(code);
  await page.getByRole("button", { name: "تأیید و ورود", exact: true }).click();
  await page.waitForURL("**/complete");
  await page.getByLabel("نام و نام خانوادگی").fill("مدیر آزمایشی دلتا");
  await page.getByRole("button", { name: "ذخیره تغییرات" }).click();
  for (let i = 0; i < 30; i++) {
    if ((await db.user.findUnique({ where: { phone: "+989101010101" } }))?.name)
      break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await page.goto(origin + "/pending");
  await page.goto(origin + "/management");
  await page.waitForURL("**/pending");
  const user = await db.user.findUniqueOrThrow({
    where: { phone: "+989101010101" },
  });
  const role = await db.role.findUniqueOrThrow({
    where: { name: "SUPER_ADMIN" },
  });
  await db.user.update({
    where: { id: user.id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      roles: { create: { roleId: role.id } },
    },
  });
  await page.goto(origin + "/home");
  await page
    .getByRole("heading", { name: "نمای کلی ساختمان", exact: true })
    .waitFor();
  assert.equal(await page.locator(".bottom-nav").isVisible(), true);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await mkdir(".local/screenshots", { recursive: true });
  await page.screenshot({
    path: ".local/screenshots/resident-mobile.png",
    fullPage: true,
    caret: "initial",
  });
  const cookie = (await context.cookies()).find(
    (c) => c.name === "delta_session",
  );
  assert.ok(cookie?.httpOnly);
  assert.equal(cookie?.sameSite, "Lax");
  await page.goto(origin + "/management/units");
  await page.getByLabel("شمارهٔ واحد").fill("ACCEPTANCE-TEST");
  await page.getByLabel("طبقه", { exact: true }).fill("طبقه تست");
  await page.getByRole("button", { name: "ثبت واحد", exact: true }).click();
  await page.getByRole("link", { name: "واحد ACCEPTANCE-TEST" }).waitFor();
  const candidate = await db.user.create({
    data: { phone: "+989102020202", name: "ساکن آزمایشی" },
  });
  await page.goto(origin + "/management/users");
  const card = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "ساکن آزمایشی", exact: true }),
    });
  await card.getByRole("button", { name: "تأیید حساب", exact: true }).click();
  await card.getByText("تغییرات با موفقیت ثبت شد.").waitFor();
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: candidate.id } })).status,
    "APPROVED",
  );
  await page.goto(origin + "/management/units");
  await page.getByRole("link", { name: "واحد ACCEPTANCE-TEST" }).click();
  await page.getByLabel("کاربر تأییدشده").selectOption(candidate.id);
  await page.getByLabel("نوع ارتباط").selectOption("OWNER");
  await page.getByRole("button", { name: "افزودن ارتباط" }).click();
  await page.getByLabel("مسئول مجاز").waitFor();
  await page.getByRole("button", { name: "تعیین مسئول", exact: true }).click();
  await page.getByText("تغییرات با موفقیت ثبت شد.").last().waitFor();
  const unit = await db.unit.findFirstOrThrow({
    where: { number: "ACCEPTANCE-TEST" },
  });
  await expect
    .poll(
      () =>
        db.billingResponsibility.count({
          where: { unitId: unit.id, endsAt: null },
        }),
      { timeout: 15000 },
    )
    .toBe(1);
  const tenant = await db.user.create({ data: {phone:"+989103030303", name:"ACCEPTANCE tenant", status:"APPROVED"} });
  await page.reload();
  await page.getByLabel("کاربر تأییدشده").selectOption(tenant.id);
  await page.getByLabel("نوع ارتباط").selectOption("TENANT");
  await page.getByRole("button", { name:"افزودن ارتباط" }).click();
  await expect.poll(() => db.unitMembership.count({where:{unitId:unit.id}})).toBe(2);
  await page.reload();
  const membership = await db.unitMembership.findFirstOrThrow({where:{unitId:unit.id,userId:tenant.id}});
  await page.getByLabel("مسئول مجاز").selectOption(membership.id);
  await page.getByRole("button", {name:"تعیین مسئول",exact:true}).click();
  await expect.poll(() => db.billingResponsibility.count({where:{unitId:unit.id}})).toBe(2);
  const history = await db.billingResponsibility.findMany({where:{unitId:unit.id},orderBy:{startsAt:"asc"}});
  assert.equal(history[0].userId,candidate.id);
  assert.ok(history[0].endsAt);
  assert.equal(history[1].userId,tenant.id);
  assert.equal(history[1].endsAt,null);
  await assert.rejects(db.billingResponsibility.create({data:{unitId:unit.id,userId:tenant.id,membershipId:membership.id}}));
  const residentContext = await browser.newContext();
  const residentChallenge = await (await residentContext.request.post(origin+"/api/auth/request", {headers:{Origin:origin},data:{phone:tenant.phone}})).json();
  const residentLogin = await residentContext.request.post(origin+"/api/auth/verify", {headers:{Origin:origin},data:{challengeId:residentChallenge.challengeId,code:"1234"}});
  assert.ok(residentLogin.ok());
  const residentPage = await residentContext.newPage();
  await residentPage.goto(origin+`/management/units/${unit.id}`);
  await residentPage.waitForURL("**/unauthorized");
  await residentContext.close();
  const navigationLinks = new Set<string>();
  for (const width of [360,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    for (const route of ["/home","/management/units",`/management/units/${unit.id}`,"/management/users","/profile","/settings"]) {
      await page.goto(origin+route);
      await page.locator("#main").waitFor();
      for (const href of await page.locator('a[href^="/"]').evaluateAll(nodes => nodes.map(n => n.getAttribute("href")!))) navigationLinks.add(href);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true, `${width} ${route} overflow`);
      if (route.startsWith("/management/units")) await expect(page.locator('nav[aria-label="منوی مدیریت"] a[href="/management/units"]')).toHaveAttribute("aria-current","page");
      assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.fonts.check('16px "Vazirmatn Variable"')));
      await expect(page.locator(".bottom-nav")).toBeVisible({visible:width<768});
    }
    await page.screenshot({path:`.local/screenshots/acceptance-${width}.png`,fullPage:true, caret:"initial"});
  }
  await page.goto(origin+"/home");
  const links = await page.locator('a[href^="/"]').evaluateAll(nodes => [...new Set(nodes.map(n => n.getAttribute("href")!))]);
  for (const href of [...navigationLinks,...links]) assert.ok((await context.request.get(origin+href,{timeout:30000})).ok(),href);
  const android = await browser.newContext({...devices["Pixel 7"],viewport:{width:360,height:800}});
  await android.addCookies(await context.cookies());
  const androidPage = await android.newPage(); await androidPage.goto(origin+"/home");
  await expect(androidPage.locator(".bottom-nav")).toBeVisible(); await android.close();
  const safari = await webkit.launch({headless:true});
  const iphone = await safari.newContext({...devices["iPhone 13"],viewport:{width:390,height:844}});
  await iphone.addCookies(await context.cookies());
  const iphonePage = await iphone.newPage(); await iphonePage.goto(origin+"/home");
  await expect(iphonePage.locator(".bottom-nav")).toBeVisible();
  assert.ok(await iphonePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok((await iphonePage.locator('meta[name="viewport"]').getAttribute("content"))?.includes("viewport-fit=cover"));
  await iphonePage.screenshot({path:".local/screenshots/iphone-webkit.png",fullPage:true, caret:"initial"});
  await safari.close();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/management");
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator(".bottom-nav")).toBeHidden();
  await page.screenshot({
    path: ".local/screenshots/management-desktop.png",
    fullPage: true,
    caret: "initial",
  });
  assert.ok(!output.includes("[LOCAL OTP ONLY]"));
  const manifest = await (
    await context.request.get(origin + "/manifest.webmanifest")
  ).json();
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.icons.length, 3);
  assert.equal(manifest.dir,"rtl");
  for (const icon of manifest.icons) assert.ok((await context.request.get(origin+icon.src)).ok());
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.goto(origin + "/offline-check");
  await page
    .getByRole("heading", { name: "اتصال اینترنت برقرار نیست" })
    .waitFor();
  await context.setOffline(false);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = await Promise.all(
      keys.map(async (key) =>
        (await (await caches.open(key)).keys()).map(
          (r) => new URL(r.url).pathname,
        ),
      ),
    );
    return requests.flat();
  });
  assert.ok(cached.every(path => ["/offline.html","/icons/icon-192.png","/icons/icon-512.png","/icons/maskable-512.png"].includes(path) || /^\/_next\/static\/.*\.(woff2|css|js)$/.test(path)));
  assert.deepEqual(errors, []);
  console.info(
    "Browser checks passed: OTP, pending access isolation, admin unit/user/billing actions, mobile/desktop navigation, secure cookie and offline PWA cache.",
  );
} finally {
  await browser.close();
  await db.$disconnect();
  server.kill();
  await new Promise<void>((resolve) => server.once("exit", () => resolve()));
  await isolated.cleanup();
}
