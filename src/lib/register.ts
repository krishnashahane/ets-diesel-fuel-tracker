// Register-sheet parser: turns raw OCR text of a manually maintained diesel register
// into structured candidate entries. Pure, deterministic, rule-based — no AI/LLM.
// Shared by the client (live preview) and the server (bulk import re-parse/verify).

export interface RegisterRow {
  lineNo: number;
  raw: string;
  date?: string;            // YYYY-MM-DD
  vehicleNo?: string;       // Bus number (normalised, snapped to master when matched)
  driverName?: string;
  pump?: string;            // Pump name / diesel filling location
  diesel?: number;          // Litres
  rate?: number;            // Rupees per litre
  amount?: number;
  currentReading?: number;  // Odometer
  billNo?: string;
  confidence: number;       // 0-100 field-completeness/plausibility score for this row
  notes: string[];          // Human-readable parse remarks
}

export interface RegisterContext {
  vehicles: string[];
  drivers: string[];
  pumps: string[];
}

export interface ParseOptions {
  defaultDate?: string;     // YYYY-MM-DD applied when a row carries no date
  defaultPump?: string;     // Applied when a row carries no pump/location
}

// Plausibility windows. Anything outside is not silently coerced into a field.
const LIMITS = {
  dieselMin: 1, dieselMax: 400,
  rateMin: 30, rateMax: 200,
  odoMin: 100, odoMax: 3_000_000,
  amountMin: 100, amountMax: 200_000,
} as const;

export const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- normalising

export const normPlate = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// OCR routinely confuses these glyph pairs. Applied position-aware, never blindly.
const TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', J: '1', Z: '2', S: '5', B: '8', G: '6', T: '7', A: '4' };
const TO_ALPHA: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G' };

const asDigits = (s: string) => s.replace(/./g, (c) => TO_DIGIT[c] ?? c);
const asAlpha = (s: string) => s.replace(/./g, (c) => TO_ALPHA[c] ?? c);

// Coerce an OCR token towards the Indian plate shape: 2 alpha, 1-2 digit, 0-3 alpha, 1-4 digit.
export function coercePlate(token: string): string {
  const t = normPlate(token);
  const m = t.match(/^(.{2})(.{1,2})(.{0,3}?)(.{1,4})$/);
  if (!t || t.length < 6 || t.length > 12 || !m) return t;
  return asAlpha(m[1]) + asDigits(m[2]) + asAlpha(m[3]) + asDigits(m[4]);
}

// Damerau-lite edit distance, capped for speed. Returns >max as max+1.
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

// Snap an OCR token to the closest master value. Exact hit first, then bounded fuzzy.
export function snap(token: string, master: string[], maxDist = 2): string | undefined {
  if (!token) return undefined;
  const t = token.trim();
  if (!t) return undefined;
  const lower = t.toLowerCase();
  const exact = master.find((m) => m.toLowerCase() === lower);
  if (exact) return exact;
  let best: string | undefined;
  let bestD = maxDist + 1;
  for (const m of master) {
    const d = editDistance(lower, m.toLowerCase(), maxDist);
    if (d < bestD) { bestD = d; best = m; if (d === 0) break; }
  }
  return bestD <= maxDist ? best : undefined;
}

// Snap a plate against the vehicle master, tolerating OCR glyph confusion.
export function snapVehicle(token: string, vehicles: string[]): string | undefined {
  const raw = normPlate(token);
  if (raw.length < 4) return undefined;
  if (vehicles.includes(raw)) return raw;
  const coerced = coercePlate(raw);
  if (vehicles.includes(coerced)) return coerced;
  for (const cand of [coerced, raw]) {
    let best: string | undefined;
    let bestD = 3;
    for (const v of vehicles) {
      const d = editDistance(cand, v, 2);
      if (d < bestD) { bestD = d; best = v; if (d === 0) break; }
    }
    if (best && bestD <= 2) return best;
  }
  return undefined;
}

// ------------------------------------------------------------------- extractors

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

function buildDate(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += y > 70 ? 1900 : 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return undefined;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const chk = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(chk.getTime()) || chk.getUTCDate() !== d ? undefined : iso;
}

// Registers use dd/mm/yyyy in India. Also accepts yyyy-mm-dd and "12 Jan 25".
export function extractDate(text: string): { value?: string; matched?: string } {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    const v = buildDate(+iso[1], +iso[2], +iso[3]);
    if (v) return { value: v, matched: iso[0] };
  }
  const dmy = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (dmy) {
    const v = buildDate(+dmy[3], +dmy[2], +dmy[1]) ?? buildDate(+dmy[3], +dmy[1], +dmy[2]);
    if (v) return { value: v, matched: dmy[0] };
  }
  const named = text.match(/\b(\d{1,2})[\s-]*([A-Za-z]{3,4})[\s-]*(\d{2,4})\b/);
  if (named) {
    const m = MONTHS[named[2].toLowerCase()];
    if (m) {
      const v = buildDate(+named[3], m, +named[1]);
      if (v) return { value: v, matched: named[0] };
    }
  }
  return {};
}

const PLATE_RE = /\b[A-Z]{2}\s?[-]?\s?[0-9OQDILZSBG]{1,2}\s?[-]?\s?[A-Z]{0,3}\s?[-]?\s?[0-9OQDILZSBG]{2,4}\b/g;

export function extractVehicle(text: string, vehicles: string[]): { value?: string; matched?: string; exact: boolean } {
  const upper = text.toUpperCase();
  for (const m of upper.match(PLATE_RE) || []) {
    const hit = snapVehicle(m, vehicles);
    if (hit) return { value: hit, matched: m, exact: normPlate(m) === hit };
  }
  // Fall back to whitespace tokens (registers often break the plate across gaps).
  const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    for (let n = 1; n <= 4 && i + n <= tokens.length; n++) {
      const joined = tokens.slice(i, i + n).join('');
      if (joined.length < 6 || joined.length > 12) continue;
      const hit = snapVehicle(joined, vehicles);
      if (hit) return { value: hit, matched: tokens.slice(i, i + n).join(' '), exact: joined === hit };
    }
  }
  const loose = upper.match(PLATE_RE)?.[0];
  return loose ? { value: coercePlate(loose), matched: loose, exact: false } : { exact: false };
}

interface NumToken { value: number; raw: string; index: number; label?: string }

// Pull every numeric token with its preceding label word, so labelled registers win.
function numericTokens(text: string): NumToken[] {
  const out: NumToken[] = [];
  // Comma-grouped form first (1,28,999 / 9,420.00); otherwise a plain digit run.
  // The grouped alternative uses + not * — with * it would match just the first
  // three digits of a long plain number and truncate every odometer reading.
  const re = /([A-Za-z@/₹.]{0,14}?)\s*[:=]?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,3})?|\d+(?:\.\d{1,3})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = Number(m[2].replace(/,/g, ''));
    if (Number.isFinite(value)) out.push({ value, raw: m[2], index: m.index, label: m[1]?.toLowerCase() || undefined });
  }
  return out;
}

const LABEL = {
  diesel: /(qty|quantity|ltr|ltrs|litre|liter|lit|dsl|diesel|fuel|vol)/,
  rate: /(rate|rt|price|prc|@|\/l|perl)/,
  amount: /(amount|amt|total|rs|₹|value)/,
  odo: /(km|kms|odo|odometer|meter|mtr|reading|rdg|kmreading)/,
  bill: /(bill|inv|invoice|slip|challan|receipt|voucher|no)/,
} as const;

/**
 * Assign numeric tokens to diesel / rate / amount / odometer.
 * Strategy, strongest signal first:
 *   1. explicit column labels,
 *   2. the arithmetic identity qty x rate = amount,
 *   3. plausibility windows + shape (odometer = big integer, rate has the tightest range).
 */
export function assignNumbers(tokens: NumToken[]): { diesel?: number; rate?: number; amount?: number; currentReading?: number; strong: number } {
  const used = new Set<NumToken>();
  let strong = 0;
  const take = (test: (t: NumToken) => boolean): NumToken | undefined => {
    const hit = tokens.find((t) => !used.has(t) && test(t));
    if (hit) used.add(hit);
    return hit;
  };
  const labelled = (re: RegExp, min: number, max: number) =>
    take((t) => !!t.label && re.test(t.label) && t.value >= min && t.value <= max);

  let diesel = labelled(LABEL.diesel, LIMITS.dieselMin, LIMITS.dieselMax)?.value;
  let rate = labelled(LABEL.rate, LIMITS.rateMin, LIMITS.rateMax)?.value;
  let amount = labelled(LABEL.amount, LIMITS.amountMin, LIMITS.amountMax)?.value;
  let odo = labelled(LABEL.odo, LIMITS.odoMin, LIMITS.odoMax)?.value;
  strong = [diesel, rate, amount, odo].filter((v) => v !== undefined).length;

  const free = tokens.filter((t) => !used.has(t));

  // Odometer: the largest plain integer that cannot be an amount pairing.
  if (odo === undefined) {
    const cands = free.filter((t) => Number.isInteger(t.value) && t.value >= 1000 && t.value <= LIMITS.odoMax && !t.raw.includes('.'));
    const pick = cands.sort((a, b) => b.value - a.value)[0];
    if (pick) { odo = pick.value; used.add(pick); }
  }

  const rest = tokens.filter((t) => !used.has(t));

  // Arithmetic identity: find the (qty, rate, amount) triple that balances.
  if (diesel === undefined || rate === undefined) {
    let best: { q: NumToken; r: NumToken; a?: NumToken; err: number } | null = null;
    for (const q of rest) {
      if (q.value < LIMITS.dieselMin || q.value > LIMITS.dieselMax) continue;
      for (const r of rest) {
        if (r === q || r.value < LIMITS.rateMin || r.value > LIMITS.rateMax) continue;
        const expect = q.value * r.value;
        for (const a of rest) {
          if (a === q || a === r) continue;
          const err = Math.abs(a.value - expect) / Math.max(1, expect);
          if (err <= 0.02 && (!best || err < best.err)) best = { q, r, a, err };
        }
      }
    }
    if (best) {
      diesel = best.q.value; rate = best.r.value; amount = best.a?.value;
      used.add(best.q); used.add(best.r); if (best.a) used.add(best.a);
      strong += 3;
    }
  }

  const left = tokens.filter((t) => !used.has(t));
  if (rate === undefined) {
    const pick = left.find((t) => t.value >= LIMITS.rateMin && t.value <= LIMITS.rateMax && !Number.isInteger(t.value))
      ?? left.find((t) => t.value >= 60 && t.value <= 130);
    if (pick) { rate = pick.value; used.add(pick); }
  }
  if (diesel === undefined) {
    const pick = tokens.find((t) => !used.has(t) && t.value >= LIMITS.dieselMin && t.value <= LIMITS.dieselMax);
    if (pick) { diesel = pick.value; used.add(pick); }
  }
  if (amount === undefined && diesel !== undefined && rate !== undefined) {
    const expect = diesel * rate;
    const pick = tokens.find((t) => !used.has(t) && Math.abs(t.value - expect) / Math.max(1, expect) <= 0.05);
    if (pick) { amount = pick.value; used.add(pick); }
  }
  // A leftover token in the money range is the amount column — which then lets
  // the missing rate be derived below instead of leaving the row incomplete.
  if (amount === undefined) {
    const pick = tokens.find((t) => !used.has(t) && t.value >= LIMITS.amountMin && t.value <= LIMITS.amountMax);
    if (pick) { amount = pick.value; used.add(pick); }
  }
  // Derive the missing leg of the identity rather than leaving a hole.
  if (diesel === undefined && amount !== undefined && rate) diesel = r2(amount / rate);
  if (rate === undefined && amount !== undefined && diesel) rate = r2(amount / diesel);

  return { diesel, rate, amount, currentReading: odo, strong };
}

function extractBillNo(text: string): string | undefined {
  const m = text.match(/(?:bill|inv(?:oice)?|slip|challan|receipt|voucher)\s*(?:no\.?|#|:)?\s*([A-Za-z0-9/-]{3,24})/i);
  return m?.[1];
}

// A line is data if it carries at least one number and is not a header/total row.
const NOISE_RE = /^(?:s\.?\s?no|sr|date|bus|vehicle|driver|pump|qty|rate|amount|total|grand|page|signature|sign|remarks?)\b[\s|]*$/i;

export function isDataLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 6) return false;
  if (NOISE_RE.test(t)) return false;
  if (/^(?:total|grand\s*total|sub\s*total|carried)\b/i.test(t)) return false;
  const digits = (t.match(/\d/g) || []).length;
  return digits >= 3;
}

// -------------------------------------------------------------------- main API

export function parseRegisterLine(
  line: string,
  lineNo: number,
  ctx: RegisterContext,
  opts: ParseOptions = {},
): RegisterRow {
  const notes: string[] = [];
  const raw = line.replace(/\s+/g, ' ').trim();

  const date = extractDate(raw);
  const veh = extractVehicle(raw, ctx.vehicles);

  // Remove already-consumed spans so their digits cannot be mistaken for measurements.
  let numeric = raw;
  if (date.matched) numeric = numeric.replace(date.matched, ' ');
  if (veh.matched) numeric = numeric.replace(new RegExp(veh.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  const billNo = extractBillNo(raw);
  if (billNo) numeric = numeric.replace(billNo, ' ');

  const nums = assignNumbers(numericTokens(numeric));

  // Names: match master lists against the alphabetic remainder of the line.
  const words = raw.split(/[^A-Za-z]+/).filter((w) => w.length >= 3);
  let driverName: string | undefined;
  let pump: string | undefined;
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= 3 && i + n <= words.length; n++) {
      const phrase = words.slice(i, i + n).join(' ');
      if (!pump) pump = snap(phrase, ctx.pumps, phrase.length > 6 ? 2 : 1);
      if (!driverName) driverName = snap(phrase, ctx.drivers, phrase.length > 6 ? 2 : 1);
    }
  }
  if (pump && driverName && pump.toLowerCase() === driverName.toLowerCase()) driverName = undefined;

  const resolvedDate = date.value ?? opts.defaultDate;
  const resolvedPump = pump ?? opts.defaultPump;

  if (!date.value && opts.defaultDate) notes.push('Date defaulted');
  if (!veh.value) notes.push('Bus number not read');
  else if (!veh.exact) notes.push('Bus number auto-corrected — verify');
  if (nums.currentReading === undefined) notes.push('Odometer not read');
  if (nums.diesel === undefined) notes.push('Quantity not read');
  if (!resolvedPump) notes.push('Pump / location not read');

  // Confidence: mandatory fields carry the most weight.
  const score =
    (veh.value ? (veh.exact ? 30 : 18) : 0) +
    (nums.diesel !== undefined ? 25 : 0) +
    (nums.currentReading !== undefined ? 20 : 0) +
    (resolvedPump ? 10 : 0) +
    (nums.rate !== undefined ? 8 : 0) +
    (resolvedDate ? 5 : 0) +
    (driverName ? 2 : 0);

  return {
    lineNo, raw,
    date: resolvedDate,
    vehicleNo: veh.value,
    driverName,
    pump: resolvedPump,
    diesel: nums.diesel,
    rate: nums.rate,
    amount: nums.amount,
    currentReading: nums.currentReading,
    billNo,
    confidence: Math.min(100, score),
    notes,
  };
}

export function parseRegisterText(text: string, ctx: RegisterContext, opts: ParseOptions = {}): RegisterRow[] {
  // A page-level date in the header applies to every row that lacks its own.
  const lines = (text || '').split(/\r?\n/);
  const headerDate = opts.defaultDate ?? lines.slice(0, 4).map((l) => extractDate(l).value).find(Boolean);
  const rows: RegisterRow[] = [];
  lines.forEach((line, i) => {
    if (!isDataLine(line)) return;
    const row = parseRegisterLine(line, i + 1, ctx, { ...opts, defaultDate: headerDate });
    // Drop lines that yielded nothing usable — they are ruling/noise, not entries.
    if (row.vehicleNo || row.diesel !== undefined || row.currentReading !== undefined) rows.push(row);
  });
  return rows;
}

// Mandatory-field gate shared by the register grid and the bulk API.
export const REQUIRED_FIELDS = ['diesel', 'currentReading', 'vehicleNo', 'pump'] as const;

export function missingRequired(row: Partial<RegisterRow>): string[] {
  const out: string[] = [];
  if (!(Number(row.diesel) > 0)) out.push('Diesel Quantity (L)');
  if (!(Number(row.currentReading) > 0)) out.push('Odometer Reading');
  if (!row.vehicleNo?.trim()) out.push('Bus Number');
  if (!row.pump?.trim()) out.push('Pump / Filling Location');
  return out;
}
