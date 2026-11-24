import { z } from "zod";
import { db } from "@/lib/db";
import { hasRole, fail, type Actor } from "@/lib/security/core";
import { audit } from "@/modules/audit/service";
import {
  smsEvents,
  smsEventKeys,
  validateMapping,
  type SmsEventKey,
} from "./events";
export const reminderSchema = z
  .object({
    beforeDueDays: z.number().int().min(1).max(30),
    overdueDays: z.number().int().min(1).max(30),
    followupDays: z.number().int().max(90).nullable(),
    meetingHours: z.number().int().min(1).max(168),
  })
  .refine(
    (v) => v.followupDays === null || v.followupDays > v.overdueDays,
    "پیگیری دوم باید پس از یادآوری بدهی باشد.",
  );
export async function reminderPolicy() {
  return (
    (await db.smsReminderPolicy.findUnique({ where: { key: "default" } })) || {
      beforeDueDays: 3,
      overdueDays: 2,
      followupDays: 7,
      meetingHours: 24,
    }
  );
}
export async function saveEventTemplate(actor: Actor, input: unknown) {
  if (!hasRole(actor, "SUPER_ADMIN")) fail("دسترسی مدیر کل لازم است.");
  const data = z
    .object({
      eventKey: z.enum(smsEventKeys as [SmsEventKey, ...SmsEventKey[]]),
      providerCode: z.string().trim().max(100),
      enabled: z.boolean(),
      variableMapping: z.record(z.string(), z.string().trim().max(40)),
      description: z.string().trim().max(500),
    })
    .parse(input);
  if (data.providerCode && !/^[a-zA-Z0-9_-]+$/.test(data.providerCode))
    fail("کد پترن معتبر نیست.");
  if (data.enabled) {
    if (!data.providerCode) fail("برای فعال‌سازی کد پترن لازم است.");
    try {
      validateMapping(data.eventKey, data.variableMapping);
    } catch (error) {
      fail(
        error instanceof Error ? error.message : "نگاشت متغیرها معتبر نیست.",
      );
    }
  }
  const definition = smsEvents[data.eventKey];
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"sms-template:" + data.eventKey}))`;
    const previous = await tx.smsEventTemplate.findUnique({
      where: { eventKey: data.eventKey },
    });
    await tx.smsEventTemplate.upsert({
      where: { eventKey: data.eventKey },
      create: {
        ...data,
        providerCode: data.providerCode || null,
        patternName: definition.pattern,
        category: definition.category,
        updatedById: actor.id,
      },
      update: {
        providerCode: data.providerCode || null,
        enabled: data.enabled,
        variableMapping: data.variableMapping,
        description: data.description,
        updatedById: actor.id,
      },
    });
    await audit(
      "sms.template.save",
      actor.id,
      undefined,
      {
        event: data.eventKey,
        previous: previous
          ? {
              code: previous.providerCode,
              mapping: previous.variableMapping,
              description: previous.description,
              enabled: previous.enabled,
            }
          : null,
        current: {
          description: data.description,
          code: data.providerCode,
          mapping: data.variableMapping,
          enabled: data.enabled,
        },
      },
      tx,
    );
  });
}
export async function saveReminderPolicy(actor: Actor, input: unknown) {
  if (!hasRole(actor, "SUPER_ADMIN")) fail("دسترسی مدیر کل لازم است.");
  const data = reminderSchema.parse(input);
  await db.$transaction(async (tx) => {
    await tx.smsReminderPolicy.upsert({
      where: { key: "default" },
      create: { key: "default", ...data, updatedById: actor.id },
      update: { ...data, updatedById: actor.id },
    });
    await audit("sms.schedule.save", actor.id, undefined, data, tx);
  });
}
