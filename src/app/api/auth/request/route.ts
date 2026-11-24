import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOtp } from "@/modules/auth/service";
import { assertOrigin, requestOrigin } from "@/modules/auth/http";
import { phoneSchema } from "@/lib/validation";
import { DomainError } from "@/lib/security/core";
export async function POST(request: Request) {
  try {
    await assertOrigin();
    const { phone } = z
      .object({ phone: phoneSchema })
      .parse(await request.json());
    const data = await requestOtp(phone, await requestOrigin());
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DomainError
            ? error.message
            : "شماره یا درخواست معتبر نیست.",
      },
      {
        status:
          error instanceof DomainError &&
          ["RATE", "COOLDOWN"].includes(error.code)
            ? 429
            : 400,
      },
    );
  }
}
