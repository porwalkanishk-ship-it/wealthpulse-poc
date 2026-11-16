/** One shared shape for every price source, so a paid provider can replace a free one by changing a single file. */
export interface PriceQuote {
  symbol: string;
  exchange: string;
  close: number;
  prevClose: number | null;
  /** YYYY-MM-DD trading date the close belongs to. */
  date: string;
  currency: string;
  source: string;
}

export interface PriceAdapter {
  readonly id: string;
  /** Exchanges this adapter can price. */
  readonly exchanges: string[];
  /**
   * Fetch the latest closes for the given symbols. Symbols it cannot price are simply left out.
   * Must throw only when the whole source is unavailable, so callers keep the last known price.
   */
  fetchLatest(symbols: string[]): Promise<PriceQuote[]>;
}
