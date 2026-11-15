import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateResponse, GatewayError, PaymentRequiredError } from "@lovable.dev/ai-gateway";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchSchemeHistory, searchMfApi } from "./mfapi.server";

export interface CasFund {
  scheme_name: string;
  isin: string | null;
  folio: string | null;
  units: number;
  nav: number | null;
  market_value: number | null;
  cost_value: number | null;
  sip_amount: number | null;
  sip_day: number | null;
  holder_name: string | null;
  scheme_code: string | null;
  matched_name: string | null;
}

export interface CasResult {
  statement_date: string | null;
  investor_name: string | null;
  funds: CasFund[];
}

const nullableNumber = { type: ["number", "null"] };
const nullableString = { type: ["string", "null"] };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["statement_date", "investor_name", "funds"],
  properties: {
    statement_date: { ...nullableString, description: "Statement 'as on' / period end date, YYYY-MM-DD" },
    investor_name: nullableString,
    funds: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scheme_name", "isin", "folio", "units", "nav", "market_value", "cost_value", "sip_amount", "sip_day", "holder_name"],
        properties: {
          scheme_name: { type: "string" },
          isin: nullableString,
          folio: nullableString,
          units: { type: "number", description: "Closing unit balance" },
          nav: nullableNumber,
          market_value: nullableNumber,
          cost_value: nullableNumber,
          sip_amount: { ...nullableNumber, description: "Amount of recurring monthly SIP purchases, if the transactions show one" },
          sip_day: { type: ["integer", "null"], description: "Day of month the SIP purchases usually happen" },
          holder_name: nullableString,
        },
      },
    },
  },
} as const;

function outputText(res: unknown): string {
  const out = (res as { output?: unknown }).output;
  if (!Array.isArray(out)) return "";
  let text = "";
  for (const item of out) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      const part = c as { type?: string; text?: string };
      if (part.type === "output_text" && typeof part.text === "string") text += part.text;
    }
  }
  return text;
}

async function resolveScheme(name: string, isin: string | null): Promise<{ code: string; name: string } | null> {
  const cleaned = name
    .replace(/\(.*?\)/g, " ")
    .replace(/^[A-Z0-9]{2,8}\s*-\s*/, "")
    .replace(/\b(formerly|advisor|registrar|isin)\b.*$/i, "")
    .replace(/[^a-zA-Z0-9&\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ");
  let rows = await searchMfApi(words.slice(0, 6).join(" "));
  if (rows.length === 0) rows = await searchMfApi(words.slice(0, 3).join(" "));
  if (rows.length === 0) return null;
  const direct = /direct/i.test(name);
  const growth = !/idcw|dividend/i.test(name);
  const ranked = rows
    .map((r) => ({
      r,
      s: (/direct/i.test(r.schemeName) === direct ? 0 : 4) + (/growth/i.test(r.schemeName) === growth ? 0 : 2),
    }))
    .sort((a, b) => a.s - b.s)
    .map((x) => x.r);
  if (isin) {
    for (const r of ranked.slice(0, 6)) {
      const h = await fetchSchemeHistory(String(r.schemeCode), "2999-01-01").catch(() => null);
      if (h?.isins.includes(isin)) return { code: String(r.schemeCode), name: r.schemeName };
    }
  }
  const best = ranked[0];
  return best ? { code: String(best.schemeCode), name: best.schemeName } : null;
}

/** Read mutual fund holdings out of the text of a CAMS / KFintech / NSDL / CDSL CAS statement. */
export const extractCas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().min(200).max(600_000) }).parse(d))
  .handler(async ({ data }): Promise<CasResult> => {
    let raw = "";
    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions:
          "You read Indian mutual fund Consolidated Account Statements (CAS). Extract every scheme with a non-zero closing unit balance. Use numbers without commas or currency symbols. Use null when a value is absent. Never invent values.",
        input: [
          {
            role: "user",
            content: `Extract the mutual fund holdings from this CAS statement text. Return JSON.\n\n${data.text}`,
          },
        ],
        text: { format: { type: "json_schema", name: "cas_holdings", strict: true, schema } },
      });
      raw = outputText(res);
    } catch (e) {
      if (e instanceof GatewayError) {
        throw new Error(
          e instanceof PaymentRequiredError
            ? "AI credits have run out for this workspace. Add credits and try again."
            : "We couldn't read the statement right now. Please try again in a minute.",
        );
      }
      throw e;
    }
    let parsed: Omit<CasResult, "funds"> & { funds: Omit<CasFund, "scheme_code" | "matched_name">[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("We couldn't find mutual fund holdings in this statement.");
    }
    const funds: CasFund[] = [];
    for (const f of parsed.funds ?? []) {
      if (!f.units || f.units <= 0) continue;
      const match = await resolveScheme(f.scheme_name, f.isin).catch(() => null);
      funds.push({ ...f, scheme_code: match?.code ?? null, matched_name: match?.name ?? null });
    }
    return { statement_date: parsed.statement_date ?? null, investor_name: parsed.investor_name ?? null, funds };
  });
