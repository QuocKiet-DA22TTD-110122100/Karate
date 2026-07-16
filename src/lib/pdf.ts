import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfRow = Record<string, string>;

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
}

// Group text items into visual rows (same baseline y), sorted left→right.
function groupIntoLines(items: Item[]): Item[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  const yThreshold = 4;
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= yThreshold) last.push(it);
    else lines.push([it]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

// Merge items on a line into fields, splitting only on a real column gap.
function groupIntoFields(line: Item[]): string[] {
  const GAP = 10;
  const fields: string[] = [];
  let curr = '';
  let lastEnd: number | null = null;
  for (const it of line) {
    if (lastEnd !== null && it.x - lastEnd > GAP) {
      fields.push(curr.trim());
      curr = '';
    }
    curr = curr ? `${curr} ${it.str}` : it.str;
    lastEnd = it.x + it.w;
  }
  if (curr.trim()) fields.push(curr.trim());
  return fields;
}

const isYear = (s: string) => /^(19|20)\d{2}$/.test(s.trim());
const hasWeight = (s: string) => /\d{1,3}\s*kg/i.test(s);

// A data row starts with a sequence number and has more than one field.
function leadingNumber(fields: string[]): { num: boolean; rest: string[] } {
  if (fields.length === 0) return { num: false, rest: fields };
  const first = fields[0].trim();
  if (/^\d{1,3}$/.test(first)) return { num: true, rest: fields.slice(1) };
  // number glued to the next field, e.g. "1 Trần ..."
  const m = first.match(/^(\d{1,3})\s+(.+)/);
  if (m) return { num: true, rest: [m[2], ...fields.slice(1)] };
  return { num: false, rest: fields };
}

// Parse a data row into name / unit / weight using content, not x-columns.
// Handles "TT Name Year Unit Weight" as well as simpler "TT Name Unit".
function parseRow(fields: string[]): { name: string; unit: string; weight: string } | null {
  const { num, rest } = leadingNumber(fields);
  if (!num || rest.length === 0) return null;

  const yearIdx = rest.findIndex(isYear);
  const weightIdx = rest.findIndex(hasWeight);

  let name = '';
  let unit = '';
  let weight = '';

  if (weightIdx >= 0) weight = rest[weightIdx];

  if (yearIdx >= 0) {
    name = rest.slice(0, yearIdx).join(' ');
    const unitEnd = weightIdx >= 0 ? weightIdx : rest.length;
    unit = rest.slice(yearIdx + 1, unitEnd).join(' ');
  } else if (weightIdx >= 0) {
    name = rest[0] ?? '';
    unit = rest.slice(1, weightIdx).join(' ');
  } else {
    name = rest[0] ?? '';
    unit = rest.slice(1).join(' ');
  }

  if (!name.trim()) return null;
  return { name: name.trim(), unit: unit.trim(), weight: weight.trim() };
}

/**
 * Extract roster rows from a real tournament PDF. Each page is treated as its
 * own group: the section title above the table (e.g. "NAM NHÓM TỪ 7-9 TUỔI")
 * supplies age + gender, while each row supplies name, unit and weight class.
 */
export async function extractRowsFromPdf(
  file: File
): Promise<{ sheetName: string; rows: PdfRow[] }[]> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const sheets: { sheetName: string; rows: PdfRow[] }[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = content.items
      .map((it) => {
        const t = it as { str?: string; width?: number; transform?: number[] };
        return {
          str: (t.str ?? '').trim(),
          x: t.transform?.[4] ?? 0,
          y: t.transform?.[5] ?? 0,
          w: t.width ?? 0,
        };
      })
      .filter((it) => it.str !== '');

    const lines = groupIntoLines(items).map(groupIntoFields);

    // First data row on the page; everything above it is the title/header.
    const firstDataIdx = lines.findIndex((f) => leadingNumber(f).num && f.length >= 2);
    if (firstDataIdx === -1) continue; // blank page

    const title = lines.slice(0, firstDataIdx).flat().join(' ');
    const rows: PdfRow[] = [];
    for (let i = firstDataIdx; i < lines.length; i++) {
      const parsed = parseRow(lines[i]);
      if (parsed) {
        rows.push({
          'Họ và Tên': parsed.name,
          'Đơn vị': parsed.unit,
          'Hạng cân': parsed.weight,
        });
      }
    }
    if (rows.length > 0) sheets.push({ sheetName: title, rows });
  }

  return sheets;
}
