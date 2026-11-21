/** Gold held as grams. Value = grams × purity/24 × today's 24-carat price per gram. */
export const GRAMS_PER_TROY_OUNCE = 31.1034768;

export const PURITIES = [
  { carats: 24, label: "24K (pure, coins and bars)" },
  { carats: 22, label: "22K (jewellery)" },
  { carats: 18, label: "18K" },
] as const;

/** 24K price per gram in rupees from the international price (USD per troy ounce) and the USD to INR rate. */
export function inrPerGram24k(usdPerOunce: number, usdInr: number, premiumPct = 0): number {
  if (!(usdPerOunce > 0) || !(usdInr > 0)) return 0;
  return (usdPerOunce / GRAMS_PER_TROY_OUNCE) * usdInr * (1 + premiumPct / 100);
}

export function pureGrams(grams: number, carats: number | null | undefined): number {
  const c = carats && carats > 0 && carats <= 24 ? carats : 24;
  return grams * (c / 24);
}

export function goldValue(grams: number, carats: number | null | undefined, price24kPerGram: number): number {
  return Math.round(pureGrams(grams, carats) * price24kPerGram);
}
