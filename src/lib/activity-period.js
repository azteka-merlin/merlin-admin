const DAY_MS = 86_400_000;
const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});
const monthTitle = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });

export function todayInBrasilia(date = new Date()) {
  const parts = Object.fromEntries(dateParts.formatToParts(date).map(part => [part.type, part.value]));
  return parts.year + "-" + parts.month + "-" + parts.day;
}

export function addDays(day, amount) {
  return new Date(Date.parse(day + "T00:00:00Z") + amount * DAY_MS).toISOString().slice(0, 10);
}

export function dayDistance(from, to) {
  return (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / DAY_MS;
}

export function shiftMonth(month, step) {
  const date = new Date(month + "T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + step, 1);
  return date.toISOString().slice(0, 10);
}

export function monthDays(month) {
  const first = new Date(month + "T00:00:00Z");
  const blanks = first.getUTCDay();
  const count = dayDistance(month, shiftMonth(month, 1));
  return [
    ...Array(blanks).fill(null),
    ...Array.from({ length: count }, (_, index) => addDays(month, index)),
  ];
}

export function formatMonth(month) {
  return monthTitle.format(new Date(month + "T00:00:00Z"));
}

export function activityBounds(period, today = todayInBrasilia(), reference = new Date()) {
  if (period.mode === "last24h") {
    return { from: new Date(reference.getTime() - DAY_MS).toISOString(), to: reference.toISOString() };
  }
  const start = period.mode === "week" ? addDays(today, -6) : period.start || today;
  const end = period.mode === "range" ? period.end : period.start || today;
  const startTime = period.startTime || "00:00";
  const endTime = period.endTime || "23:59";
  const days = dayDistance(start, end);
  if (!Number.isFinite(days) || days < 0 || days >= 7 || (days === 0 && startTime > endTime)) return null;
  const from = new Date(start + "T" + startTime + ":00-03:00").toISOString();
  const through = Date.parse(end + "T" + endTime + ":00-03:00");
  return { from, to: new Date(through + 60_000).toISOString() };
}
