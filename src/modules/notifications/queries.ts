import { db } from "@/lib/db";
import { type Actor, canManage } from "@/lib/security/core";
import {
  communicationManager,
  member,
  eligibleUsers,
  pageNumber,
} from "./common";
export async function communicationOptions(actor: Actor) {
  await member(actor);
  const manager = canManage(actor);
  const units = await db.unit.findMany({
    where: {
      active: true,
      ...(!manager
        ? {
            memberships: {
              some: {
                userId: actor.id,
                startsAt: { lte: new Date() },
                endsAt: null,
              },
            },
          }
        : {}),
    },
    select: { id: true, number: true },
    orderBy: { number: "asc" },
  });
  const users = manager ? await eligibleUsers() : [];
  return {
    units,
    users: users.map((u) => ({
      id: u.id,
      name: u.name || "عضو ساختمان",
      manager: canManage({ ...u, status: "APPROVED" }),
    })),
  };
}
export async function deliveryHistory(
  actor: Actor,
  rawPage = 1,
  status?: string,
) {
  communicationManager(actor);
  const page = pageNumber(rawPage);
  const where = {
    ...(status &&
    [
      "PENDING",
      "SENDING",
      "DELIVERED",
      "ACCEPTED",
      "SIMULATED",
      "SKIPPED",
      "FAILED",
      "UNKNOWN",
    ].includes(status)
      ? { status }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.notificationDelivery.findMany({
      where,
      include: {
        notification: { select: { title: true, category: true, userId: true } },
        logs: { orderBy: { number: "asc" } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    db.notificationDelivery.count({ where }),
  ]);
  const users = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.notification.userId) } },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((u) => [u.id, u.name]));
  const smsRecords = await db.smsDelivery.findMany({
    where: {
      deliveryId: {
        in: rows.filter((row) => row.channel === "SMS").map((row) => row.id),
      },
    },
    select: { deliveryId: true, eventKey: true },
  });
  const events = new Map(
    smsRecords.map((row) => [row.deliveryId, row.eventKey]),
  );

  return {
    page,
    total,
    rows: rows.map((r) => ({
      ...r,
      recipientName: names.get(r.notification.userId) || "عضو ساختمان",
      smsEventKey: events.get(r.id) || null,
    })),
  };
}
export async function communicationOverview(actor: Actor) {
  communicationManager(actor);
  const [
    announcements,
    scheduled,
    tickets,
    meetings,
    failed,
    unconfirmed,
    queued,
    audits,
    deadJobs,
  ] = await Promise.all([
    db.announcement.count({ where: { status: "PUBLISHED" } }),
    db.announcement.count({ where: { status: "SCHEDULED" } }),
    db.ticket.count({ where: { status: { notIn: ["CLOSED", "RESOLVED"] } } }),
    db.meeting.count({
      where: { status: "SCHEDULED", startsAt: { gte: new Date() } },
    }),
    db.notificationDelivery.count({ where: { status: "FAILED" } }),
    db.notificationDelivery.count({ where: { status: "UNKNOWN" } }),
    db.notificationDelivery.count({
      where: { status: { in: ["PENDING", "SENDING"] } },
    }),
    db.auditLog.findMany({
      where: { action: { startsWith: "communication." } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        action: true,
        actorId: true,
        targetId: true,
        createdAt: true,
      },
    }),
    db.outboxJob.findMany({
      where: {
        status: "DEAD",
        OR: [{ kind: { startsWith: "COMM_" } }, { kind: "NOTIFICATION_EVENT" }],
      },
      select: { id: true, kind: true, lastError: true, attempts: true },
      take: 20,
    }),
  ]);
  return {
    announcements,
    scheduled,
    tickets,
    meetings,
    failed,
    unconfirmed,
    queued,
    audits,
    deadJobs,
  };
}
