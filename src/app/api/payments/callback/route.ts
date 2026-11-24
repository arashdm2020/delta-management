import { NextResponse } from "next/server";
import { z } from "zod";
import { mockEnabled } from "@/modules/payments/providers";
import { verifyPayment } from "@/modules/payments/service";
import { revalidatePath } from "next/cache";
export async function GET(request: Request) {
  if (!mockEnabled())
    return NextResponse.json(
      { error: "درگاه پرداخت پیکربندی نشده است." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const authority = z
      .string()
      .min(1)
      .max(200)
      .parse(new URL(request.url).searchParams.get("authority"));
    const payment = await verifyPayment(authority);
    for (const path of ["/home", "/management", "/charges", "/reports"]) revalidatePath(path, "layout");
    return NextResponse.redirect(
      new URL("/payments/receipt/" + payment.id, process.env.APP_ORIGIN),
      303,
    );
  } catch {
    return NextResponse.json(
      { error: "تأیید پرداخت انجام نشد؛ بررسی مجدد لازم است." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
