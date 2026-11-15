/**
 * Invoice date parsing shared by PDF checks and CSV/Excel audits. Pure.
 *
 * "03/04/2026" is 3 April in most countries and 4 March in the US, so an
 * ambiguous numeric date yields BOTH readings; callers compare candidate sets
 * (two dates match if any reading matches) or pass an explicit order.
 */
export type DateOrder = "dmy" | "mdy";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  января: 1, январь: 1, февраля: 2, февраль: 2, марта: 3, март: 3, апреля: 4, апрель: 4, мая: 5, май: 5, июня: 6, июнь: 6,
  июля: 7, июль: 7, августа: 8, август: 8, сентября: 9, сентябрь: 9, октября: 10, октябрь: 10, ноября: 11, ноябрь: 11, декабря: 12, декабрь: 12,
};

const MONTH_WORD = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

function iso(year: number, month: number, day: number): string | null {
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null; // 31.02 etc.
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Excel serial day number (1900 date system) → ISO date. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 32874 || serial > 73415) return null; // 1990..2100
  const ms = Math.round((Math.floor(serial) - 25569) * 86_400_000);
  const d = new Date(ms);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * All plausible ISO readings of a date string, most likely first.
 * Unambiguous inputs return one value; unreadable inputs return [].
 */
export function dateCandidates(value: unknown, order?: DateOrder): string[] {
  const raw = String(value ?? "").normalize("NFKC").trim();
  if (!raw) return [];

  // 3 November 2026 / 3rd Nov 2026 / 03-Nov-26
  const dayFirst = raw.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?[\\s.\\-/]+(${MONTH_WORD})\\.?,?[\\s.\\-/]+(\\d{4}|\\d{2})(?!\\d)`, "i"));
  if (dayFirst) {
    const out = iso(Number(dayFirst[3]), MONTHS[dayFirst[2].toLowerCase()], Number(dayFirst[1]));
    return out ? [out] : [];
  }
  // March 5, 2026 / Mar 5 2026
  const monthFirst = raw.match(new RegExp(`(${MONTH_WORD})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?!\\d)`, "i"));
  if (monthFirst) {
    const out = iso(Number(monthFirst[3]), MONTHS[monthFirst[1].toLowerCase()], Number(monthFirst[2]));
    return out ? [out] : [];
  }
  // 2026-11-03 / 2026/11/03 / 2026.11.03
  const ymd = raw.match(/(?<!\d)(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/);
  if (ymd) {
    const out = iso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    return out ? [out] : [];
  }
  // 03/04/2026, 3.4.26
  const numeric = raw.match(/(?<!\d)(\d{1,2})([./-])(\d{1,2})\2(\d{4}|\d{2})(?!\d)/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[3]);
    const year = Number(numeric[4]);
    const dmy = iso(year, b, a);
    const mdy = iso(year, a, b);
    if (order === "dmy") return dmy ? [dmy] : [];
    if (order === "mdy") return mdy ? [mdy] : [];
    // Dots are a day-first convention; slashes and dashes are used both ways.
    if (numeric[2] === ".") return dmy ? [dmy] : mdy ? [mdy] : [];
    return [...new Set([dmy, mdy].filter((v): v is string => Boolean(v)))];
  }
  return [];
}

/** Best single reading, or "" when unreadable. */
export function parseDate(value: unknown, order?: DateOrder): string {
  return dateCandidates(value, order)[0] ?? "";
}

/** Smallest distance in days between any readings of two dates; null if either is unreadable. */
export function dayDistance(a: string[], b: string[]): number | null {
  let best: number | null = null;
  for (const x of a) for (const y of b) {
    const days = Math.abs(Date.parse(x) - Date.parse(y)) / 86_400_000;
    if (Number.isFinite(days) && (best === null || days < best)) best = days;
  }
  return best;
}

/**
 * Infers the day/month order of a whole column of dates: one value with a
 * first part above 12 proves day-first, a second part above 12 proves
 * month-first. Returns null when the column never disambiguates.
 */
export function inferDateOrder(values: unknown[]): DateOrder | null {
  let dmy = 0;
  let mdy = 0;
  for (const value of values) {
    const m = String(value ?? "").match(/(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dmy += 1;
    else if (b > 12 && a <= 12) mdy += 1;
  }
  if (dmy && !mdy) return "dmy";
  if (mdy && !dmy) return "mdy";
  if (dmy && mdy) return dmy >= mdy ? "dmy" : "mdy";
  return null;
}
