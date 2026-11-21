/** Gold and silver held as grams. Value = grams × fineness/1000 × today's pure price per gram. */
export const GRAMS_PER_TROY_OUNCE = 31.1034768;

export type Metal = "gold" | "silver";

export const METAL_SYMBOL: Record<Metal, string> = { gold: "XAU_USD_OZ", silver: "XAG_USD_OZ" };

/** Fineness in parts per thousand, as stamped on Indian bullion and jewellery. */
export const PURITIES: Record<Metal, { fineness: number; label: string }[]> = {
  gold: [
    { fineness: 999, label: "24K (coins and bars)" },
    { fineness: 916, label: "22K (jewellery)" },
    { fineness: 750, label: "18K" },
  ],
  silver: [
    { fineness: 999, label: "999 (coins and bars)" },
    { fineness: 925, label: "925 (sterling)" },
    { fineness: 800, label: "800" },
  ],
};

/** Price of one gram of the pure metal in rupees, from the international price (USD per troy ounce) and USD to INR. */
export function inrPerGramPure(usdPerOunce: number, usdInr: number, premiumPct = 0): number {
  if (!(usdPerOunce > 0) || !(usdInr > 0)) return 0;
  return (usdPerOunce / GRAMS_PER_TROY_OUNCE) * usdInr * (1 + premiumPct / 100);
}

export function pureGrams(grams: number, fineness: number | null | undefined): number {
  const f = fineness && fineness > 0 && fineness <= 1000 ? fineness : 999;
  return grams * (f / 999);
}

/** The pure price is for 999 fine metal, so a 916 piece is worth 916/999 of it. */
export function metalValue(grams: number, fineness: number | null | undefined, pricePerGramPure: number): number {
  return Math.round(pureGrams(grams, fineness) * pricePerGramPure);
}
