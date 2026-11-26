import { db } from "@/lib/db";
import { currentUser } from "@/modules/auth/session";
import { canManage } from "@/lib/security/core";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || user.status !== "APPROVED")
    return new Response(null, { status: 401 });
  if (
    !canManage(user) &&
    !(await db.unitMembership.findFirst({
      where: {
        userId: user.id,
        startsAt: { lte: new Date() },
        endsAt: null,
        unit: { active: true },
      },
    }))
  )
    return new Response(null, { status: 403 });
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout>;
  let closed = false;
  const stop = () => {
    closed = true;
    clearTimeout(timer);
  };
  const stream = new ReadableStream({
    start(controller) {
      const deadline = Date.now() + 25000;
      async function tick() {
        if (closed) return;
        try {
          if (Date.now() >= deadline) {
            stop();
            controller.close();
            return;
          }
          const [inbox, notifications] = await Promise.all([
            db.inboxMessage.count({
              where: { recipientId: user!.id, readAt: null },
            }),
            db.notification.count({
              where: {
                userId: user!.id,
                readAt: null,
                NOT: { eventKey: { startsWith: "inbox:" } },
              },
            }),
          ]);
          if (closed) return;
          controller.enqueue(
            encoder.encode(
              "data: " + JSON.stringify({ inbox, notifications }) + "\n\n",
            ),
          );
          timer = setTimeout(tick, 4000);
        } catch {
          if (!closed) {
            stop();
            controller.close();
          }
        }
      }
      request.signal.addEventListener("abort", stop, { once: true });
      void tick();
    },
    cancel: stop,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
