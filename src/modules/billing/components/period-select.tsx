import { currentPeriod, periodBounds } from "../calendar";
export function PaymentPeriodSelect({
  value = currentPeriod(),
  name = "period",
}: {
  value?: string;
  name?: string;
}) {
  const [year, month] = value.split("-").map(Number);
  return (
    <select
      name={name}
      defaultValue={value}
      required
      className="min-h-12 w-full min-w-0 rounded-xl border border-input bg-white px-3 text-base focus:border-primary"
    >
      {Array.from({ length: 25 }, (_, index) => {
        const serial = year * 12 + month - 1 + index - 12;
        const key = `${Math.floor(serial / 12)}-${String((serial % 12) + 1).padStart(2, "0")}`;
        return (
          <option key={key} value={key}>
            {new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
              timeZone: "Asia/Tehran",
              year: "numeric",
              month: "long",
            }).format(periodBounds(key).startsAt)}
          </option>
        );
      })}
    </select>
  );
}
