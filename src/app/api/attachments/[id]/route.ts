import { requireApproved } from "@/modules/auth/session";
import { authorizedAttachment } from "@/modules/attachments/service";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireApproved();
  try {
    const document = await authorizedAttachment(actor, (await params).id);
    return new Response(new Uint8Array(document.content), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(document.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("پیوست در دسترس نیست.", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
