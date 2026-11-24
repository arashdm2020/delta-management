import { requireManager } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { z } from "zod";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireManager();
  const { id } = await params;
  const document = await db.expenseDocument.findUniqueOrThrow({
    where: { id: z.uuid().parse(id) },
  });
  return new Response(new Uint8Array(document.content), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(document.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
