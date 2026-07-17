// Defensive normalisation for imported roster data. Users are often careless:
// they merge age group + weight class into one cell, use mixed casing, extra
// spaces, "kg"/"Kg"/"KG", "6-9"/"6 đến 9", etc. These helpers standardise it and
// — importantly — split weight class and age group apart.

/** Collapse runs of whitespace and trim. */
export function normalizeSpace(s: string): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** Title-case a Vietnamese name: "nguyễn thị kim ngân" → "Nguyễn Thị Kim Ngân". */
export function normalizeName(s: string): string {
  const clean = normalizeSpace(s);
  if (!clean) return '';
  return clean
    .toLocaleLowerCase('vi')
    .split(' ')
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase('vi') + w.slice(1) : w))
    .join(' ');
}

/** Units keep their casing (e.g. "Phường DH") — just tidy the spacing. */
export function normalizeUnit(s: string): string {
  return normalizeSpace(s);
}

/** "nam"/"male"/"m" → "Nam", "nữ"/"female"/"f" → "Nữ", else "". */
export function parseGender(s: string): string {
  const l = normalizeSpace(s).toLowerCase();
  if (/(^|[^a-zà-ỹ])(nữ|female|girl|gái)([^a-zà-ỹ]|$)/i.test(l)) return 'Nữ';
  if (/(^|[^a-zà-ỹ])(nam|male|boy|trai)([^a-zà-ỹ]|$)/i.test(l)) return 'Nam';
  return '';
}

/**
 * Pull the weight class out of a messy string and return the leftover text.
 * Handles "36kg", "36 kg", "36KG", "-36kg", weight ranges "36-40kg", "hạng 36".
 * Standard output form: "36kg" or "36-40kg".
 */
export function parseWeight(s: string): { weight: string; rest: string } {
  const src = normalizeSpace(s);
  // "Trên 42kg" / "+42kg" / "> 42kg" — and the trailing form "42kg+" that our
  // own labels use — is the open (heavier) class; keep it distinct from "42kg".
  const over =
    /(trên|tren|\+|>|over|hơn)\s*\d{1,3}\s*(?:kgs?|kí|ký)/i.test(src) ||
    /\d{1,3}\s*(?:kgs?|kí|ký)\s*\+/i.test(src);
  const suffix = over ? '+' : '';

  // Range with a unit: "36-40kg", "36 - 40 kg"
  const range = src.match(/(\d{1,3})\s*[-–—]\s*(\d{1,3})\s*(?:kgs?|kí|ký|kilograms?)/i);
  if (range) {
    return { weight: `${+range[1]}-${+range[2]}kg`, rest: src.replace(range[0], ' ') };
  }

  // Single with a unit: "36kg".
  const single = src.match(/(\d{1,3})\s*(?:kgs?|kí|ký|kilograms?)/i);
  if (single) {
    return { weight: `${+single[1]}kg${suffix}`, rest: src.replace(single[0], ' ') };
  }

  // "hạng cân 36" / "hạng 36" / "cân 36" without an explicit unit.
  const implied = src.match(/(?:h[aạ]ng\s*c[aâ]n|h[aạ]ng|c[aâ]n)\s*(\d{1,3})/i);
  if (implied) {
    return { weight: `${+implied[1]}kg${suffix}`, rest: src.replace(implied[0], ' ') };
  }

  return { weight: '', rest: src };
}

/**
 * Pull the age group out of a string (weight tokens should already be removed
 * so a weight range isn't mistaken for an age). Handles "6-9", "6 – 9",
 * "6 đến 9", "6 tới 9", "tuổi 6-9", and a single age "8 tuổi".
 */
export function parseAgeGroup(s: string): string {
  const src = normalizeSpace(s);
  const range = src.match(/(\d{1,2})\s*(?:-|–|—|to|đến|tới|\.\.)\s*(\d{1,2})/i);
  if (range) return `${+range[1]}-${+range[2]}`;
  const single = src.match(/(\d{1,2})\s*tu[oổ]i/i);
  if (single) return single[1];
  return '';
}

export interface ParsedClass {
  weight: string; // "36kg" | "36-40kg" | ""
  ageGroup: string; // "6-9" | "8" | ""
  gender: string; // "Nam" | "Nữ" | ""
}

/**
 * Split a combined, messy class string into its parts. This is the key step
 * that lets a user type "tuổi 6-9 hạng 36kg nam" (or any order/casing) in one
 * cell and get {weight:"36kg", ageGroup:"6-9", gender:"Nam"} back.
 */
export function parseClass(raw: string): ParsedClass {
  const s = normalizeSpace(raw);
  const gender = parseGender(s);
  // Weight first so a weight range's digits aren't read as an age range.
  const { weight, rest } = parseWeight(s);
  const ageGroup = parseAgeGroup(rest);
  return { weight, ageGroup, gender };
}

/**
 * Merge whatever class hints exist (dedicated columns + the sheet name) and
 * parse them together, then fall back to any explicit-but-unparsed column
 * values. Returns standardised, separated fields.
 */
export function resolveClass(parts: {
  weightCol?: string;
  ageCol?: string;
  genderCol?: string;
  combined?: string; // e.g. a "Nội dung"/"Hạng cân" cell holding everything
  sheetName?: string;
}): ParsedClass {
  const merged = [
    parts.combined,
    parts.weightCol,
    parts.ageCol,
    parts.genderCol,
    parts.sheetName,
  ]
    .filter(Boolean)
    .join(' ');

  const parsed = parseClass(merged);

  return {
    weight: parsed.weight || normalizeSpace(parts.weightCol ?? ''),
    ageGroup: parsed.ageGroup || normalizeSpace(parts.ageCol ?? ''),
    gender: parsed.gender || parseGender(parts.genderCol ?? ''),
  };
}

/** Stable grouping key for a class. Internal only — never shown. */
export function categoryKey(weight: string, ageGroup: string, gender: string): string {
  return `${weight}|${ageGroup}|${gender}`;
}

/**
 * The class as it reads on the board, the roster and the printed sheet:
 * "Hạng cân 22kg - Lứa tuổi 7-9 - Nam".
 *
 * Every part is named. A bare "22kg - 7-9 - Nam" makes the reader work out what
 * each number is, and this label is what the hall reads off the projector.
 */
export function categoryLabel(weight: string, ageGroup: string, gender: string): string {
  return [
    weight && `Hạng cân ${weight}`,
    ageGroup && `Lứa tuổi ${ageGroup}`,
    gender,
  ]
    .filter(Boolean)
    .join(' - ');
}
