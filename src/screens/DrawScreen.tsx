import { useState, useRef, useCallback, useEffect, useReducer, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { RosterEntry, AthleteRecord, CategoryInfo } from '../types';
import RosterTable, { FullRosterTable } from '../components/draw/RosterTable';
import BenchPanel from '../components/draw/BenchPanel';
import Bracket from '../components/draw/Bracket';
import AddCategoryDialog from '../components/draw/AddCategoryDialog';
import {
  generateBracket,
  swapSlots,
  setSlotAthlete,
  placeAthlete,
  type BracketData,
} from '../lib/drawAlgorithm';
import {
  resolveClass,
  normalizeName,
  normalizeUnit,
  categoryKey,
  categoryLabel,
} from '../lib/normalize';
import { extractRowsFromPdf } from '../lib/pdf';
import { loadDraw, saveDraw } from '../lib/drawStorage';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { useNavigate } from 'react-router-dom';

interface Sheet {
  sheetName: string;
  rows: Record<string, string>[];
}

/**
 * What a single import actually yielded. Shown right after reading the file so a
 * class that drew no entries — and so cannot appear — is spotted immediately,
 * rather than discovered on competition day.
 */
interface ImportReport {
  fileName: string;
  sheetCount: number;
  athleteCount: number;
  classes: { label: string; count: number }[];
}

// Pick the first non-empty value among several possible column headers.
function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]);
  }
  return '';
}

// Identity of an athlete for de-duplication when importing multiple files.
function recordKey(r: {
  name: string;
  unit: string;
  category: string;
  ageGroup: string;
  gender: string;
}): string {
  return `${r.name}|${r.unit}|${r.category}|${r.ageGroup}|${r.gender}`.toLowerCase();
}

// Turn imported sheets (Excel or PDF) into normalised athlete records.
function buildRecords(sheets: Sheet[]): AthleteRecord[] {
  const out: AthleteRecord[] = [];
  for (const { sheetName, rows } of sheets) {
    for (const row of rows) {
      const name = normalizeName(
        pick(row, ['Họ và Tên', 'Họ tên', 'Họ và tên', 'Tên', 'Tên VĐV', 'Vận động viên', 'Name', 'name'])
      );
      if (!name) continue;
      const unit = normalizeUnit(
        pick(row, ['Đơn vị', 'CLB', 'Câu lạc bộ', 'Club', 'club', 'Unit', 'unit'])
      );
      const { weight, ageGroup, gender } = resolveClass({
        weightCol: pick(row, ['Hạng cân', 'Hang can', 'Cân', 'Weight', 'weight']),
        ageCol: pick(row, ['Lứa tuổi', 'Lua tuoi', 'Tuổi', 'Tuoi', 'Age', 'age']),
        genderCol: pick(row, ['Giới tính', 'Gioi tinh', 'GT', 'Gender', 'gender']),
        combined: pick(row, ['Nội dung', 'Noi dung', 'Hạng mục', 'Hang muc', 'Nội dung thi đấu']),
        sheetName,
      });
      out.push({ stt: 0, name, unit, category: weight, ageGroup, gender });
    }
  }
  return out;
}

/**
 * Rebuild the grouped weight classes from the flat roster.
 *
 * Editing an athlete's weight/age/gender changes which class they belong to, so
 * every edit re-derives the grouping. Previously-seen classes are kept even when
 * they end up empty — that preserves hand-added empty classes and any class an
 * athlete was just moved out of, which the operator can delete by hand if unwanted.
 */
function regroupCategories(
  athletes: AthleteRecord[],
  prev: CategoryInfo[]
): CategoryInfo[] {
  const map = new Map<string, CategoryInfo>();
  for (const c of prev) map.set(c.key, { ...c, athletes: [] });
  for (const a of athletes) {
    const key = categoryKey(a.category, a.ageGroup, a.gender);
    let cat = map.get(key);
    if (!cat) {
      cat = { key, label: categoryLabel(a.category, a.ageGroup, a.gender), athletes: [] };
      map.set(key, cat);
    }
    cat.athletes.push({ ...a });
  }
  return [...map.values()].map((c) => ({
    ...c,
    athletes: c.athletes.map((a, i) => ({ ...a, stt: i + 1 })),
  }));
}

// --- Undo/redo history for the brackets -------------------------------------
const HISTORY_LIMIT = 50;

// One undo step covers both the brackets and the waiting benches, so pulling a
// competitor to the bench (or dropping one back) is a single reversible action.
interface DrawSnapshot {
  brackets: Record<string, BracketData>;
  benches: Record<string, RosterEntry[]>;
}

interface BracketHistory {
  present: DrawSnapshot;
  past: DrawSnapshot[];
  future: DrawSnapshot[];
}

type BracketAction =
  | { type: 'mutate'; fn: (prev: DrawSnapshot) => DrawSnapshot }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; value: DrawSnapshot };

function bracketReducer(state: BracketHistory, action: BracketAction): BracketHistory {
  switch (action.type) {
    case 'mutate': {
      const next = action.fn(state.present);
      if (next === state.present) return state;
      return {
        present: next,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: [],
      };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        present: next,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }
    case 'reset':
      return { present: action.value, past: [], future: [] };
    default:
      return state;
  }
}

const sameAthlete = (a: RosterEntry, b: { name: string; unit: string }) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
  a.unit.trim().toLowerCase() === b.unit.trim().toLowerCase();

// Append to a bench list without duplicating.
function addToBench(list: RosterEntry[] | undefined, a: RosterEntry): RosterEntry[] {
  const cur = list ?? [];
  if (cur.some((x) => sameAthlete(x, a))) return cur;
  return [...cur, { stt: cur.length + 1, name: a.name, unit: a.unit }];
}

// Fit a rendered bracket canvas centred on the current PDF page.
function placeCanvasOnPage(pdf: jsPDF, canvas: HTMLCanvasElement): void {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const scale = Math.min(
    (pageW - margin * 2) / canvas.width,
    (pageH - margin * 2) / canvas.height
  );
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  // JPEG keeps multi-page files small; brackets are line art on white so 0.92
  // quality shows no visible artefacts.
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageW - w) / 2, margin, w, h);
}

export default function DrawScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [exporting, setExporting] = useState(false);
  const [highlightUnit, setHighlightUnit] = useState('');
  const [allAthletes, setAllAthletes] = useState<AthleteRecord[]>(
    () => loadDraw().allAthletes ?? []
  );
  const [categories, setCategories] = useState<CategoryInfo[]>(
    () => loadDraw().categories ?? []
  );
  const [activeKey, setActiveKey] = useState<string>('');
  const [bracketHist, dispatch] = useReducer(
    bracketReducer,
    undefined,
    (): BracketHistory => {
      const d = loadDraw();
      return { present: { brackets: d.brackets ?? {}, benches: d.benches ?? {} }, past: [], future: [] };
    }
  );
  const brackets = bracketHist.present.brackets;
  const benches = bracketHist.present.benches;
  const bench = benches[activeKey] ?? [];
  const canUndo = bracketHist.past.length > 0;
  const canRedo = bracketHist.future.length > 0;
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const bracketData = brackets[activeKey] ?? null;
  const [editingRoster, setEditingRoster] = useState<RosterEntry[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingAll, setEditingAll] = useState(false);
  const [fileName, setFileName] = useState(() => loadDraw().fileName ?? '');
  const [showAll, setShowAll] = useState(true);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);

  // Offer the values the file already uses, so a hand-added class groups with
  // the imported ones instead of forming a near-duplicate.
  const weightOptions = useMemo(() => {
    const seen = [...new Set(allAthletes.map((a) => a.category).filter(Boolean))];
    const num = (w: string) => parseInt(w, 10) || 0;
    return seen.sort((a, b) => num(a) - num(b) || a.localeCompare(b, 'vi'));
  }, [allAthletes]);

  const ageOptions = useMemo(() => {
    const seen = [...new Set(allAthletes.map((a) => a.ageGroup).filter(Boolean))];
    return seen.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
  }, [allAthletes]);

  const existingKeys = useMemo(() => new Set(categories.map((c) => c.key)), [categories]);

  // Mirror the whole draw to localStorage (debounced) whenever it changes.
  useEffect(() => {
    const t = setTimeout(
      () => saveDraw({ allAthletes, categories, brackets, benches, fileName }),
      300
    );
    return () => clearTimeout(t);
  }, [allAthletes, categories, brackets, benches, fileName]);

  // Keyboard shortcuts for undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'undo' });
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const currentCategory = categories.find((c) => c.key === activeKey);
  const catIndex = categories.findIndex((c) => c.key === activeKey);
  const drawnCount = Object.keys(brackets).length;

  // Shared ingest for both Excel and PDF: normalise each row and group by class.
  // Merge imported records into the existing roster (append + de-duplicate) so a
  // user can add multiple Excel/PDF files that accumulate rather than overwrite.
  // Returns what was read, so the operator can check it against the programme.
  const ingestSheets = useCallback((sheets: Sheet[], fileLabel: string): ImportReport | null => {
    const incoming = buildRecords(sheets);
    if (incoming.length === 0) return null;

    setAllAthletes((prev) => {
      const seen = new Set(prev.map(recordKey));
      const merged = [...prev];
      for (const r of incoming) {
        const k = recordKey(r);
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(r);
        }
      }
      return merged.map((r, i) => ({ ...r, stt: i + 1 }));
    });

    setCategories((prev) => {
      const map = new Map<string, CategoryInfo>(
        prev.map((c) => [c.key, { ...c, athletes: [...c.athletes] }])
      );
      for (const r of incoming) {
        const key = categoryKey(r.category, r.ageGroup, r.gender);
        let cat = map.get(key);
        if (!cat) {
          cat = { key, label: categoryLabel(r.category, r.ageGroup, r.gender), athletes: [] };
          map.set(key, cat);
        }
        if (!cat.athletes.some((a) => recordKey(a) === recordKey(r))) {
          cat.athletes.push({ ...r });
        }
      }
      const list = [...map.values()];
      list.sort((a, b) => a.label.localeCompare(b.label));
      for (const c of list) c.athletes = c.athletes.map((a, i) => ({ ...a, stt: i + 1 }));
      return list;
    });

    setShowAll(true);

    // Report on this file alone, not the accumulated roster.
    const perClass = new Map<string, number>();
    for (const r of incoming) {
      const label = categoryLabel(r.category, r.ageGroup, r.gender);
      perClass.set(label, (perClass.get(label) ?? 0) + 1);
    }
    return {
      fileName: fileLabel,
      sheetCount: sheets.filter((s) => s.rows.length > 0).length,
      athleteCount: incoming.length,
      classes: [...perClass.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    };
  }, []);

  // Keep a valid category selected as categories change (after imports/deletes).
  useEffect(() => {
    if (categories.length === 0) {
      if (activeKey) setActiveKey('');
      return;
    }
    if (!categories.some((c) => c.key === activeKey)) {
      const first = categories[0];
      setActiveKey(first.key);
      setEditingRoster(first.athletes.map((a, i) => ({ stt: i + 1, name: a.name, unit: a.unit })));
    }
  }, [categories, activeKey]);

  const handleClearAll = useCallback(() => {
    if (!confirm('Xóa toàn bộ danh sách đã import?')) return;
    setAllAthletes([]);
    setCategories([]);
    setActiveKey('');
    setEditingRoster([]);
    dispatch({ type: 'reset', value: { brackets: {}, benches: {} } });
    setFileName('');
  }, []);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        let sheets: Sheet[];
        if (/\.pdf$/i.test(file.name)) {
          sheets = await extractRowsFromPdf(file);
        } else {
          const data = await file.arrayBuffer();
          const workbook = XLSX.read(data, { type: 'array' });
          sheets = workbook.SheetNames.map((sn) => ({
            sheetName: sn,
            rows: XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sn], {
              defval: '',
            }),
          }));
        }
        const report = ingestSheets(sheets, file.name);
        // Accumulate imported file names.
        setFileName((prev) => (prev ? `${prev}, ${file.name}` : file.name));
        if (!report) alert('Không tìm thấy VĐV trong file này.');
        else setImportReport(report);
      } catch (err) {
        console.error(err);
        alert('Không đọc được file. Vui lòng kiểm tra định dạng (Excel / CSV / PDF).');
      }
      e.target.value = ''; // allow re-importing the same file
    },
    [ingestSheets]
  );

  const handleSelectCategory = useCallback(
    (key: string) => {
      setActiveKey(key); // keep drawn brackets so the pager can switch between them
      const cat = categories.find((c) => c.key === key);
      if (cat) {
        setEditingRoster(cat.athletes.map((a, i) => ({ stt: i + 1, name: a.name, unit: a.unit })));
      }
    },
    [categories]
  );

  // Move to the previous/next weight class (pager).
  const gotoCategory = useCallback(
    (delta: number) => {
      const n = categories.length;
      if (n === 0) return;
      const i = categories.findIndex((c) => c.key === activeKey);
      const next = (((i < 0 ? 0 : i) + delta) % n + n) % n;
      handleSelectCategory(categories[next].key);
    },
    [categories, activeKey, handleSelectCategory]
  );

  const handleUpdateRow = useCallback(
    (stt: number, patch: Partial<RosterEntry>) => {
      setEditingRoster((rs) => rs.map((r) => (r.stt === stt ? { ...r, ...patch } : r)));
    },
    []
  );

  const handleAddRow = useCallback(() => {
    setEditingRoster((rs) => [...rs, { stt: rs.length + 1, name: '', unit: '' }]);
  }, []);

  const handleRemoveEmpty = useCallback(() => {
    setEditingRoster((rs) => {
      const filtered = rs.filter((r) => r.name.trim() !== '');
      return filtered.map((r, i) => ({ ...r, stt: i + 1 }));
    });
  }, []);

  const handleSaveRoster = useCallback(() => {
    const cleaned = editingRoster
      .filter((r) => r.name.trim() !== '')
      .map((r, i) => ({ ...r, stt: i + 1 }));

    if (currentCategory) {
      setCategories((cats) =>
        cats.map((c) =>
          c.key === activeKey
            ? {
                ...c,
                athletes: cleaned.map((r, i) => ({
                  stt: i + 1,
                  name: r.name,
                  unit: r.unit,
                  category: currentCategory.athletes[0]?.category || '',
                  ageGroup: currentCategory.athletes[0]?.ageGroup || '',
                  gender: currentCategory.athletes[0]?.gender || '',
                })),
              }
            : c
        )
      );
    }
    setEditingRoster(cleaned);
    setIsEditing(false);
  }, [editingRoster, currentCategory, activeKey]);

  // Manually swap two athletes in the current class's bracket.
  const handleSwap = useCallback(
    (posA: number, posB: number) => {
      dispatch({
        type: 'mutate',
        fn: (s) => {
          const cur = s.brackets[activeKey];
          if (!cur) return s;
          return { ...s, brackets: { ...s.brackets, [activeKey]: swapSlots(cur, posA, posB) } };
        },
      });
    },
    [activeKey]
  );

  // Remove an athlete from a slot → move them to the waiting bench.
  const handleClearSlot = useCallback(
    (pos: number) => {
      dispatch({
        type: 'mutate',
        fn: (s) => {
          const cur = s.brackets[activeKey];
          if (!cur) return s;
          const removed = cur.slots.find((sl) => sl.position === pos)?.athlete ?? null;
          return {
            brackets: { ...s.brackets, [activeKey]: setSlotAthlete(cur, pos, null) },
            benches: removed
              ? { ...s.benches, [activeKey]: addToBench(s.benches[activeKey], removed) }
              : s.benches,
          };
        },
      });
    },
    [activeKey]
  );

  // Edit / add an athlete's name + unit in a slot (inline edit).
  const handleSetSlot = useCallback(
    (pos: number, name: string, unit: string) => {
      dispatch({
        type: 'mutate',
        fn: (s) => {
          const cur = s.brackets[activeKey];
          if (!cur) return s;
          const athlete = name.trim() ? { stt: pos, name: name.trim(), unit: unit.trim() } : null;
          return { ...s, brackets: { ...s.brackets, [activeKey]: setSlotAthlete(cur, pos, athlete) } };
        },
      });
    },
    [activeKey]
  );

  // Drop an athlete (from the roster table or the bench) onto a slot: place them,
  // remove them from the bench, and push any displaced occupant to the bench.
  const handleDropAthlete = useCallback(
    (pos: number, name: string, unit: string) => {
      if (!name.trim()) return;
      dispatch({
        type: 'mutate',
        fn: (s) => {
          const cur = s.brackets[activeKey];
          if (!cur) return s;
          const athlete = { stt: pos, name: name.trim(), unit: unit.trim() };
          const occupant = cur.slots.find((sl) => sl.position === pos)?.athlete ?? null;
          let list = (s.benches[activeKey] ?? []).filter((a) => !sameAthlete(a, athlete));
          if (occupant && !sameAthlete(occupant, athlete)) list = addToBench(list, occupant);
          return {
            brackets: { ...s.brackets, [activeKey]: placeAthlete(cur, pos, athlete) },
            benches: { ...s.benches, [activeKey]: list },
          };
        },
      });
    },
    [activeKey]
  );

  // Pull an athlete out of the bracket to the bench by their slot position.
  const handleBenchDrop = useCallback(
    (pos: number) => handleClearSlot(pos),
    [handleClearSlot]
  );

  // Permanently remove an athlete from the bench.
  const handleBenchRemove = useCallback(
    (name: string, unit: string) => {
      dispatch({
        type: 'mutate',
        fn: (s) => ({
          ...s,
          benches: {
            ...s.benches,
            [activeKey]: (s.benches[activeKey] ?? []).filter(
              (a) => !sameAthlete(a, { name, unit })
            ),
          },
        }),
      });
    },
    [activeKey]
  );

  // Re-draw just the current class (uses any in-progress edits).
  const handleDrawOne = useCallback(() => {
    if (!currentCategory) return;
    const cleaned = editingRoster
      .filter((r) => r.name.trim() !== '')
      .map((r, i) => ({ ...r, stt: i + 1 }));
    if (cleaned.length < 2) {
      alert('Hạng cân cần ít nhất 2 VĐV để bốc thăm.');
      return;
    }
    const data = generateBracket(cleaned, currentCategory.label);
    dispatch({
      type: 'mutate',
      fn: (s) => ({
        brackets: { ...s.brackets, [activeKey]: data },
        benches: { ...s.benches, [activeKey]: [] },
      }),
    });
  }, [currentCategory, editingRoster, activeKey]);

  // Draw every weight class at once; the pager then flips through them.
  const handleDrawAll = useCallback(() => {
    const next: Record<string, BracketData> = {};
    let skipped = 0;
    for (const c of categories) {
      const roster = c.athletes
        .filter((a) => a.name.trim() !== '')
        .map((a, i) => ({ stt: i + 1, name: a.name, unit: a.unit }));
      if (roster.length >= 2) next[c.key] = generateBracket(roster, c.label);
      else skipped++;
    }
    dispatch({ type: 'mutate', fn: () => ({ brackets: next, benches: {} }) });
    const firstDrawn = categories.find((c) => next[c.key]);
    if (firstDrawn) {
      setActiveKey(firstDrawn.key);
      setShowAll(false);
      setIsEditing(false);
    }
    if (Object.keys(next).length === 0) {
      alert('Không có hạng cân nào đủ 2 VĐV để bốc thăm.');
    } else if (skipped > 0) {
      alert(`Đã bốc ${Object.keys(next).length} hạng. Bỏ qua ${skipped} hạng dưới 2 VĐV.`);
    }
  }, [categories]);

  // Render the current bracket to a PDF (browser fonts → Vietnamese OK).
  // Uses the off-screen, non-interactive copy so editing affordances (the dashed
  // "Thăm trống" drop-zones) never reach the printed sheet.
  const handleExportPdf = useCallback(async () => {
    const node = exportRefs.current[activeKey];
    if (!node || !bracketData) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
      placeCanvasOnPage(pdf, canvas);
      const safe = bracketData.category.replace(/[^\p{L}\p{N}\s-]/gu, '').trim() || 'so-do';
      pdf.save(`${safe}.pdf`);
    } catch (e) {
      alert('Xuất PDF thất bại: ' + (e instanceof Error ? e.message : 'Lỗi không xác định'));
    } finally {
      setExporting(false);
    }
  }, [bracketData, activeKey]);

  // Export every drawn class into one multi-page PDF.
  const handleExportAllPdf = useCallback(async () => {
    const keys = categories.filter((c) => brackets[c.key]).map((c) => c.key);
    if (keys.length === 0) return;
    setExporting(true);
    try {
      let pdf: jsPDF | null = null;
      for (const key of keys) {
        const node = exportRefs.current[key];
        if (!node) continue;
        const canvas = await html2canvas(node, { scale: 1.5, backgroundColor: '#ffffff' });
        const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
        if (!pdf) pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
        else pdf.addPage('a4', orientation);
        placeCanvasOnPage(pdf, canvas);
      }
      if (pdf) pdf.save('so-do-tat-ca-hang-can.pdf');
    } catch (e) {
      alert('Xuất tất cả PDF thất bại: ' + (e instanceof Error ? e.message : 'Lỗi không xác định'));
    } finally {
      setExporting(false);
    }
  }, [categories, brackets]);

  // Open an empty class picked from the dialog. Values come from the roster's own
  // vocabulary, so the key matches an imported class exactly if one appears later.
  const handleAddCategory = useCallback(
    (weight: string, age: string, gender: string) => {
      const key = categoryKey(weight, age, gender);
      if (categories.some((c) => c.key === key)) return;
      const label = categoryLabel(weight, age, gender);
      const newCat: CategoryInfo = { key, label, athletes: [] };
      setCategories((cats) =>
        [...cats, newCat].sort((a, b) => a.label.localeCompare(b.label, 'vi'))
      );
      setActiveKey(key);
      setEditingRoster([]);
    },
    [categories]
  );

  const handleDeleteCategory = useCallback(
    (key: string) => {
      const cat = categories.find((c) => c.key === key);
      if (!cat || !confirm(`Xóa hạng cân "${cat.label}" (${cat.athletes.length} VĐV)?`)) return;
      setCategories((cats) => cats.filter((c) => c.key !== key));
      // Drop the class's athletes from the master roster too, so the total and
      // the all-athletes list stay in step with what's left.
      setAllAthletes((prev) =>
        prev
          .filter((a) => categoryKey(a.category, a.ageGroup, a.gender) !== key)
          .map((r, i) => ({ ...r, stt: i + 1 }))
      );
      dispatch({
        type: 'mutate',
        fn: (s) => {
          const { [key]: _rb, ...restBrackets } = s.brackets;
          const { [key]: _bn, ...restBenches } = s.benches;
          return { brackets: restBrackets, benches: restBenches };
        },
      });
      if (activeKey === key) {
        setActiveKey(categories.length > 1 ? categories.find((c) => c.key !== key)!.key : '');
        setEditingRoster([]);
      }
    },
    [categories, activeKey]
  );

  // Edit any field of an athlete in the master list. Changing weight/age/gender
  // re-groups the classes, moving the athlete to (or creating) the right one.
  const handleEditAthlete = useCallback(
    (index: number, patch: Partial<AthleteRecord>) => {
      const next = allAthletes.map((a, i) => (i === index ? { ...a, ...patch } : a));
      setAllAthletes(next);
      setCategories((cats) => regroupCategories(next, cats));
    },
    [allAthletes]
  );

  // Remove one athlete from both the master roster and their weight class — used
  // to tidy the imported list before weigh-in (a no-show, a wrong entry).
  const handleDeleteAthlete = useCallback((rec: AthleteRecord) => {
    const rk = recordKey(rec);
    if (!confirm(`Xóa VĐV "${rec.name}" (${rec.unit}) khỏi danh sách?`)) return;
    setAllAthletes((prev) =>
      prev.filter((a) => recordKey(a) !== rk).map((r, i) => ({ ...r, stt: i + 1 }))
    );
    setCategories((prev) =>
      prev.map((c) => ({
        ...c,
        athletes: c.athletes
          .filter((a) => recordKey(a) !== rk)
          .map((a, i) => ({ ...a, stt: i + 1 })),
      }))
    );
  }, []);

  return (
    <div className="relative min-h-full w-full bg-white p-6 text-black">
      <button
        onClick={() => navigate('/')}
        className="absolute right-4 top-4 rounded bg-black/10 px-4 py-2 text-sm font-semibold hover:bg-black/20"
      >
        ← Menu
      </button>

      <h1 className="mb-6 text-3xl font-bold">Bốc thăm thi đấu</h1>

      <AddCategoryDialog
        open={addingCategory}
        onClose={() => setAddingCategory(false)}
        onAdd={handleAddCategory}
        weightOptions={weightOptions}
        ageOptions={ageOptions}
        existingKeys={existingKeys}
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf"
          onChange={handleImportFile}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Thêm file Excel / PDF
        </button>
        <button
          onClick={() => setAddingCategory(true)}
          className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          + Thêm hạng cân
        </button>
        {categories.length > 0 && (
          <button
            onClick={handleDrawAll}
            className="rounded bg-red-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-red-700"
          >
            🎲 BỐC THĂM TẤT CẢ
          </button>
        )}
        {allAthletes.length > 0 && (
          <button
            onClick={handleClearAll}
            className="rounded bg-red-100 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-200"
          >
            Xóa hết
          </button>
        )}
        <button
          onClick={() => setShowAll(!showAll)}
          className={`rounded px-4 py-2 text-sm font-semibold ${
            showAll ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {showAll ? 'Tất cả VĐV' : 'Theo hạng cân'}
        </button>
        {fileName && (
          <span className="text-sm text-gray-500">
            File ({allAthletes.length} VĐV): {fileName}
          </span>
        )}
      </div>

      {/* What the last import actually read — check it against the programme. */}
      {importReport && (
        <div className="mb-4 rounded-lg border-2 border-blue-200 bg-blue-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-blue-900">
                Đã đọc “{importReport.fileName}”
              </h2>
              <p className="text-sm text-blue-800">
                {importReport.sheetCount} trang/sheet có dữ liệu ·{' '}
                <b>{importReport.classes.length} hạng cân</b> ·{' '}
                <b>{importReport.athleteCount} VĐV</b>
              </p>
              <p className="mt-1 text-xs text-blue-700">
                Đối chiếu với thể lệ giải. Hạng cân không ai đăng ký sẽ không có ở
                đây — dùng <b>“+ Thêm hạng cân”</b> để mở hạng trống.
              </p>
            </div>
            <button
              onClick={() => setImportReport(null)}
              className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              Đóng ✕
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {importReport.classes.map((c) => (
              <span
                key={c.label}
                className="rounded border border-blue-300 bg-white px-2 py-0.5 text-xs font-medium"
              >
                {c.label} <span className="text-gray-500">({c.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Category selector + actions */}
      {categories.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-gray-600">Hạng cân:</label>
          <select
            value={activeKey}
            onChange={(e) => handleSelectCategory(e.target.value)}
            className="rounded border-2 border-gray-300 bg-white px-4 py-2 pr-8 text-sm font-medium shadow-sm focus:border-yellow-400 focus:outline-none"
          >
            {categories.map((cat) => (
              <option key={cat.key} value={cat.key}>
                {cat.label} ({cat.athletes.length} VĐV)
              </option>
            ))}
          </select>
          {activeKey && (
            <>
              <button
                onClick={() => handleDeleteCategory(activeKey)}
                className="rounded bg-red-100 px-2 py-2 text-xs text-red-600 hover:bg-red-200"
              >
                ✕
              </button>
              <span className="mx-2 h-6 w-px bg-gray-300" />
              <span className="text-sm text-gray-500">
                {editingRoster.filter((r) => r.name.trim() !== '').length} VĐV
              </span>
              <button
                onClick={handleDrawOne}
                className="rounded bg-red-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-red-700"
              >
                🎲 Bốc lại hạng này
              </button>
            </>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-wrap gap-8">
        {/* Left: Roster */}
        <div className="min-w-[360px] max-w-[600px] flex-1">
          {showAll && allAthletes.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">
                  Danh sách tất cả VĐV ({allAthletes.length})
                </h3>
                <button
                  onClick={() => setEditingAll((v) => !v)}
                  className={`rounded px-3 py-1 text-xs font-semibold ${
                    editingAll
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-600 text-white hover:bg-gray-700'
                  }`}
                >
                  {editingAll ? '✓ Xong' : '✎ Sửa thông tin'}
                </button>
              </div>
              {editingAll && (
                <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  Sửa trực tiếp trong ô. Đổi <b>hạng cân / lứa tuổi / giới tính</b> sẽ tự
                  chuyển VĐV sang hạng đúng.
                </p>
              )}

              {/* Manage the imported classes before drawing: remove ones that
                  won't run yet (weigh-in pending). Deleting a class drops its
                  athletes from the list too. */}
              {categories.length > 0 && (
                <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="mb-2 text-sm font-semibold text-gray-600">
                    Hạng cân đã import ({categories.length}) — bấm ✕ để xóa hạng chưa cần
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <span
                        key={c.key}
                        className="flex items-center gap-1.5 rounded border border-gray-300 bg-white py-1 pl-2.5 pr-1 text-sm"
                      >
                        <span className="font-medium">{c.label}</span>
                        <span className="text-xs text-gray-500">({c.athletes.length})</span>
                        <button
                          onClick={() => handleDeleteCategory(c.key)}
                          className="grid h-5 w-5 place-items-center rounded bg-red-100 text-xs font-bold text-red-600 hover:bg-red-200"
                          title={`Xóa hạng cân ${c.label}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <FullRosterTable
                rows={allAthletes}
                onDelete={handleDeleteAthlete}
                editable={editingAll}
                onEdit={handleEditAthlete}
              />
            </div>
          ) : activeKey ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Danh sách VĐV - {currentCategory?.label || ''}
                </h3>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleAddRow}
                        className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600"
                      >
                        + Thêm
                      </button>
                      <button
                        onClick={handleRemoveEmpty}
                        className="rounded bg-orange-500 px-3 py-1 text-xs text-white hover:bg-orange-600"
                      >
                        Xóa trống
                      </button>
                      <button
                        onClick={handleSaveRoster}
                        className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
                      >
                        Lưu
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="rounded bg-gray-600 px-3 py-1 text-xs text-white hover:bg-gray-700"
                    >
                      Sửa
                    </button>
                  )}
                </div>
              </div>

              <RosterTable
                rows={editingRoster}
                onChange={handleUpdateRow}
                editable={isEditing}
                draggable
              />
            </div>
          ) : (
            <div className="rounded border-2 border-dashed border-gray-300 p-8 text-center text-gray-400">
              {allAthletes.length === 0
                ? 'Import file Excel để bắt đầu'
                : 'Chọn một hạng cân để xem danh sách'}
            </div>
          )}
        </div>

        {/* Right: Bracket + pager */}
        <div className="min-w-[500px] flex-1">
          {drawnCount > 0 && categories.length > 0 && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded bg-gray-100 px-3 py-2">
              <button
                onClick={() => gotoCategory(-1)}
                className="rounded bg-white px-3 py-1.5 text-sm font-semibold shadow hover:bg-gray-50"
              >
                ‹ Trước
              </button>
              <div className="text-center text-sm leading-tight">
                <div className="font-bold">{currentCategory?.label}</div>
                <div className="text-gray-500">
                  Hạng {catIndex + 1}/{categories.length} · Đã bốc {drawnCount}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  title="Hoàn tác (Ctrl+Z)"
                  className="rounded bg-white px-3 py-1.5 text-sm font-semibold shadow hover:bg-gray-50 disabled:opacity-40"
                >
                  ↶ Hoàn tác
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  title="Làm lại (Ctrl+Y)"
                  className="rounded bg-white px-3 py-1.5 text-sm font-semibold shadow hover:bg-gray-50 disabled:opacity-40"
                >
                  ↷ Làm lại
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={!bracketData || exporting}
                  className="rounded bg-gray-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
                >
                  ⬇ Xuất PDF hạng này
                </button>
                <button
                  onClick={handleExportAllPdf}
                  disabled={exporting}
                  className="rounded bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-40"
                >
                  {exporting ? 'Đang xuất…' : `⬇ Xuất tất cả PDF (${drawnCount})`}
                </button>
                <button
                  onClick={() => gotoCategory(1)}
                  className="rounded bg-white px-3 py-1.5 text-sm font-semibold shadow hover:bg-gray-50"
                >
                  Tiếp ›
                </button>
              </div>
            </div>
          )}

          {bracketData ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <p className="text-sm text-gray-500">
                  💡 <b>Kéo VĐV từ danh sách</b> vào ô · <b>kéo-thả</b> trong sơ đồ để đổi chỗ ·{' '}
                  <b>nhấp đúp</b> để sửa tên · di chuột hiện nút <b>×</b> để xóa · <b>Ctrl+Z</b> hoàn tác
                </p>
                <label className="flex items-center gap-1 text-sm text-gray-600">
                  Tô vàng đơn vị:
                  <input
                    value={highlightUnit}
                    onChange={(e) => setHighlightUnit(e.target.value)}
                    placeholder="VD: Phường Duyên Hải"
                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
              </div>
              <BenchPanel
                bench={bench}
                onDropFromBracket={handleBenchDrop}
                onRemove={handleBenchRemove}
              />
              <div className="overflow-x-auto bg-white p-4">
                <div className="mb-2 bg-gray-700 px-3 py-1.5 text-sm font-bold uppercase text-white">
                  {bracketData.category}
                </div>
                <Bracket
                  data={bracketData}
                  onSwapSlots={handleSwap}
                  onClearSlot={handleClearSlot}
                  onSetSlot={handleSetSlot}
                  onDropAthlete={handleDropAthlete}
                  highlightUnit={highlightUnit}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded border-2 border-dashed border-gray-300 px-4 text-center text-gray-400">
              {categories.length === 0
                ? 'Import file để bắt đầu'
                : drawnCount > 0
                  ? 'Hạng này chưa bốc (dưới 2 VĐV). Dùng ‹ › để xem hạng khác.'
                  : 'Nhấn "🎲 BỐC THĂM TẤT CẢ" để tạo sơ đồ cho mọi hạng cân.'}
            </div>
          )}
        </div>
      </div>

      {/* Off-screen render of every drawn bracket, used by "Xuất tất cả PDF". */}
      <div aria-hidden className="pointer-events-none fixed left-0" style={{ top: '100vh', zIndex: -1 }}>
        {categories
          .filter((c) => brackets[c.key])
          .map((c) => (
            <div
              key={c.key}
              ref={(el) => {
                exportRefs.current[c.key] = el;
              }}
              className="bg-white p-4"
            >
              <div className="mb-2 bg-gray-700 px-3 py-1.5 text-sm font-bold uppercase text-white">
                {brackets[c.key].category}
              </div>
              <Bracket data={brackets[c.key]} highlightUnit={highlightUnit} />
            </div>
          ))}
      </div>
    </div>
  );
}
