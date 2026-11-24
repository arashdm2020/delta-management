import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

// Public login page only: no OTP requests, SMS sends or database writes.
const origin = "http://localhost:3005";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3005"], {
  env: { ...process.env, APP_ORIGIN: origin, DELTA_ACCEPTANCE_DIST: "true" },
  stdio: "ignore",
});
let browser;
try {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(origin + "/login")).ok) break; } catch {}
    if (i === 119) throw Error("Login server unavailable");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  await page.goto(origin + "/login");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "راهنمای نصب اپلیکیشن" }).click();
  await expect(dialog.getByRole("status")).toContainText("Chrome");
  await dialog.getByRole("button", { name: "فعلاً نصب نمی‌کنم" }).click();
  await expect(page.getByLabel("شماره تلفن همراه", { exact: true })).toBeVisible();
  await page.reload();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "نصب اپلیکیشن", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.evaluate(`(() => {
    const event = new Event("beforeinstallprompt");
    Object.assign(event, { prompt: async () => { document.body.dataset.nativePrompt = "called"; }, userChoice: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);
  })()`);
  assert.equal(await page.locator("body").getAttribute("data-native-prompt"), null);
  await dialog.getByRole("button", { name: "نصب اپلیکیشن", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-native-prompt", "called");
  await expect(dialog).not.toBeVisible();
  const standalone = await browser.newContext();
  await standalone.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  const installed = await standalone.newPage();
  await installed.goto(origin + "/login");
  await expect(installed.getByRole("dialog")).not.toBeVisible();
  await expect(installed.getByRole("button", { name: "نصب اپلیکیشن", exact: true })).not.toBeVisible();
  const ios = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
  const iphone = await ios.newPage();
  await iphone.goto(origin + "/login");
  await expect(iphone.getByRole("dialog")).toContainText("Add to Home Screen");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log("Login installation checks passed: pre-auth dialog, manual Android/iOS guidance, dismissal persistence, persistent entry, standalone suppression and user-initiated native prompt (mocked). No SMS or database writes.");
} finally {
  await browser?.close();
  server.kill();
  if (server.exitCode === null) await new Promise<void>(resolve => server.once("exit", () => resolve()));
}
