export function normalizedDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (c) =>
    String(
      c.charCodeAt(0) >= 1776 ? c.charCodeAt(0) - 1776 : c.charCodeAt(0) - 1632,
    ),
  );
}
export function floorKey(unit: { number: string; floor: string }) {
  const explicit = normalizedDigits(unit.floor.trim());
  if (explicit && !["نامشخص", "UNKNOWN", "-"].includes(explicit))
    return explicit;
  const number = normalizedDigits(unit.number.trim());
  return /^\d+$/.test(number)
    ? number.slice(0, -1).replace(/^0+/, "") || "0"
    : "نامشخص";
}
export const naturalOrder = (a: string, b: string) =>
  normalizedDigits(a).localeCompare(normalizedDigits(b), "fa", {
    numeric: true,
  });
export type Positioned = {
  id: string;
  number: string;
  floor: string;
  physicalPosition: number | null;
};
export function arrangeUnits<T extends Positioned>(units: T[]) {
  const floors = new Map<string, T[]>();
  for (const unit of units) {
    const key = floorKey(unit);
    floors.set(key, [...(floors.get(key) || []), unit]);
  }
  return [...floors]
    .sort(([a], [b]) => naturalOrder(a, b))
    .map(([floor, list]) => {
      const sorted = list.toSorted(
        (a, b) => naturalOrder(a.number, b.number) || a.id.localeCompare(b.id),
      );
      const occupied = new Set(
        sorted.flatMap((u) => (u.physicalPosition ? [u.physicalPosition] : [])),
      );
      let next = 1;
      const positioned = sorted
        .map((unit) => {
          if (unit.physicalPosition)
            return { unit, position: unit.physicalPosition };
          while (occupied.has(next)) next++;
          const position = next++;
          occupied.add(position);
          return { unit, position };
        })
        .sort((a, b) => a.position - b.position);
      return { floor, units: positioned };
    });
}
