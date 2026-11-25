import {
  receivableEntries,
  summarizeReceivables,
} from "@/modules/accounting/receivables";
import { balance } from "@/modules/accounting/service";
import { currentPeriod, periodBounds } from "@/modules/billing/calendar";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canManage, fail, DomainError, type Actor } from "@/lib/security/core";
import { myInvoices } from "@/modules/financial-reports/service";
import { announcementList } from "@/modules/announcements/service";
import {
  arrangeUnits,
  floorKey,
  naturalOrder,
} from "@/modules/building-layout/layout";
import { z } from "zod";
export async function managementOverview(actor: Actor) {
  if (!canManage(actor)) fail("دسترسی مدیریت لازم است.");
  return db.$transaction(
    async (tx) => {
      const building = await tx.building.findUniqueOrThrow({
        where: { key: "delta" },
      });
      const now = new Date();
      const [
        units,
        groups,
        entries,
        accountsPayable,
        pending,
        openTickets,
        serviceIssues,
        announcements,
        meetings,
      ] = await Promise.all([
        tx.unit.findMany({
          where: { buildingId: building.id },
          include: {
            memberships: {
              where: { endsAt: null, startsAt: { lte: now } },
              include: {
                user: { select: { id: true, name: true, status: true } },
              },
            },
            contacts: { select: { kind: true, name: true, userId: true } },
            responsibilities: {
              where: { endsAt: null, startsAt: { lte: now } },
              select: { userId: true },
            },
          },
        }),
        tx.physicalUnitGroup.findMany({
          where: { buildingId: building.id },
          include: { members: true },
          orderBy: { startsAt: "desc" },
        }),
        receivableEntries(tx),
        balance(tx, "AP"),
        tx.user.count({ where: { status: "PENDING" } }),
        tx.ticket.count({
          where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
        }),
        tx.ticket.count({
          where: {
            category: {
              in: [
                "CLEANLINESS",
                "ELEVATOR",
                "LIGHTING",
                "WATER",
                "SHARED_AREA",
              ],
            },
            status: { notIn: ["RESOLVED", "CLOSED"] },
          },
        }),
        tx.announcement.count({
          where: {
            status: "PUBLISHED",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        }),
        tx.meeting.count({
          where: { status: "SCHEDULED", startsAt: { gte: now } },
        }),
      ]);
      const { startsAt, endsAt } = periodBounds(currentPeriod(now));
      const financial = summarizeReceivables(entries, startsAt, endsAt, now);
      const rows = units
        .toSorted(
          (a, b) =>
            naturalOrder(floorKey(a), floorKey(b)) ||
            naturalOrder(a.number, b.number),
        )
        .map((unit) => ({
          id: unit.id,
          number: unit.number,
          floor: unit.floor,
          physicalPosition: unit.physicalPosition,
          active: unit.active,
          occupancy: unit.occupancy,
          people: unit.memberships.map((m) => ({
            userId: m.userId,
            name: m.user.name || "نام ثبت نشده",
            kind: m.kind,
            status: m.user.status,
          })),
          contacts: unit.contacts
            .filter(
              (c) =>
                !unit.memberships.some(
                  (m) => m.userId === c.userId && m.kind === c.kind,
                ),
            )
            .map((c) => ({ name: c.name, kind: c.kind })),
          pending: unit.memberships.filter((m) => m.user.status === "PENDING")
            .length,
          hasPayer: unit.responsibilities.length > 0,
          ...(financial.units.get(unit.id) || {
            outstanding: 0n,
            overdue: 0n,
            paid: 0n,
          }),
        }));
      // Financial totals are reduced once per Unit, never once per membership or
      // once per rendered physical group.
      return {
        units: rows,
        floors: arrangeUnits(rows),
        groups: groups.map((group) => ({
          ...group,
          payerOptions: [
            ...new Map(
              rows
                .filter((u) => group.members.some((m) => m.unitId === u.id))
                .flatMap((u) => u.people)
                .filter(
                  (p) =>
                    p.status === "APPROVED" &&
                    group.members.every((m) =>
                      rows
                        .find((u) => u.id === m.unitId)
                        ?.people.some(
                          (person) =>
                            person.userId === p.userId &&
                            person.status === "APPROVED",
                        ),
                    ),
                )
                .map((p) => [p.userId, { id: p.userId, name: p.name }]),
            ).values(),
          ],
        })),
        pending,
        openTickets,
        serviceIssues,
        announcements,
        meetings,
        outstanding: financial.outstanding,
        collected: financial.collected,
        monthlyCharges: financial.monthlyCharges,
        monthlyCollections: financial.monthlyCollections,
        otherReceivables: financial.otherReceivables,
        payable: -accountsPayable,
        residents: new Set(
          rows.flatMap((u) =>
            u.people
              .filter((p) => p.status === "APPROVED")
              .map((p) => p.userId),
          ),
        ).size,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
export type ManagementOverview = Awaited<ReturnType<typeof managementOverview>>;

export async function residentOverview(actor: Actor, requestedUnit?: string) {
  if (actor.status !== "APPROVED" || canManage(actor))
    fail("داشبورد ساکن فقط برای عضو فعال است.");
  const memberships = await db.unitMembership.findMany({
    where: {
      userId: actor.id,
      endsAt: null,
      startsAt: { lte: new Date() },
      unit: { active: true },
    },
    include: { unit: true },
  });
  const units = [
    ...new Map(memberships.map((m) => [m.unit.id, m.unit])).values(),
  ].sort((a, b) => a.number.localeCompare(b.number, "fa", { numeric: true }));
  if (!units.length) fail("واحد فعال مرتبطی وجود ندارد.");
  if (requestedUnit) z.uuid().parse(requestedUnit);
  const selected = requestedUnit
    ? units.find((u) => u.id === requestedUnit)
    : units[0];
  if (!selected)
    throw new DomainError("ACCESS", "این واحد به حساب شما مرتبط نیست.");
  const [allInvoices, payments, announcements, tickets, unread] =
    await Promise.all([
      myInvoices(actor),
      db.paymentIntent.findMany({
        where: {
          status: "VERIFIED",
          invoice: { responsibleId: actor.id, unitId: selected.id },
        },
        select: { id: true, amount: true, verifiedAt: true },
        orderBy: { verifiedAt: "desc" },
        take: 5,
      }),
      announcementList(actor),
      db.ticket.findMany({
        where: {
          creatorId: actor.id,
          OR: [{ unitId: selected.id }, { unitId: null }],
        },
        select: { id: true, title: true, status: true, number: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      db.notification.count({ where: { userId: actor.id, readAt: null } }),
    ]);
  return {
    units,
    selected,
    memberships: memberships
      .filter((m) => m.unitId === selected.id)
      .map((m) => ({ kind: m.kind })),
    invoices: allInvoices.filter((i) => i.unitId === selected.id),
    payments,
    announcements: announcements.rows.slice(0, 5),
    tickets,
    unread,
  };
}

export async function pendingOverview(actor: Actor) {
  // Deliberately excludes other users, contacts, balances and invoices.
  return db.unitMembership.findMany({
    where: { userId: actor.id, endsAt: null, startsAt: { lte: new Date() } },
    select: {
      kind: true,
      unit: { select: { number: true, floor: true, active: true } },
    },
  });
}
