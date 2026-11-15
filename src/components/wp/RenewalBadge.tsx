import { fmtMonDay, fmtMonDayYear } from "@/lib/dates";
import type { RenewalItem } from "@/lib/portfolio";
import { Badge } from "./ui";

/** Date chip: crimson when due within 30 days (or overdue), emerald for money coming in, slate otherwise. */
export function RenewalDateBadge({ item, today }: { item: RenewalItem; today: string }) {
  const sameYear = item.date.slice(0, 4) === today.slice(0, 4);
  const label = item.inflow || !sameYear ? fmtMonDayYear(item.date) : fmtMonDay(item.date);
  if (!item.inflow && item.days <= 30) return <Badge mono tone="co" className="py-1">{label}</Badge>;
  if (item.inflow) return <Badge mono tone="em" className="py-1">{label}</Badge>;
  return <Badge mono tone="slate" className="py-1">{label}</Badge>;
}

export function CountdownBadge({ item }: { item: RenewalItem }) {
  const d = item.days;
  const label = d < 0 ? `${Math.abs(d)}d late` : d === 0 ? "today" : d < 365 ? `${d}d` : `${(d / 365).toFixed(1)}y`;
  const tone = d <= 30 && !item.inflow ? "co" : d <= 90 && !item.inflow ? "amber" : item.inflow && d <= 90 ? "em" : "slate";
  return <Badge mono tone={tone} className="py-1 min-w-[44px] justify-center">{label}</Badge>;
}
