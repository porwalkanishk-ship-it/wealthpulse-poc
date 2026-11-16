/**
 * Strips personal details from CAS text before any of it leaves the browser
 * (AI fallback only): investor and holder names, PAN, email, phone numbers
 * and postal address. Keeps folios, schemes, ISINs and transaction lines.
 */

const FOLIO_LINE = /Folio\s*(?:No|Number)?\.?\s*:?\s*\d/i;
const BODY_START = /Folio\s*(?:No|Number)?\.?\s*:?\s*\d|Opening\s+Unit\s+Balance/i;
const DATE_SRC = "\\d{1,2}[-/ ](?:[A-Za-z]{3}|\\d{1,2})[-/ ]\\d{4}";
const PERIOD_RE = new RegExp(`(${DATE_SRC})\\s*(?:to|-|–)\\s*(${DATE_SRC})`, "i");
const TITLE_RE = /Consolidated\s+Account\s+(Statement|Summary)|Detailed|Summary\s+Statement/i;
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE_INTL = /(?:\+|\b)91[\s-]?[6-9]\d{4}[\s-]?\d{5}\b/g;
const MOBILE_RE = /\b[6-9]\d{4}[\s-]?\d{5}\b/g;
const LANDLINE_RE = /\b0\d{2,4}[\s-]\d{6,8}\b/g;
const PERSONAL_LINE = /^(Nominee|Joint\s+Holder|Holder|Guardian|Mobile|Phone|Tel|Email|E-mail|Address|Name)\b/i;
const ADDRESS_HINT = /\b(PIN|Pincode|Pin\s*code)\s*:?\s*\d{6}\b|[-,]\s*[1-9]\d{5}\s*$/i;
const NOT_NAME_WORDS = new Set([
  "CONSOLIDATED", "ACCOUNT", "STATEMENT", "PORTFOLIO", "SUMMARY", "MUTUAL", "FUND", "FUNDS", "CAMS", "KFINTECH",
  "VALUE", "MARKET", "COST", "DATE", "PAGE", "TOTAL", "DETAILED", "INR", "NSDL", "CDSL", "DEMAT", "LIMITED", "LTD",
]);

function nameCandidate(line: string): string | null {
  const s = line.replace(PERIOD_RE, "").replace(/\s+/g, " ").trim();
  if (!/^[A-Z][A-Z.' ]{2,60}$/.test(s)) return null;
  const words = s.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 5) return null;
  if (words.some((w) => NOT_NAME_WORDS.has(w.replace(/\./g, "")))) return null;
  return s;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function redactCasText(text: string, knownNames: string[] = []): string {
  const lines = text.split(/\r?\n/);
  let bodyStart = lines.findIndex((l) => BODY_START.test(l));
  if (bodyStart < 0) bodyStart = Math.min(lines.length, 25);

  const names = new Set<string>();
  const out: string[] = [];

  // Header (investor block): keep only the title and statement period.
  for (const line of lines.slice(0, bodyStart)) {
    const cand = nameCandidate(line);
    if (cand) names.add(cand);
    const period = line.match(PERIOD_RE);
    if (period) out.push(`Statement period ${period[1]} To ${period[2]}`);
    else if (TITLE_RE.test(line) && line.length < 80 && !EMAIL_RE.test(line)) out.push(line.match(TITLE_RE)![0]);
    EMAIL_RE.lastIndex = 0;
  }

  // Body: drop holder/nominee lines between a scheme's ISIN line and its opening balance.
  let inHolderBlock = false;
  for (const raw of lines.slice(bodyStart)) {
    const line = raw.trim();
    if (/Opening\s+Unit\s+Balance/i.test(line)) inHolderBlock = false;
    else if (inHolderBlock && !FOLIO_LINE.test(line)) {
      const cand = nameCandidate(line);
      if (cand) names.add(cand);
      continue;
    }
    if (/ISIN|Registrar/i.test(line)) inHolderBlock = true;
    if (FOLIO_LINE.test(line)) inHolderBlock = false;
    if (PERSONAL_LINE.test(line) || ADDRESS_HINT.test(line)) continue;
    let s = line.replace(/Nominee\s*\d*\s*:.*$/i, "").replace(/(Mobile|Phone|Tel|Email|E-mail)\s*(Id|No\.?)?\s*:.*$/i, "");
    s = s.replace(PAN_RE, "[PAN]").replace(EMAIL_RE, "[EMAIL]").replace(PHONE_INTL, "[PHONE]").replace(LANDLINE_RE, "[PHONE]");
    if (!FOLIO_LINE.test(s)) s = s.replace(MOBILE_RE, "[PHONE]");
    out.push(s);
  }

  for (const n of knownNames) if (n && n.trim().length >= 4) names.add(n.trim());
  let result = out.join("\n");
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(`\\b${escapeRe(n).replace(/\s+/g, "\\s+")}\\b`, "gi"), "[NAME]");
  }
  return result;
}
