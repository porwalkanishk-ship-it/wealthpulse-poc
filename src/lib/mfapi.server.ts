import type { NavPoint } from "./sip";

interface MfApiResponse {
  meta?: { scheme_code?: number; scheme_name?: string; isin_growth?: string | null; isin_div_reinvestment?: string | null };
  data?: { date: string; nav: string }[];
  status?: string;
}

export interface SchemeHistory {
  code: string;
  name: string;
  isins: string[];
  history: NavPoint[];
}

function ddmmyyyyToISO(s: string) {
  const [d, m, y] = s.split("-");
  return `${y}-${m}-${d}`;
}

/** Full NAV history for one AMFI scheme from mfapi.in (an AMFI NAV mirror), sorted oldest first. */
export async function fetchSchemeHistory(code: string, sinceISO?: string): Promise<SchemeHistory | null> {
  const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as MfApiResponse;
  if (!json.data || json.data.length === 0) return null;
  const history: NavPoint[] = [];
  for (const row of json.data) {
    const date = ddmmyyyyToISO(row.date);
    if (sinceISO && date < sinceISO) break; // data is newest first
    const nav = Number(row.nav);
    if (Number.isFinite(nav) && nav > 0) history.push({ date, nav });
  }
  history.reverse();
  return {
    code,
    name: json.meta?.scheme_name ?? "",
    isins: [json.meta?.isin_growth, json.meta?.isin_div_reinvestment].filter((x): x is string => !!x),
    history,
  };
}

export async function searchMfApi(q: string): Promise<{ schemeCode: number; schemeName: string }[]> {
  const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const json = (await res.json()) as unknown;
  return Array.isArray(json) ? (json as { schemeCode: number; schemeName: string }[]) : [];
}
