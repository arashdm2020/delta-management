import { requireManager } from "@/modules/auth/session";
import { hasRole } from "@/lib/security/core";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { ActionForm } from "@/components/shared/action-form";
import { Input } from "@/components/ui/input";
import { jalaliTime } from "@/lib/dates";
export default async function Board() {
  const actor = await requireManager();
  const superAdmin = hasRole(actor, "SUPER_ADMIN");
  const [members, users] = await Promise.all([
    db.boardMember.findMany({
      include: { user: { select: { name: true } }, term: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    superAdmin
      ? db.user.findMany({
          where: { status: "APPROVED" },
          select: { id: true, name: true },
          take: 200,
        })
      : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-bold">هیئت‌مدیره و دوره‌های عضویت</h2>
        <p className="page-description">
          هیچ رئیس هیئت‌مدیره‌ای به‌صورت فرضی تعیین نشده است. نقش هیئت‌مدیره
          مستقل از مالکیت یا اجاره است.
        </p>
        {members.length ? (
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="py-5">
                <h3 className="font-semibold">
                  {m.user.name} · {m.term.title}
                </h3>
                <p className="mb-3 text-xs text-secondary">
                  {jalaliTime(m.startsAt)} تا{" "}
                  {m.endsAt ? jalaliTime(m.endsAt) : "اکنون"}
                </p>
                {!m.endsAt && superAdmin && (
                  <ActionForm label="پایان عضویت و لغو نقش">
                    <input name="operation" type="hidden" value="board-end" />
                    <input name="id" type="hidden" value={m.id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="page-description py-5">عضوی ثبت نشده است.</p>
        )}
      </Card>
      {superAdmin && (
        <Card>
          <h2 className="mb-5 font-bold">ثبت عضو هیئت‌مدیره</h2>
          <ActionForm>
            <input name="operation" type="hidden" value="board" />
            <label className="field">
              کاربر
              <select name="userId" required>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              عنوان دوره
              <Input name="title" required minLength={3} maxLength={100} />
            </label>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
