import { NextResponse } from "next/server";
import { requireApproved } from "@/modules/auth/session";
import { assertOrigin } from "@/modules/auth/http";
import {
  registerSubscription,
  pushConfiguration,
  revokeSubscription,
} from "@/modules/push/service";
import { DomainError, hashToken } from "@/lib/security/core";
import { db } from "@/lib/db";
import { z } from "zod";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  await requireApproved();
  const config = pushConfiguration();
  return NextResponse.json(
    {
      enabled: config.enabled,
      publicKey: config.enabled ? config.publicKey : "",
    },
    { headers },
  );
}
export async function POST(request: Request) {
  const actor = await requireApproved();
  try {
    await assertOrigin();
    const input = await request.json();
    const record = await registerSubscription(
      actor,
      input.subscription,
      input.deviceName,
    );
    return NextResponse.json(record, { headers });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DomainError
            ? error.message
            : "اشتراک یا نام دستگاه معتبر نیست.",
      },
      { status: 400, headers },
    );
  }
}
export async function DELETE(request: Request) {
  const actor = await requireApproved();
  try {
    await assertOrigin();
    const input = await request.json();
    const endpoint = z.string().url().max(2048).parse(input.endpoint);
    const subscription = await db.pushSubscription.findFirstOrThrow({
      where: {
        userId: actor.id,
        endpointHash: hashToken(endpoint),
        revokedAt: null,
      },
      select: { id: true },
    });
    await revokeSubscription(actor, subscription.id);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json(
      { error: "اشتراک در دسترس نیست." },
      { status: 400, headers },
    );
  }
}
