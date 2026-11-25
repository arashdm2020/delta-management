import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { rialToToman, digits } from "@/lib/utils";
import type { ManagementOverview } from "./service";
export function BuildingMap({ data }: { data: ManagementOverview }) {
  const activeGroups = data.groups.filter((g) => !g.endsAt);
  return (
    <section aria-label="نقشهٔ واحدهای ساختمان" className="space-y-5 min-w-0">
      <h2 className="text-xl font-bold">نمای طبقات و واحدها</h2>
      {!data.units.length && (
        <Card>
          هنوز واحدی ثبت نشده است. فقط واحدهای واقعی را در مدیریت واحدها ثبت
          کنید.
        </Card>
      )}
      {data.floors.map((floor) => {
        const consumed = new Set<string>();
        const cards = floor.units.flatMap(({ unit, position }) => {
          if (consumed.has(unit.id)) return [];
          const group = activeGroups.find((g) =>
            g.members.some((m) => m.unitId === unit.id),
          );
          const units = group
            ? floor.units
                .filter((p) =>
                  group.members.some((m) => m.unitId === p.unit.id),
                )
                .map((p) => p.unit)
            : [unit];
          units.forEach((u) => consumed.add(u.id));
          return [
            {
              units,
              group,
              position,
              span: units.length,
            },
          ];
        });
        return (
          <section
            key={floor.floor}
            aria-label={`طبقه ${floor.floor}`}
            className="rounded-2xl border border-border bg-white/60 p-3 sm:p-5"
          >
            <h3 className="mb-3 font-bold">طبقه {floor.floor}</h3>
            <div
              className="grid grid-cols-3 gap-2 sm:gap-4 items-stretch"
              dir="rtl"
            >
              {cards.map(({ units, group, position, span }) => (
                <article
                  key={group?.id || units[0].id}
                  data-unit-card
                  data-unit-numbers={units.map((u) => u.number).join("+")}
                  style={{
                    gridColumn: `${((position - 1) % 3) + 1} / span ${span}`,
                    gridRow: Math.floor((position - 1) / 3) + 1,
                  }}
                  className="min-w-0 rounded-xl border border-border bg-white p-2 sm:p-3"
                >
                  <h4
                    dir="ltr"
                    className="font-bold text-primary text-sm sm:text-lg"
                  >
                    <Link
                      className="focus-visible:outline-2 focus-visible:outline-primary"
                      href={
                        group
                          ? `/management#physical-group-${group.id}`
                          : `/management/units/${units[0].id}`
                      }
                    >
                      {units.map((u) => u.number).join(" + ")}
                    </Link>
                  </h4>
                  {group && (
                    <Badge>گروه فیزیکی · {digits(span)} واحد مالی مستقل</Badge>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {units.map((u) => (
                      <Badge
                        key={u.id}
                        tone={
                          !u.active || u.occupancy === "UNKNOWN"
                            ? "warning"
                            : u.occupancy === "VACANT"
                              ? "neutral"
                              : "success"
                        }
                      >
                        {units.length > 1 ? `${u.number}: ` : ""}
                        {!u.active
                          ? "غیرفعال"
                          : u.occupancy === "OCCUPIED"
                            ? "دارای ساکن"
                            : u.occupancy === "VACANT"
                              ? "خالی"
                              : "سکونت نامشخص"}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2 text-xs sm:text-sm">
                    <p
                      className={
                        units.some((u) => u.outstanding > 0n)
                          ? "text-red-700"
                          : "text-secondary"
                      }
                    >
                      مانده:{" "}
                      {rialToToman(
                        units.reduce((sum, u) => sum + u.outstanding, 0n),
                      )}
                    </p>
                    {group && (
                      <ul aria-label="تفکیک ماندهٔ واحدها">
                        {units.map((u) => (
                          <li key={u.id}>
                            {u.number}: {rialToToman(u.outstanding)}
                          </li>
                        ))}
                      </ul>
                    )}
                    <details>
                      <summary className="min-h-10 cursor-pointer py-2 font-medium text-primary">
                        عملیات
                      </summary>
                      {units.map((u) => (
                        <nav
                          key={u.id}
                          aria-label={`عملیات واحد ${u.number}`}
                          className="flex flex-wrap gap-x-2"
                        >
                          {[
                            ["#statement", "حساب"],
                            ["#charge", "بدهی"],
                            ["#payments", "پرداخت"],
                            ["", "جزئیات"],
                          ].map(([anchor, label]) => (
                            <Link
                              key={label}
                              className="inline-flex min-h-9 items-center text-primary underline"
                              href={`/management/units/${u.id}${anchor}`}
                            >
                              {label}
                              {group ? " " + u.number : ""}
                            </Link>
                          ))}
                          <Link
                            className="inline-flex min-h-9 items-center text-primary underline"
                            href={`/management/communications?unit=${u.id}#board-sms`}
                          >
                            پیامک{group ? " " + u.number : ""}
                          </Link>
                        </nav>
                      ))}
                    </details>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}
