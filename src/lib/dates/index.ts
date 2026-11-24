export function jalali(value: Date | string) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    dateStyle: "medium",
  }).format(new Date(value));
}
export function jalaliTime(value: Date | string) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
