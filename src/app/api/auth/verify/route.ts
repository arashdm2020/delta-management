import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyOtp } from "@/modules/auth/service";
import {
  assertOrigin,
  requestOrigin,
  cookieOptions,
} from "@/modules/auth/http";
import { cookieName } from "@/modules/auth/session";
import { DomainError } from "@/lib/security/core";
export async function POST(request: Request) {
  try {
    await assertOrigin();
    const data = z
      .object({ challengeId: z.uuid(), code: z.string().regex(/^(?:\d{6}|\d{4})$/) })
      .parse(await request.json());
    const result = await verifyOtp(
      data.challengeId,
      data.code,
      await requestOrigin(),
    );
    (await cookies()).set(cookieName, result.token, {
      ...cookieOptions,
      expires: result.expiresAt,
    });
    return NextResponse.json(
      {
        next: !result.user.name
          ? "/complete"
          : result.user.status !== "APPROVED"
            ? "/pending"
            : "/home",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DomainError ? error.message : "درخواست نامعتبر است.",
      },
      { status: 400 },
    );
  }
}
