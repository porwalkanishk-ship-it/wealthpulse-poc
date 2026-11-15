// Calendar dates are kept as "YYYY-MM-DD" strings so they never shift across time zones.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toISO(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

export function todayISO(now: Date = new Date()) {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Today's date in India (IST, UTC+5:30), for server code that runs in UTC. */
export function todayIST(now: Date = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  return toISO(ist.getUTCFullYear(), ist.getUTCMonth() + 1, ist.getUTCDate());
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function dayNumber(iso: string) {
  const { y, m, d } = parseISO(iso);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function daysBetween(a: string, b: string) {
  return dayNumber(b) - dayNumber(a);
}

export function addDays(iso: string, n: number) {
  const dt = new Date((dayNumber(iso) + n) * 86400000);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Add months, clamping the day to the target month's length. */
export function addMonths(iso: string, n: number, day?: number) {
  const { y, m, d } = parseISO(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(day ?? d, daysInMonth(ny, nm)));
}

export function yearsBetween(a: string, b: string) {
  return daysBetween(a, b) / 365.25;
}

/** Whole calendar months from a to b (b's day must reach a's day). */
export function monthsBetween(a: string, b: string) {
  const A = parseISO(a);
  const B = parseISO(b);
  let months = (B.y - A.y) * 12 + (B.m - A.m);
  if (B.d < A.d) months -= 1;
  return Math.max(0, months);
}

export function fmtMonthYear(iso: string) {
  const { y, m } = parseISO(iso);
  return `${MONTHS[m - 1]} ${y}`;
}

export function fmtMonthLongYear(iso: string) {
  const { y, m } = parseISO(iso);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function fmtMonDayYear(iso: string) {
  const { y, m, d } = parseISO(iso);
  return `${MONTHS[m - 1]} ${pad2(d)}, ${y}`;
}

export function fmtMonDay(iso: string) {
  const { m, d } = parseISO(iso);
  return `${MONTHS[m - 1]} ${pad2(d)}`;
}

export function fmtDayMonYear(iso: string) {
  const { y, m, d } = parseISO(iso);
  return `${pad2(d)} ${MONTHS[m - 1]} ${y}`;
}

export function monthLabel(m: number) {
  return MONTHS[m - 1] ?? "";
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function fmtDuration(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return { y, m };
}
