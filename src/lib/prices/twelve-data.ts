import type { PriceAdapter, PriceQuote } from "./types";

/** Twelve Data free plan: each symbol costs 1 credit; 8 credits per minute, 800 per day. So one batch of 8 symbols per minute. */
export const TWELVE_DATA_LIMITS = { perMinute: 8, perDay: 800, batchSize: 8 } as const;

interface QuoteJson {
  symbol?: string;
  close?: string;
  previous_close?: string;
  datetime?: string;
  currency?: string;
  code?: number;
  status?: string;
}

export function parseTwelveDataQuotes(json: unknown, batch: string[]): PriceQuote[] {
  // One symbol returns the quote itself; several return an object keyed by symbol.
  const map: Record<string, QuoteJson> = batch.length === 1 && (json as QuoteJson)?.symbol ? { [batch[0]!]: json as QuoteJson } : (json as Record<string, QuoteJson>);
  const out: PriceQuote[] = [];
  for (const sym of batch) {
    const q = map?.[sym];
    if (!q || q.status === "error" || q.code) continue;
    const close = Number(q.close);
    if (!(close > 0) || !q.datetime) continue;
    const prev = Number(q.previous_close);
    out.push({ symbol: sym, exchange: "US", close, prevClose: prev > 0 ? prev : null, date: q.datetime.slice(0, 10), currency: q.currency ?? "USD", source: "twelve-data" });
  }
  return out;
}

export function createTwelveDataAdapter(
  apiKey: string,
  fetchJson: (url: string) => Promise<unknown>,
  sleep: (ms: number) => Promise<void>,
  creditsLeft: number = TWELVE_DATA_LIMITS.perDay,
): PriceAdapter {
  return {
    id: "twelve-data",
    exchanges: ["NASDAQ", "NYSE"],
    async fetchLatest(symbols) {
      const out: PriceQuote[] = [];
      let credits = creditsLeft;
      for (let i = 0; i < symbols.length; i += TWELVE_DATA_LIMITS.batchSize) {
        const batch = symbols.slice(i, i + TWELVE_DATA_LIMITS.batchSize);
        if (credits < batch.length) break; // quota used up: keep last known prices for the rest
        if (i > 0) await sleep(61_000); // stay under 8 credits a minute
        credits -= batch.length;
        const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(batch.join(","))}&apikey=${encodeURIComponent(apiKey)}`;
        out.push(...parseTwelveDataQuotes(await fetchJson(url), batch));
      }
      return out;
    },
  };
}
