import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createECDH, randomBytes } from "node:crypto";
import type { Actor } from "../src/lib/security/core";
process.loadEnvFile();
const { isolatedDatabase } = await import("./database");
const isolated = await isolatedDatabase();
process.env.DATABASE_URL = isolated.url;
Object.assign(process.env, {
  NODE_ENV: "development",
  NOTIFICATION_SMS_PROVIDER: "development",
  PAYMENT_PROVIDER: "mock",
});
const { db } = await import("../src/lib/db");
const A = await import("../src/modules/announcements/service"),
  N = await import("../src/modules/notifications/service"),
  T = await import("../src/modules/tickets/service"),
  M = await import("../src/modules/meetings/service"),
  G = await import("../src/modules/governance/service"),
  P = await import("../src/modules/push/service");
const { processDelivery } =
  await import("../src/modules/notifications/delivery");
const { financialEvent, scanFinancialReminders } =
  await import("../src/modules/notifications/financial");
const { runOneJob } = await import("../src/modules/billing/jobs");
const { authorizedAttachment } =
  await import("../src/modules/attachments/service");
let admin: Actor, owner: Actor, tenant: Actor, other: Actor, outsider: Actor;
let unitId: string,
  otherUnitId: string,
  announcementId: string,
  ticketId: string,
  meetingId: string,
  resolutionId: string;
const file = {
  name: "COMM-TEST.pdf",
  mime: "application/pdf",
  content: new TextEncoder().encode("%PDF-1.4 COMM TEST"),
};
const announcement = (audiences: unknown = [{ kind: "ALL" }]) => ({
  title: "COMM TEST announcement",
  content: "COMM TEST private content",
  category: "GENERAL",
  priority: "NORMAL",
  audiences,
});
before(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  const building = await db.building.create({ data: { key: "delta" } }),
    role = await db.role.create({ data: { name: "SUPER_ADMIN" } });
  async function user(n: number, name: string, manager = false) {
    return db.user.create({
      data: {
        phone: "+98911500000" + n,
        name: "COMM TEST " + name,
        status: "APPROVED",
        ...(manager ? { roles: { create: { roleId: role.id } } } : {}),
      },
      include: { roles: { include: { role: true } } },
    });
  }
  admin = await user(1, "admin", true);
  owner = await user(2, "owner");
  tenant = await user(3, "tenant");
  other = await user(4, "other");
  outsider = await user(5, "outsider");
  const unit = await db.unit.create({
      data: { buildingId: building.id, number: "COMM-TEST-1", floor: "TEST" },
    }),
    second = await db.unit.create({
      data: { buildingId: building.id, number: "COMM-TEST-2", floor: "TEST" },
    }),
    third = await db.unit.create({
      data: { buildingId: building.id, number: "COMM-TEST-3", floor: "TEST" },
    });
  unitId = unit.id;
  otherUnitId = third.id;
  const { currentPeriod, periodBounds } =
    await import("../src/modules/billing/calendar");
  const startsAt = new Date(
    periodBounds(currentPeriod()).startsAt.getTime() - 86400000,
  );
  for (const [unitId, userId, kind] of [
    [unit.id, owner.id, "OWNER"],
    [second.id, owner.id, "OWNER"],
    [unit.id, tenant.id, "TENANT"],
    [third.id, other.id, "AUTHORIZED"],
  ] as const)
    await db.unitMembership.create({
      data: { unitId, userId, kind, startsAt },
    });
});
after(async () => {
  await db.$disconnect();
  await isolated.cleanup();
});
test("additive migration installs constraints without changing financial posting rules", async () => {
  assert.equal(await db.smsTemplate.count(), 6);
  assert.equal(await db.account.count(), 9);
  await assert.rejects(
    db.announcement.create({
      data: {
        title: "x",
        content: "x",
        category: "INVALID",
        priority: "NORMAL",
        authorId: admin.id,
      },
    }),
  );
  await assert.rejects(
    db.notification.create({
      data: {
        userId: owner.id,
        eventKey: "external",
        category: "general",
        title: "test",
        body: "test",
        href: "https://untrusted.invalid",
      },
    }),
  );
});
test("announcement authorization, targeted audiences and multi-unit deduplication", async () => {
  await assert.rejects(A.saveAnnouncement(owner, announcement()));
  const record = await A.saveAnnouncement(
    admin,
    announcement([{ kind: "UNITS", unitId }, { kind: "OWNERS" }]),
    file,
  );
  announcementId = record.id;
  await Promise.all([
    A.publishAnnouncement(admin, record.id),
    A.publishAnnouncement(admin, record.id),
  ]);
  assert.equal(
    await db.announcementRecipient.count({
      where: { announcementId: record.id },
    }),
    2,
  );
  assert.equal(
    await db.notification.count({
      where: { eventKey: "announcement:" + record.id },
    }),
    2,
  );
  assert.equal(
    (await A.getAnnouncement(owner, record.id)).content,
    "COMM TEST private content",
  );
  await assert.rejects(A.getAnnouncement(other, record.id));
  await assert.rejects(A.getAnnouncement(outsider, record.id));
  await assert.rejects(
    A.saveAnnouncement(admin, { ...announcement(), id: record.id }),
  );
  const attachment = await db.communicationAttachment.findFirstOrThrow({
    where: { announcementId: record.id },
  });
  await assert.rejects(authorizedAttachment(other, attachment.id));
  assert.equal(
    (await authorizedAttachment(owner, attachment.id)).name,
    file.name,
  );
});
test("read receipts are per recipient, idempotent and immutable", async () => {
  await A.readAnnouncement(owner, announcementId);
  await A.readAnnouncement(owner, announcementId);
  assert.equal((await A.announcementStats(admin, announcementId)).read, 1);
  await assert.rejects(A.readAnnouncement(other, announcementId));
  await assert.rejects(
    db.announcementRead.update({
      where: { announcementId_userId: { announcementId, userId: owner.id } },
      data: { readAt: new Date() },
    }),
  );
});
test("scheduled publication honors due time and stale revisions", async () => {
  const when = new Date(Date.now() + 60000);
  const record = await A.saveAnnouncement(admin, {
    ...announcement(),
    publishAt: when,
  });
  await A.publishAnnouncement(admin, record.id);
  await A.publishScheduled(record.id, 1, admin.id);
  assert.equal(
    (await db.announcement.findUniqueOrThrow({ where: { id: record.id } }))
      .status,
    "SCHEDULED",
  );
  await A.publishScheduled(
    record.id,
    1,
    admin.id,
    new Date(when.getTime() + 1),
  );
  assert.equal(
    (await db.announcement.findUniqueOrThrow({ where: { id: record.id } }))
      .status,
    "PUBLISHED",
  );
  const stale = await A.saveAnnouncement(admin, {
    ...announcement(),
    publishAt: when,
  });
  await A.publishAnnouncement(admin, stale.id);
  await A.saveAnnouncement(admin, {
    ...announcement(),
    id: stale.id,
    publishAt: when,
  });
  await A.publishScheduled(stale.id, 1, admin.id, new Date(when.getTime() + 1));
  assert.equal(
    (await db.announcement.findUniqueOrThrow({ where: { id: stale.id } }))
      .status,
    "DRAFT",
  );
});
test("preferences suppress optional events but never mandatory in-app emergencies", async () => {
  const { saveEventTemplate } =
    await import("../src/modules/sms/template-service");
  await saveEventTemplate(admin, {
    eventKey: "announcement.emergency",
    providerCode: "testEmergencyOnly",
    enabled: true,
    variableMapping: { message: "message" },
    description: "Test simulated emergency",
  });

  await N.savePreferences(owner, {
    ...N.defaultPreferences,
    general: false,
    sms: true,
    push: true,
  });
  const optional = await A.saveAnnouncement(
    admin,
    announcement([{ kind: "OWNERS" }]),
  );
  await A.publishAnnouncement(admin, optional.id);
  assert.equal(
    await db.notification.count({
      where: { userId: owner.id, eventKey: "announcement:" + optional.id },
    }),
    0,
  );
  const emergency = await A.saveAnnouncement(admin, {
    ...announcement([{ kind: "OWNERS" }]),
    category: "EMERGENCY",
  });
  await A.publishAnnouncement(admin, emergency.id);
  const notification = await db.notification.findUniqueOrThrow({
    where: {
      userId_eventKey: {
        userId: owner.id,
        eventKey: "announcement:" + emergency.id,
      },
    },
  });
  assert.equal(notification.mandatory, true);
  assert.equal(
    await db.notificationDelivery.count({
      where: {
        notificationId: notification.id,
        channel: "INAPP",
        status: "DELIVERED",
      },
    }),
    1,
  );
  const sms = await db.notificationDelivery.findFirstOrThrow({
    where: { notificationId: notification.id, channel: "SMS" },
  });
  await processDelivery(sms.id);
  assert.equal(
    (await db.notificationDelivery.findUniqueOrThrow({ where: { id: sms.id } }))
      .status,
    "SIMULATED",
  );
  await N.savePreferences(owner, {
    ...N.defaultPreferences,
    push: true,
    sms: true,
  });
});
test("notification ownership, unread operations and pagination use database state", async () => {
  for (let i = 0; i < 23; i++)
    await db.$transaction((tx) =>
      N.emitNotification(tx, {
        userId: owner.id,
        eventKey: "page:" + i,
        category: "tickets",
        title: "COMM TEST notification",
        body: "test",
        href: "/requests",
      }),
    );
  const first = await N.notificationList(owner, 1),
    second = await N.notificationList(owner, 2);
  assert.equal(first.rows.length, 20);
  assert.ok(second.rows.length > 0);
  await assert.rejects(N.markNotification(tenant, first.rows[0].id));
  await N.markAllNotifications(owner);
  assert.equal(await N.unreadCount(owner), 0);
  await N.markNotification(owner, first.rows[0].id, false);
  assert.equal(await N.unreadCount(owner), 1);
  await assert.rejects(
    db.notification.update({
      where: { id: first.rows[0].id },
      data: { userId: tenant.id },
    }),
  );
});
test("push subscriptions are encrypted, owned per user and cannot target another recipient", async () => {
  const key = createECDH("prime256v1");
  key.generateKeys();
  const input = {
    endpoint: "https://fcm.googleapis.com/fcm/send/COMM-TEST",
    keys: {
      p256dh: key.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
    expirationTime: Date.now() + 86400000,
  };
  const device = await P.registerSubscription(owner, input, "COMM TEST device");
  const stored = await db.pushSubscription.findUniqueOrThrow({
    where: { id: device.id },
  });
  assert.ok(!stored.encryptedSubscription.includes(input.endpoint));
  assert.equal(
    P.decryptSubscription(stored.encryptedSubscription).endpoint,
    input.endpoint,
  );
  await assert.rejects(P.registerSubscription(tenant, input, "other account"));
  await assert.rejects(P.revokeSubscription(tenant, device.id));
  await assert.rejects(
    P.registerSubscription(
      owner,
      { ...input, endpoint: "https://127.0.0.1/private" },
      "SSRF",
    ),
  );
  const notification = await db.$transaction((tx) =>
    N.emitNotification(tx, {
      userId: tenant.id,
      eventKey: "bad-target",
      category: "tickets",
      title: "test",
      body: "test",
      href: "/requests",
    }),
  );
  await assert.rejects(
    db.notificationDelivery.create({
      data: {
        notificationId: notification!.id,
        channel: "PUSH",
        subscriptionId: device.id,
        targetKey: device.id,
      },
    }),
  );
  await P.expireSubscriptions(new Date(Date.now() + 2 * 86400000));
  assert.ok(
    (await db.pushSubscription.findUniqueOrThrow({ where: { id: device.id } }))
      .revokedAt,
  );
});
test("delivery retries are bounded, audited and serialized across concurrent workers", async () => {
  const notification = await db.$transaction((tx) =>
    N.emitNotification(tx, {
      userId: owner.id,
      eventKey: "retry-test",
      category: "tickets",
      title: "test",
      body: "test",
      href: "/requests",
    }),
  );
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { notificationId: notification!.id, channel: "SMS" },
  });
  let calls = 0;
  const transient = {
    async send() {
      calls++;
      throw new Error("TRANSIENT");
    },
  };
  let now = new Date();
  await Promise.all([
    processDelivery(delivery.id, transient, now),
    processDelivery(delivery.id, transient, now),
  ]);
  assert.equal(calls, 1);
  for (let i = 1; i < 5; i++) {
    now = new Date(now.getTime() + 3600001);
    await processDelivery(delivery.id, transient, now);
  }
  const final = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: delivery.id },
  });
  assert.equal(final.status, "FAILED");
  assert.equal(final.attempts, 5);
  assert.equal(
    await db.notificationDeliveryAttempt.count({
      where: { deliveryId: delivery.id },
    }),
    5,
  );
  await processDelivery(
    delivery.id,
    transient,
    new Date(now.getTime() + 86400000),
  );
  assert.equal(calls, 5);
});
test("unconfigured and crashed sends never fabricate delivery or resend uncertain outcomes", async () => {
  const notification = await db.$transaction((tx) =>
    N.emitNotification(tx, {
      userId: owner.id,
      eventKey: "unknown-test",
      category: "tickets",
      title: "test",
      body: "test",
      href: "/requests",
    }),
  );
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { notificationId: notification!.id, channel: "SMS" },
  });
  const old = new Date(Date.now() - 120000);
  await db.notificationDelivery.update({
    where: { id: delivery.id },
    data: { status: "SENDING", attempts: 1, lockedAt: old },
  });
  await db.notificationDeliveryAttempt.create({
    data: {
      deliveryId: delivery.id,
      number: 1,
      status: "SENDING",
      startedAt: old,
    },
  });
  let calls = 0;
  await processDelivery(delivery.id, {
    async send() {
      calls++;
      return { status: "ACCEPTED", providerMessageId: "never" };
    },
  });
  assert.equal(calls, 0);
  assert.equal(
    (
      await db.notificationDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
      })
    ).status,
    "UNKNOWN",
  );
  const next = await db.$transaction((tx) =>
    N.emitNotification(tx, {
      userId: owner.id,
      eventKey: "unconfigured-test",
      category: "tickets",
      title: "test",
      body: "test",
      href: "/requests",
    }),
  );
  const row = await db.notificationDelivery.findFirstOrThrow({
    where: { notificationId: next!.id, channel: "SMS" },
  });
  Object.assign(process.env, {
    NODE_ENV: "production",
    NOTIFICATION_SMS_PROVIDER: "development",
  });
  try {
    await processDelivery(row.id);
    assert.equal(
      (
        await db.notificationDelivery.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).status,
      "SKIPPED",
    );
  } finally {
    Object.assign(process.env, { NODE_ENV: "development" });
  }
});
test("ticket creation is idempotent, unit-scoped, private and attachment-protected", async () => {
  const input = {
    title: "COMM TEST issue",
    description: "COMM TEST private request",
    category: "WATER",
    priority: "HIGH",
    unitId,
    requestKey: randomUUID(),
  };
  const [a, b] = await Promise.all([
    T.createTicket(owner, input, file),
    T.createTicket(owner, input, file),
  ]);
  ticketId = a.id;
  assert.equal(a.id, b.id);
  assert.equal(await db.ticket.count(), 1);
  await assert.rejects(T.getTicket(tenant, ticketId));
  await assert.rejects(
    T.commentTicket(tenant, ticketId, "IDOR test", randomUUID()),
  );
  await assert.rejects(
    T.createTicket(owner, {
      ...input,
      unitId: otherUnitId,
      requestKey: randomUUID(),
    }),
  );
  const attachment = await db.communicationAttachment.findFirstOrThrow({
    where: { ticketId },
  });
  await assert.rejects(authorizedAttachment(tenant, attachment.id));
  assert.equal(
    (await T.getTicket(admin, ticketId)).creatorName,
    "COMM TEST owner",
  );
});
test("ticket assignment and status transitions enforce roles and retain replies/history", async () => {
  await assert.rejects(T.assignTicket(owner, ticketId, admin.id));
  await assert.rejects(T.assignTicket(admin, ticketId, tenant.id));
  await T.assignTicket(admin, ticketId, admin.id);
  await assert.rejects(
    T.transitionTicket(owner, ticketId, "IN_PROGRESS", "forbidden"),
  );
  await T.transitionTicket(admin, ticketId, "IN_PROGRESS", "work started");
  await T.transitionTicket(
    admin,
    ticketId,
    "WAITING_FOR_RESIDENT",
    "need response",
  );
  await T.commentTicket(owner, ticketId, "COMM TEST response", randomUUID());
  assert.equal((await T.getTicket(owner, ticketId)).status, "UNDER_REVIEW");
  await T.transitionTicket(admin, ticketId, "RESOLVED", "issue fixed");
  await T.transitionTicket(owner, ticketId, "REOPENED", "still not fixed");
  assert.ok((await T.getTicket(owner, ticketId)).events.length >= 6);
  await assert.rejects(
    db.ticket.update({ where: { id: ticketId }, data: { status: "OPEN" } }),
  );
  const comment = await db.ticketComment.findFirstOrThrow();
  await assert.rejects(
    db.ticketComment.update({
      where: { id: comment.id },
      data: { content: "changed" },
    }),
  );
});
test("meetings enforce audience privacy, invitations, attendance and RSVP ownership", async () => {
  const board = await M.saveMeeting(admin, {
    title: "COMM TEST board",
    description: "Private board meeting",
    agenda: "Board agenda",
    kind: "BOARD",
    startsAt: new Date(Date.now() - 3600000),
    location: "TEST room",
  });
  await assert.rejects(M.getMeeting(owner, board.id));
  const meeting = await M.saveMeeting(
    admin,
    {
      title: "COMM TEST owners",
      description: "Owners meeting",
      agenda: "Owner agenda",
      kind: "OWNERS",
      startsAt: new Date(Date.now() - 3600000),
      location: "TEST room",
    },
    file,
  );
  meetingId = meeting.id;
  await assert.rejects(M.getMeeting(tenant, meeting.id));
  await assert.rejects(
    M.recordAttendance(owner, meeting.id, owner.id, "PRESENT", "forbidden"),
  );
  await M.rsvpMeeting(owner, meeting.id, "YES");
  await M.recordAttendance(
    admin,
    meeting.id,
    owner.id,
    "PRESENT",
    "test attendance",
  );
  const resident = await M.getMeeting(owner, meeting.id);
  assert.equal(resident.participants.length, 0);
  assert.equal(resident.me?.attendance, "PRESENT");
});
test("final minutes and resolutions use append-only amendments with database protection", async () => {
  const minutes = await M.appendMinutes(
    admin,
    meetingId,
    "COMM TEST final minutes",
    "FINAL",
    null,
    file,
  );
  await assert.rejects(
    M.appendMinutes(admin, meetingId, "silent overwrite", "FINAL", null),
  );
  await M.appendMinutes(
    admin,
    meetingId,
    "COMM TEST amendment",
    "FINAL",
    "test amendment",
  );
  assert.equal((await M.getMeeting(owner, meetingId)).minutes.length, 2);
  await assert.rejects(
    db.meetingMinutes.update({
      where: { id: minutes.id },
      data: { content: "tamper" },
    }),
  );
  const date = new Date();
  const result = await G.appendResolution(admin, {
    meetingId,
    content: "COMM TEST final resolution",
    status: "PUBLISHED",
    decisionAt: date,
    effectiveAt: date,
    responsibleId: owner.id,
  });
  resolutionId = result.resolution.id;
  await assert.rejects(
    G.appendResolution(owner, {
      meetingId,
      content: "forbidden",
      status: "DRAFT",
      decisionAt: date,
      effectiveAt: date,
      responsibleId: owner.id,
    }),
  );
  await assert.rejects(
    G.appendResolution(admin, {
      id: resolutionId,
      meetingId,
      content: "silent amendment",
      status: "COMPLETED",
      decisionAt: date,
      effectiveAt: date,
      responsibleId: owner.id,
    }),
  );
  await G.appendResolution(admin, {
    id: resolutionId,
    meetingId,
    content: "COMM TEST completion",
    status: "COMPLETED",
    decisionAt: date,
    effectiveAt: date,
    responsibleId: owner.id,
    amendmentReason: "test completion",
  });
  await assert.rejects(
    db.resolutionVersion.update({
      where: { id: result.version.id },
      data: { content: "tamper" },
    }),
  );
  await M.changeMeetingStatus(
    admin,
    meetingId,
    "COMPLETED",
    "record completed",
  );
});
test("financial notifications and due reminders derive from real records and deduplicate", async () => {
  const { createPolicy, generateInvoices } =
    await import("../src/modules/billing/service");
  const { currentPeriod, periodBounds } =
    await import("../src/modules/billing/calendar");
  const key = currentPeriod(),
    bounds = periodBounds(key);
  await createPolicy(admin, 10000n, key, "COMM TEST policy");
  for (const membership of await db.unitMembership.findMany()) {
    if (
      !(await db.billingResponsibility.findFirst({
        where: { unitId: membership.unitId },
      }))
    )
      await db.billingResponsibility.create({
        data: {
          unitId: membership.unitId,
          userId: membership.userId,
          membershipId: membership.id,
          startsAt: membership.startsAt,
        },
      });
  }
  await generateInvoices(admin, key);
  const invoice = await db.invoice.findFirstOrThrow({
    where: { responsibleId: owner.id },
  });
  const before = await db.journalEntry.count();
  await financialEvent("POLICY", (await db.chargePolicy.findFirstOrThrow()).id);
  await financialEvent("POLICY", (await db.chargePolicy.findFirstOrThrow()).id);
  assert.equal(
    await db.notification.count({
      where: { userId: owner.id, eventKey: { startsWith: "policy:" } },
    }),
    1,
  );
  assert.equal(await db.journalEntry.count(), before);
  await financialEvent("INVOICE", invoice.id);
  await financialEvent("INVOICE", invoice.id);
  assert.equal(
    await db.notification.count({
      where: { userId: owner.id, eventKey: `invoice:${invoice.id}:INVOICE` },
    }),
    1,
  );
  const upcoming = new Date(bounds.dueAt.getTime() - 2 * 86400000);
  await scanFinancialReminders(upcoming);
  const reminders = await db.outboxJob.count({
    where: { key: { startsWith: "reminder:" } },
  });
  await scanFinancialReminders(upcoming);
  assert.equal(
    await db.outboxJob.count({ where: { key: { startsWith: "reminder:" } } }),
    reminders,
  );
  await financialEvent("UPCOMING", invoice.id, upcoming);
  await financialEvent("UPCOMING", invoice.id, upcoming);
  assert.equal(
    await db.notification.count({
      where: { eventKey: `invoice:${invoice.id}:UPCOMING` },
    }),
    1,
  );
  const { startPayment, simulatePayment } =
    await import("../src/modules/payments/service");
  const intent = await startPayment(owner, invoice.id);
  const payment = await db.paymentIntent.findUniqueOrThrow({
    where: { id: intent.intentId },
  });
  await simulatePayment(owner, payment.authority!, "SUCCESS");
  await financialEvent("PAYMENT", payment.id);
  await financialEvent("PAYMENT", payment.id);
  assert.equal(
    await db.notification.count({
      where: { eventKey: "payment:" + payment.id },
    }),
    1,
  );
  await financialEvent(
    "OVERDUE",
    invoice.id,
    new Date(bounds.dueAt.getTime() + 2 * 86400000 + 1),
  );
  assert.equal(
    await db.notification.count({
      where: { eventKey: `invoice:${invoice.id}:OVERDUE` },
    }),
    0,
  );
  assert.equal(
    await scanFinancialReminders(
      new Date(bounds.dueAt.getTime() + 2 * 86400000 + 1),
    ),
    2,
  );
  await assert.rejects(generateInvoices(owner, key));
});
test("concurrent PostgreSQL workers claim jobs once and terminal failures are bounded", async () => {
  const job = await db.outboxJob.create({
    data: {
      key: "COMM-TEST-DEAD",
      kind: "COMM_UNKNOWN_TEST",
      payload: {},
      attempts: 7,
      availableAt: new Date(0),
    },
  });
  await Promise.all([runOneJob(), runOneJob()]);
  assert.equal(
    (await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } })).status,
    "DEAD",
  );
  for (let i = 0; i < 120; i++) await runOneJob();
  assert.equal(await db.outboxJob.count({ where: { status: "RUNNING" } }), 0);
  const duplicates = await db.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*) AS n FROM (SELECT "userId","eventKey" FROM "Notification" GROUP BY 1,2 HAVING count(*)>1) d`;
  assert.equal(duplicates[0].n, 0n);
});

test("tenant and board audiences do not leak recipients or aggregated read statistics", async () => {
  const tenants = await A.saveAnnouncement(
    admin,
    announcement([{ kind: "TENANTS" }]),
  );
  await A.publishAnnouncement(admin, tenants.id);
  assert.equal((await A.getAnnouncement(tenant, tenants.id)).isRecipient, true);
  await assert.rejects(A.getAnnouncement(owner, tenants.id));
  const board = await A.saveAnnouncement(
    admin,
    announcement([{ kind: "BOARD" }]),
  );
  await A.publishAnnouncement(admin, board.id);
  await assert.rejects(A.getAnnouncement(tenant, board.id));
  await assert.rejects(A.announcementStats(owner, tenants.id));
  assert.equal((await P.devices(tenant)).length, 0);
});
test("meeting reminders reject early and stale schedules, and deduplicate when due", async () => {
  const now = new Date();
  const meeting = await M.saveMeeting(admin, {
    title: "COMM TEST reminder",
    description: "Reminder test",
    agenda: "Reminder agenda",
    kind: "GENERAL",
    startsAt: new Date(now.getTime() + 25 * 3600000),
    location: "TEST room",
  });
  await M.remindMeeting(meeting.id, 1, 24, now);
  assert.equal(
    await db.notification.count({
      where: { eventKey: `meeting-reminder:${meeting.id}:1:24` },
    }),
    0,
  );
  await M.remindMeeting(
    meeting.id,
    99,
    24,
    new Date(now.getTime() + 2 * 3600000),
  );
  assert.equal(
    await db.notification.count({
      where: { eventKey: `meeting-reminder:${meeting.id}:99:24` },
    }),
    0,
  );
  await Promise.all([
    M.remindMeeting(meeting.id, 1, 24, new Date(now.getTime() + 2 * 3600000)),
    M.remindMeeting(meeting.id, 1, 24, new Date(now.getTime() + 2 * 3600000)),
  ]);
  assert.equal(
    await db.notification.count({
      where: {
        userId: owner.id,
        eventKey: `meeting-reminder:${meeting.id}:1:24`,
      },
    }),
    1,
  );
});
test("bounded worker command executes maintenance without touching the source database", async () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/finance-worker.ts", "20"],
    {
      env: {
        ...process.env,
        VAPID_PUBLIC_KEY: "",
        VAPID_PRIVATE_KEY: "",
        NODE_ENV: "development",
        NOTIFICATION_SMS_PROVIDER: "development",
      },
      encoding: "utf8",
    },
  );
  assert.match(output, /Processed \d+ outbox jobs/);
  assert.ok(
    await db.outboxJob.count({
      where: { key: { startsWith: "communication-cleanup:" } },
    }),
  );
});

test("SMS dispatch rechecks financial truth, reminder stages, meeting cancellation, ticket privacy and emergency audiences", async () => {
  const { resolveNotificationSms } =
    await import("../src/modules/sms/resolve-event");
  const { saveReminderPolicy } =
    await import("../src/modules/sms/template-service");
  const { invoiceState } =
    await import("../src/modules/financial-reports/service");
  const invoices = await db.invoice.findMany({
    where: { status: "ISSUED" },
    include: { allocations: true, corrections: true },
  });
  // A fresh real-service invoice avoids depending on earlier workers and today's date.
  const { currentPeriod, periodBounds } =
    await import("../src/modules/billing/calendar");
  const bounds = periodBounds(currentPeriod());
  const building = await db.building.findUniqueOrThrow({
    where: { key: "delta" },
  });
  const freshUnit = await db.unit.create({
    data: {
      buildingId: building.id,
      number: "SMS-ISOLATED-TIMING",
      floor: "TEST",
    },
  });
  const membership = await db.unitMembership.create({
    data: {
      unitId: freshUnit.id,
      userId: owner.id,
      kind: "OWNER",
      startsAt: new Date(bounds.startsAt.getTime() - 1000),
    },
  });
  await db.billingResponsibility.create({
    data: {
      unitId: freshUnit.id,
      userId: owner.id,
      membershipId: membership.id,
      startsAt: membership.startsAt,
    },
  });
  const { generateInvoices } = await import("../src/modules/billing/service");
  await generateInvoices(admin, bounds.key);
  const outstanding = await db.invoice.findFirstOrThrow({
    where: { unitId: freshUnit.id },
    include: { allocations: true, corrections: true },
  });

  const paid = invoices.find((i) => invoiceState(i).outstanding === 0n)!;
  assert.ok(outstanding);
  assert.ok(paid);
  const period = await db.billingPeriod.findUniqueOrThrow({
    where: { id: outstanding.periodId },
  });
  const notificationFor = async (event: string, id: string, userId: string) =>
    db.notification.findUniqueOrThrow({
      where: {
        userId_eventKey: { userId, eventKey: `invoice:${id}:${event}` },
      },
    });
  const upcoming = new Date(period.dueAt.getTime() - 3 * 86400000);
  await financialEvent("UPCOMING", outstanding.id, upcoming);
  const reminder = await notificationFor(
    "UPCOMING",
    outstanding.id,
    outstanding.responsibleId,
  );
  assert.equal(
    (await resolveNotificationSms(reminder.id, upcoming))?.event,
    "billing.invoice.reminder",
  );
  assert.equal(
    await resolveNotificationSms(
      reminder.id,
      new Date(period.dueAt.getTime() - 4 * 86400000),
    ),
    null,
  );
  assert.equal(
    await resolveNotificationSms(
      reminder.id,
      new Date(period.dueAt.getTime() + 1),
    ),
    null,
  );
  const tooEarly = new Date(period.dueAt.getTime() + 86400000);
  await financialEvent("OVERDUE", outstanding.id, tooEarly);
  assert.equal(
    await db.notification.count({
      where: {
        userId: outstanding.responsibleId,
        eventKey: `invoice:${outstanding.id}:OVERDUE`,
      },
    }),
    0,
  );
  const late = new Date(period.dueAt.getTime() + 2 * 86400000);
  await Promise.all([
    financialEvent("OVERDUE", outstanding.id, late),
    financialEvent("OVERDUE", outstanding.id, late),
  ]);
  const overdue = await notificationFor(
    "OVERDUE",
    outstanding.id,
    outstanding.responsibleId,
  );
  assert.equal(
    (await resolveNotificationSms(overdue.id, late))?.event,
    "billing.invoice.overdue",
  );
  assert.equal(
    await db.notification.count({
      where: {
        userId: outstanding.responsibleId,
        eventKey: `invoice:${outstanding.id}:OVERDUE`,
      },
    }),
    1,
  );
  const followup = new Date(period.dueAt.getTime() + 7 * 86400000);
  await financialEvent("FOLLOWUP", outstanding.id, followup);
  assert.equal(
    (
      await resolveNotificationSms(
        (
          await notificationFor(
            "FOLLOWUP",
            outstanding.id,
            outstanding.responsibleId,
          )
        ).id,
        followup,
      )
    )?.event,
    "billing.invoice.overdue",
  );
  // A queued reminder must be suppressed when the underlying invoice is paid or cancelled.
  const paidReminder = await db.$transaction((tx) =>
    N.emitNotification(tx, {
      userId: paid.responsibleId,
      eventKey: `invoice:${paid.id}:OVERDUE`,
      category: "financial",
      title: "TEST stale reminder",
      body: "test",
      href: "/charges",
    }),
  );
  assert.equal(await resolveNotificationSms(paidReminder!.id, followup), null);
  const payment = await db.paymentIntent.findFirstOrThrow({
    where: { invoiceId: paid.id, status: "VERIFIED" },
  });
  const paymentNotice = await db.notification.findFirstOrThrow({
    where: { eventKey: `payment:${payment.id}` },
  });
  assert.equal(
    (await resolveNotificationSms(paymentNotice.id))?.event,
    "billing.payment.confirmed",
  );
  const { cancelInvoice } = await import("../src/modules/billing/service");
  await cancelInvoice(
    admin,
    outstanding.id,
    "TEST cancelled before SMS dispatch",
  );
  assert.equal(await resolveNotificationSms(overdue.id, late), null);
  await saveReminderPolicy(admin, {
    beforeDueDays: 3,
    overdueDays: 2,
    followupDays: 7,
    meetingHours: 36,
  });
  const meeting = await M.saveMeeting(admin, {
    title: "SMS TEST meeting",
    description: "private meeting description",
    agenda: "private agenda",
    kind: "GENERAL",
    startsAt: new Date(Date.now() + 48 * 3600000),
    location: "Test room",
  });
  const invitation = await db.notification.findFirstOrThrow({
    where: { eventKey: `meeting:${meeting.id}:1`, userId: owner.id },
  });
  const invite = await resolveNotificationSms(invitation.id);
  assert.equal(invite?.event, "meeting.invitation");
  assert.ok(!JSON.stringify(invite).includes("private agenda"));
  const remindAt = new Date(meeting.startsAt.getTime() - 36 * 3600000);
  await M.remindMeeting(meeting.id, 1, 36, remindAt);
  const meetingReminder = await db.notification.findFirstOrThrow({
    where: {
      eventKey: `meeting-reminder:${meeting.id}:1:36`,
      userId: owner.id,
    },
  });
  assert.equal(
    (await resolveNotificationSms(meetingReminder.id, remindAt))?.event,
    "meeting.reminder",
  );
  await db.meeting.update({
    where: { id: meeting.id },
    data: { status: "CANCELLED" },
  });
  assert.equal(await resolveNotificationSms(invitation.id), null);
  assert.equal(
    await resolveNotificationSms(meetingReminder.id, remindAt),
    null,
  );
  const event = await db.ticketEvent.findFirstOrThrow({
    where: { kind: "STATUS", ticket: { creatorId: owner.id } },
    include: { ticket: true },
  });
  const notice = await db.$transaction((tx) =>
    N.emitNotification(tx, {
      userId: owner.id,
      eventKey: `ticket:${event.id}`,
      category: "tickets",
      title: "TEST ticket change",
      body: "generic",
      href: `/requests/${event.ticketId}`,
    }),
  );
  const ticket = await resolveNotificationSms(notice!.id);
  assert.equal(ticket?.event, "ticket.status.changed");
  assert.deepEqual(Object.keys(ticket!.payload).sort(), ["status", "ticket"]);
  const unauthorized = await db.$transaction((tx) =>
    N.emitNotification(tx, {
      userId: tenant.id,
      eventKey: `ticket:${event.id}`,
      category: "tickets",
      title: "TEST unauthorized notice",
      body: "generic",
      href: "/requests",
    }),
  );
  assert.equal(await resolveNotificationSms(unauthorized!.id), null);
  const emergency = await db.announcement.findFirstOrThrow({
    where: { category: "EMERGENCY", status: "PUBLISHED" },
  });
  const allowed = await db.announcementRecipient.findFirstOrThrow({
    where: { announcementId: emergency.id },
  });
  const emergencyNotice = await db.notification.findFirstOrThrow({
    where: { eventKey: `announcement:${emergency.id}`, userId: allowed.userId },
  });
  assert.deepEqual(
    (await resolveNotificationSms(emergencyNotice.id))?.payload,
    {
      message: "اطلاعیه اضطراری ساختمان؛ برای مشاهده جزئیات وارد سامانه شوید.",
    },
  );
  const forbidden = await db.$transaction((tx) =>
    N.emitNotification(tx, {
      userId: admin.id,
      eventKey: `announcement:${emergency.id}`,
      category: "operational",
      title: "TEST forbidden emergency",
      body: "generic",
      href: "/announcements",
      mandatory: true,
    }),
  );
  assert.equal(await resolveNotificationSms(forbidden!.id), null);
  await saveReminderPolicy(admin, {
    beforeDueDays: 3,
    overdueDays: 2,
    followupDays: 7,
    meetingHours: 24,
  });
});

test("SMS business-event claim prevents concurrent duplicate meeting reminders across schedule changes", async () => {
  const { claimSmsDispatch } = await import("../src/modules/sms/dispatch");
  const meetingId = randomUUID();
  const events = [24, 36].map(
    (hours) => `meeting-reminder:${meetingId}:1:${hours}`,
  );
  const rows = [];
  for (const eventKey of events) {
    const notification = await db.$transaction((tx) =>
      N.emitNotification(tx, {
        userId: owner.id,
        eventKey,
        category: "meetings",
        title: "TEST dedup",
        body: "generic",
        href: "/meetings",
      }),
    );
    rows.push(
      await db.notificationDelivery.findFirstOrThrow({
        where: { notificationId: notification!.id, channel: "SMS" },
      }),
    );
  }
  const results = await Promise.allSettled(
    rows.map((row, index) =>
      claimSmsDispatch(row.id, "meeting.reminder", events[index], owner.id),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  const winner = results.findIndex((result) => result.status === "fulfilled");
  await claimSmsDispatch(
    rows[winner].id,
    "meeting.reminder",
    events[winner],
    owner.id,
  );
  const stored = await db.$queryRaw<
    { dispatchKey: string | null }[]
  >`SELECT "dispatchKey" FROM "SmsDelivery" WHERE "deliveryId" IN (${rows[0].id}::uuid,${rows[1].id}::uuid)`;
  assert.equal(stored.filter((row) => row.dispatchKey).length, 1);
  await assert.rejects(
    db.$executeRaw`UPDATE "SmsDelivery" SET "dispatchKey"=${"x".repeat(64)} WHERE "deliveryId"=${rows[winner].id}::uuid`,
  );
});

test("Faraz HTTP throttling retries once per delivery while uncertain submissions never resend", async () => {
  const { saveSmsSettings } = await import("../src/modules/sms/settings");
  const { saveEventTemplate } =
    await import("../src/modules/sms/template-service");
  await saveSmsSettings(admin, {
    enabled: true,
    apiKey: "TEST-only-provider-key",
    clearApiKey: false,
    fromNumber: "3000505",
    manual: true,
    patternConfirmed: true,
  });
  await saveEventTemplate(admin, {
    eventKey: "announcement.emergency",
    providerCode: "TEST_emergency",
    enabled: true,
    variableMapping: { message: "alert_text" },
    description: "TEST real adapter with mocked transport",
  });
  const createDelivery = async () => {
    const announcementRow = await A.saveAnnouncement(admin, {
      ...announcement([{ kind: "OWNERS" }]),
      category: "EMERGENCY",
    });
    await A.publishAnnouncement(admin, announcementRow.id);
    const notification = await db.notification.findFirstOrThrow({
      where: {
        eventKey: `announcement:${announcementRow.id}`,
        userId: owner.id,
      },
    });
    return db.notificationDelivery.findFirstOrThrow({
      where: { notificationId: notification.id, channel: "SMS" },
    });
  };
  const originalFetch = globalThis.fetch;
  const oldProvider = process.env.NOTIFICATION_SMS_PROVIDER;
  let calls = 0;
  let unknown = false;
  try {
    process.env.NOTIFICATION_SMS_PROVIDER = "";
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "https://api.iranpayamak.com/ws/v1/sms/pattern",
      );
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(body.attributes), ["alert_text"]);
      assert.ok(!JSON.stringify(body).includes("private content"));
      calls++;
      if (unknown) throw new Error("connection lost");
      if (calls === 1) return new Response("", { status: 429 });
      return Response.json({
        status: "success",
        data: 1234567,
      });
    };
    const row = await createDelivery();
    await processDelivery(row.id);
    const retry = await db.notificationDelivery.findUniqueOrThrow({
      where: { id: row.id },
    });
    assert.equal(retry.status, "PENDING");
    assert.equal(retry.lastError, "TRANSIENT");
    await processDelivery(
      row.id,
      undefined,
      new Date(retry.nextAttemptAt.getTime() + 1),
    );
    const accepted = await db.notificationDelivery.findUniqueOrThrow({
      where: { id: row.id },
    });
    assert.equal(accepted.status, "ACCEPTED");
    assert.equal(accepted.providerMessageId, "1234567");
    assert.equal(
      (
        await db.smsDelivery.findUniqueOrThrow({
          where: { deliveryId: row.id },
        })
      ).eventKey,
      "announcement.emergency",
    );
    await Promise.all([processDelivery(row.id), processDelivery(row.id)]);
    assert.equal(calls, 2);
    unknown = true;
    const uncertain = await createDelivery();
    await processDelivery(uncertain.id);
    assert.equal(
      (
        await db.notificationDelivery.findUniqueOrThrow({
          where: { id: uncertain.id },
        })
      ).status,
      "UNKNOWN",
    );
    await processDelivery(uncertain.id);
    assert.equal(calls, 3);
    const audit = await db.auditLog.findMany({
      where: { action: { startsWith: "communication.delivery" } },
    });
    assert.ok(!JSON.stringify(audit).includes("TEST-only-provider-key"));
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NOTIFICATION_SMS_PROVIDER = oldProvider;
  }
});
test("inbox participants, immutable history and idempotent delivery stay private", async () => {
  const id = randomUUID();
  await db.$transaction(async tx => {
    await tx.inboxMessage.create({data:{id,threadId:id,senderId:admin.id,recipientId:tenant.id,body:"Private test"}});
    const input={userId:tenant.id,eventKey:"inbox:"+id,category:"operational" as const,title:"Message",body:"Private",href:"/inbox",channels:["INAPP" as const]};
    await N.emitNotification(tx,input);
    await N.emitNotification(tx,input);
  });
  assert.equal(await db.notification.count({where:{eventKey:"inbox:"+id}}),1);
  assert.equal(await db.inboxMessage.count({where:{threadId:id,OR:[{senderId:outsider.id},{recipientId:outsider.id}]}}),0);
  await assert.rejects(db.inboxMessage.create({data:{id:randomUUID(),threadId:id,senderId:outsider.id,recipientId:tenant.id,body:"intrusion"}}));
  await assert.rejects(db.inboxMessage.update({where:{id},data:{body:"overwrite"}}));
  assert.equal((await db.inboxMessage.updateMany({where:{threadId:id,recipientId:outsider.id,readAt:null},data:{readAt:new Date()}})).count,0);
  assert.equal((await db.inboxMessage.updateMany({where:{threadId:id,recipientId:tenant.id,readAt:null},data:{readAt:new Date()}})).count,1);
  assert.equal((await db.inboxMessage.updateMany({where:{threadId:id,recipientId:tenant.id,readAt:null},data:{readAt:new Date()}})).count,0);
  await assert.rejects(db.inboxMessage.delete({where:{id}}));
});
