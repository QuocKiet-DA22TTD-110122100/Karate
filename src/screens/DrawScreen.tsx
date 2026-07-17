import { useState, useRef, useCallback, useEffect, useReducer, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { RosterEntry, AthleteRecord, CategoryInfo } from '../types';
import RosterTable, { FullRosterTable } from '../components/draw/RosterTable';
import BenchPanel from '../components/draw/BenchPanel';
import Bracket from '../components/draw/Bracket';
import AddCategoryDialog from '../components/draw/AddCategoryDialog';
import CategoryCards from '../components/draw/CategoryCards';
import CloudSyncDialog from '../components/draw/CloudSyncDialog';
import {
  generateBracket,
  swapSlots,
  setSlotAthlete,
  placeAthlete,
  buildBracketFromSlots,
  bracketSize,
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
import { loadDraw, saveDraw, type DrawState } from '../lib/drawStorage';
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
  // Classes whose brackets were built straight from the file's lot numbers.
  drawnClasses: string[];
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
      // A pre-drawn file carries each athlete's lot number (bracket position).
      const lotRaw = pick(row, [
        'Số thăm', 'Số Thăm', 'SỐ THĂM', 'So tham', 'Thăm', 'Tham', 'Thăm số',
        'Vị trí', 'Vi tri', 'Vị trí thăm', 'Lot', 'lot', 'Slot', 'slot', 'Draw',
      ]);
      const lotMatch = lotRaw.match(/\d+/);
      const lot = lotMatch ? parseInt(lotMatch[0], 10) : 0;
      out.push({ stt: 0, name, unit, category: weight, ageGroup, gender, ...(lot > 0 ? { lot } : {}) });
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
  const [allAthletes, setAllAthletes] = useState<AthleteRecord[]>(
    () => loadDraw().allAthletes ?? []
  );
  const [categories, setCategories] = useState<CategoryInfo[]>(
    () => loadDraw().categories ?? []
  );
  // VĐV của các hạng cân đã xóa — giữ lại để khôi phục, không mất ai.
  const [unassigned, setUnassigned] = useState<AthleteRecord[]>(
    () => loadDraw().unassigned ?? []
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
  const [cloudOpen, setCloudOpen] = useState(false);

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
      () => saveDraw({ allAthletes, categories, brackets, benches, unassigned, fileName }),
      300
    );
    return () => clearTimeout(t);
  }, [allAthletes, categories, brackets, benches, unassigned, fileName]);

  // Keyboard shortcuts for undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y).
  // Ignored while typing in a field — there Ctrl+Z must stay the text undo,
  // not silently rewind the bracket.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      ) {
        return;
      }
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
  const drawnKeys = useMemo(() => new Set(Object.keys(brackets)), [brackets]);

  // Shared ingest for both Excel and PDF: normalise each row and group by class.
  // Merge imported records into the existing roster (append + de-duplicate) so a
  // user can add multiple Excel/PDF files that accumulate rather than overwrite.
  // Returns what was read, so the operator can check it against the programme.
  const ingestSheets = useCallback((sheets: Sheet[], fileLabel: string): ImportReport | null => {
    const incoming = buildRecords(sheets);
    if (incoming.length === 0) return null;

    // Ai có mặt trong file import thì rời khỏi chỗ "chưa xếp hạng" — import lại
    // file cũ sẽ đưa họ về hạng cân bình thường, không nằm hai nơi cùng lúc.
    const incomingKeys = new Set(incoming.map(recordKey));
    setUnassigned((prev) => prev.filter((u) => !incomingKeys.has(recordKey(u))));

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

    // Classes where the file already carries lot numbers were drawn elsewhere
    // (technical meeting, another tool): build their brackets straight from the
    // file instead of asking the operator to re-randomise. Rows of such a class
    // that lack a lot number go to the bench so the omission is visible.
    const lottedKeys = new Set<string>();
    for (const r of incoming) {
      if (r.lot && r.lot >= 1) lottedKeys.add(categoryKey(r.category, r.ageGroup, r.gender));
    }
    const drawnClasses: string[] = [];
    if (lottedKeys.size > 0) {
      const byClass = new Map<string, { label: string; entries: AthleteRecord[] }>();
      for (const r of incoming) {
        const key = categoryKey(r.category, r.ageGroup, r.gender);
        if (!lottedKeys.has(key)) continue;
        let g = byClass.get(key);
        if (!g) {
          g = { label: categoryLabel(r.category, r.ageGroup, r.gender), entries: [] };
          byClass.set(key, g);
        }
        g.entries.push(r);
      }
      const newBrackets: Record<string, BracketData> = {};
      const newBenches: Record<string, RosterEntry[]> = {};
      for (const [key, { label, entries }] of byClass) {
        const maxLot = Math.max(...entries.map((e) => e.lot ?? 0));
        const size = Math.max(bracketSize(entries.length), bracketSize(maxLot));
        const byLot = new Map<number, RosterEntry>();
        const bench: RosterEntry[] = [];
        for (const e of entries) {
          // Duplicate or missing lots land on the bench for the operator to place.
          if (e.lot && e.lot >= 1 && e.lot <= size && !byLot.has(e.lot)) {
            byLot.set(e.lot, { stt: e.lot, name: e.name, unit: e.unit });
          } else {
            bench.push({ stt: bench.length + 1, name: e.name, unit: e.unit });
          }
        }
        const slots = Array.from({ length: size }, (_, i) => ({
          position: i + 1,
          athlete: byLot.get(i + 1) ?? null,
        }));
        newBrackets[key] = buildBracketFromSlots(slots, label);
        newBenches[key] = bench;
        drawnClasses.push(label);
      }
      dispatch({
        type: 'mutate',
        fn: (s) => ({
          brackets: { ...s.brackets, ...newBrackets },
          benches: { ...s.benches, ...newBenches },
        }),
      });
      drawnClasses.sort((a, b) => a.localeCompare(b, 'vi'));
    }

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
      drawnClasses,
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
    setUnassigned([]);
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
          const extracted = await extractRowsFromPdf(file);
          if (!extracted.hadText) {
            alert(
              'PDF này chỉ chứa hình ảnh (ví dụ: file sơ đồ do app xuất ra) nên không đọc được chữ.\n' +
                'Hãy import file Excel/CSV. Nếu đã bốc thăm, dùng nút "⬇ Xuất Excel kèm số thăm" để tạo file import lại được.'
            );
            e.target.value = '';
            return;
          }
          sheets = extracted.sheets;
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
      // Class identity comes from the key, not from the first athlete — a
      // hand-opened empty class has nobody to copy it from.
      const [weight = '', ageGroup = '', gender = ''] = activeKey.split('|');
      const toRecord = (r: RosterEntry, i: number): AthleteRecord => ({
        stt: i + 1,
        name: r.name,
        unit: r.unit,
        category: weight,
        ageGroup,
        gender,
      });
      setCategories((cats) =>
        cats.map((c) =>
          c.key === activeKey ? { ...c, athletes: cleaned.map(toRecord) } : c
        )
      );
      // Mirror into the master roster too. Without this, a hand-added athlete
      // exists only inside the class — the totals disagree, and the next
      // regroupCategories (rebuilt from allAthletes) silently drops them.
      setAllAthletes((prev) => {
        const others = prev.filter(
          (a) => categoryKey(a.category, a.ageGroup, a.gender) !== activeKey
        );
        return [...others, ...cleaned.map(toRecord)].map((r, i) => ({ ...r, stt: i + 1 }));
      });
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
  // Draw one class straight from its own roster — used by the class cards, so it
  // doesn't depend on which class is currently selected/edited.
  const drawCategoryByKey = useCallback(
    (key: string) => {
      const cat = categories.find((c) => c.key === key);
      if (!cat) return;
      const cleaned = cat.athletes
        .filter((a) => a.name.trim() !== '')
        .map((r, i) => ({ stt: i + 1, name: r.name, unit: r.unit }));
      if (cleaned.length < 2) {
        alert(`Hạng "${cat.label}" cần ít nhất 2 VĐV để bốc thăm.`);
        return;
      }
      const data = generateBracket(cleaned, cat.label);
      dispatch({
        type: 'mutate',
        fn: (s) => ({
          brackets: { ...s.brackets, [key]: data },
          benches: { ...s.benches, [key]: [] },
        }),
      });
      handleSelectCategory(key);
      setShowAll(false);
    },
    [categories, handleSelectCategory]
  );

  // Draw every weight class at once; the pager then flips through them.
  const handleDrawAll = useCallback(() => {
    // Re-drawing replaces every existing bracket — including ones imported from
    // a pre-drawn file — so make sure that's really what the operator wants.
    if (
      Object.keys(brackets).length > 0 &&
      !confirm('Bốc thăm lại sẽ thay thế TẤT CẢ sơ đồ hiện có (kể cả sơ đồ import từ file đã bốc thăm). Tiếp tục?')
    ) {
      return;
    }
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
  }, [categories, brackets]);

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

  // Export the whole draw to one Excel sheet, with each athlete's lot number
  // (số thăm) where a bracket exists. Unlike the PDF export (images only), this
  // file re-imports as-is and rebuilds the same brackets — the official record.
  const handleExportExcel = useCallback(() => {
    const rows: Record<string, string | number>[] = [];
    // Trimmed like sameAthlete, so a stray space can't cost someone their lot.
    const idKey = (name: string, unit: string) => `${name.trim()}|${unit.trim()}`.toLowerCase();
    for (const c of categories) {
      const br = brackets[c.key];
      const lotMap = new Map<string, number | ''>();
      // People the brackets know but the roster doesn't — typed straight into a
      // slot. The printed draw shows them, so the export must too.
      const extras = new Map<string, RosterEntry>();
      if (br) {
        for (const s of br.slots) {
          if (s.athlete) {
            const key = idKey(s.athlete.name, s.athlete.unit);
            lotMap.set(key, s.position);
            extras.set(key, s.athlete);
          }
        }
        for (const a of benches[c.key] ?? []) {
          const key = idKey(a.name, a.unit);
          if (!lotMap.has(key)) lotMap.set(key, '');
          if (!extras.has(key)) extras.set(key, a);
        }
      }
      for (const a of c.athletes) {
        const key = idKey(a.name, a.unit);
        extras.delete(key);
        const lot = lotMap.get(key);
        rows.push({
          'Họ và tên': a.name,
          'Đơn vị': a.unit,
          'Hạng cân': c.label,
          'Số thăm': lot === undefined ? '' : lot,
        });
      }
      for (const [key, a] of extras) {
        rows.push({
          'Họ và tên': a.name,
          'Đơn vị': a.unit,
          'Hạng cân': c.label,
          'Số thăm': lotMap.get(key) ?? '',
        });
      }
    }
    if (rows.length === 0) return;
    const numbered = rows.map((r, i) => ({ STT: i + 1, ...r }));
    const ws = XLSX.utils.json_to_sheet(numbered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh sách bốc thăm');
    XLSX.writeFile(wb, 'danh-sach-boc-tham.xlsx');
  }, [categories, brackets, benches]);

  // Replace the whole local draw with what came down from the cloud. Written
  // through saveDraw → loadDraw so the stored copy and the relabelling logic
  // stay the single path every load goes through.
  const handleCloudLoaded = useCallback((incoming: Partial<DrawState>) => {
    saveDraw({
      allAthletes: incoming.allAthletes ?? [],
      categories: incoming.categories ?? [],
      brackets: incoming.brackets ?? {},
      benches: incoming.benches ?? {},
      unassigned: incoming.unassigned ?? [],
      fileName: incoming.fileName ?? '',
    });
    const d = loadDraw();
    setAllAthletes(d.allAthletes ?? []);
    setCategories(d.categories ?? []);
    setUnassigned(d.unassigned ?? []);
    dispatch({
      type: 'reset',
      value: { brackets: d.brackets ?? {}, benches: d.benches ?? {} },
    });
    setFileName(d.fileName ?? '');
    setActiveKey('');
    setEditingRoster([]);
    setShowAll(true);
    setImportReport(null);
  }, []);

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
      if (!cat) return;
      const msg =
        cat.athletes.length > 0
          ? `Xóa hạng cân "${cat.label}"?\n${cat.athletes.length} VĐV sẽ chuyển vào mục "VĐV chưa xếp hạng" (không bị mất, khôi phục lại được).`
          : `Xóa hạng cân "${cat.label}" (0 VĐV)?`;
      if (!confirm(msg)) return;
      setCategories((cats) => cats.filter((c) => c.key !== key));
      // Rút VĐV của hạng khỏi danh sách gốc (để gom nhóm lại không tự tạo lại
      // hạng vừa xóa) nhưng KHÔNG xóa hẳn — họ nằm ở "VĐV chưa xếp hạng".
      setAllAthletes((prev) =>
        prev
          .filter((a) => categoryKey(a.category, a.ageGroup, a.gender) !== key)
          .map((r, i) => ({ ...r, stt: i + 1 }))
      );
      setUnassigned((prev) => {
        const seen = new Set(prev.map(recordKey));
        const moved = cat.athletes.filter((a) => !seen.has(recordKey(a)));
        return [...prev, ...moved];
      });
      dispatch({
        type: 'mutate',
        fn: (s) => {
          const { [key]: _rb, ...restBrackets } = s.brackets;
          const { [key]: _bn, ...restBenches } = s.benches;
          return { brackets: restBrackets, benches: restBenches };
        },
      });
      if (activeKey === key) {
        // Nạp luôn danh sách của hạng thay thế, kẻo bảng bên trái trống dù
        // hạng đó có VĐV.
        const fallback = categories.find((c) => c.key !== key);
        setActiveKey(fallback ? fallback.key : '');
        setEditingRoster(
          fallback
            ? fallback.athletes.map((a, i) => ({ stt: i + 1, name: a.name, unit: a.unit }))
            : []
        );
      }
    },
    [categories, activeKey]
  );

  // Đưa VĐV "chưa xếp hạng" trở về đúng hạng cân cũ (tạo lại hạng nếu đã xóa).
  // Dùng chung cho khôi phục từng người và khôi phục tất cả.
  const restoreUnassigned = useCallback((recs: AthleteRecord[]) => {
    if (recs.length === 0) return;
    const keys = new Set(recs.map(recordKey));
    setUnassigned((prev) => prev.filter((u) => !keys.has(recordKey(u))));
    setAllAthletes((prev) => {
      const seen = new Set(prev.map(recordKey));
      const merged = [...prev];
      for (const r of recs) {
        const k = recordKey(r);
        if (!seen.has(k)) {
          seen.add(k);
          merged.push({ ...r });
        }
      }
      return merged.map((r, i) => ({ ...r, stt: i + 1 }));
    });
    setCategories((prev) => {
      const map = new Map<string, CategoryInfo>(
        prev.map((c) => [c.key, { ...c, athletes: [...c.athletes] }])
      );
      for (const r of recs) {
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
      list.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
      for (const c of list) c.athletes = c.athletes.map((a, i) => ({ ...a, stt: i + 1 }));
      return list;
    });
  }, []);

  // Xóa hẳn một VĐV khỏi mục "chưa xếp hạng" — bước xóa thật sự duy nhất.
  const deleteUnassigned = useCallback((rec: AthleteRecord) => {
    if (!confirm(`Xóa hẳn VĐV "${rec.name}" (${rec.unit})? Sẽ không khôi phục được.`)) return;
    const rk = recordKey(rec);
    setUnassigned((prev) => prev.filter((u) => recordKey(u) !== rk));
  }, []);

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
    const catKey = categoryKey(rec.category, rec.ageGroup, rec.gender);
    dispatch({
      type: 'mutate',
      fn: (s) => {
        const br = s.brackets[catKey];
        if (!br) return s;
        const newSlots = br.slots.map((sl) =>
          sl.athlete && sameAthlete(sl.athlete, rec)
            ? { ...sl, athlete: null }
            : sl
        );
        const newBenches = (s.benches[catKey] ?? []).filter(
          (a) => !sameAthlete(a, rec)
        );
        return {
          brackets: { ...s.brackets, [catKey]: { ...br, slots: newSlots } },
          benches:
            newBenches.length === (s.benches[catKey] ?? []).length
              ? s.benches
              : { ...s.benches, [catKey]: newBenches },
        };
      },
    });
  }, []);

  return (
    <div className="relative min-h-full w-full bg-white p-6 text-black">
      <button
        onClick={() => navigate('/')}
        className="absolute right-4 top-4 rounded-lg bg-black/10 px-5 py-2.5 text-base font-semibold hover:bg-black/20"
      >
        ← Menu
      </button>

      <h1 className="mb-5 text-4xl font-bold">Bốc thăm thi đấu</h1>

      <AddCategoryDialog
        open={addingCategory}
        onClose={() => setAddingCategory(false)}
        onAdd={handleAddCategory}
        weightOptions={weightOptions}
        ageOptions={ageOptions}
        existingKeys={existingKeys}
      />

      <CloudSyncDialog
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        getState={() => ({ allAthletes, categories, brackets, benches, unassigned, fileName })}
        onLoaded={handleCloudLoaded}
        hasLocalData={allAthletes.length > 0 || drawnCount > 0}
      />

      {/* Toolbar — grouped into one clear control bar with large, labelled buttons */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf"
          onChange={handleImportFile}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          📁 Thêm file Excel / PDF
        </button>
        <button
          onClick={() => setAddingCategory(true)}
          className="rounded-lg bg-green-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-green-700"
        >
          ＋ Thêm hạng cân
        </button>
        {categories.length > 0 && (
          <>
            <span className="mx-1 h-8 w-px bg-gray-300" />
            <button
              onClick={handleDrawAll}
              className="rounded-lg bg-red-600 px-6 py-2.5 text-base font-bold text-white shadow hover:bg-red-700"
            >
              🎲 BỐC THĂM TẤT CẢ
            </button>
          </>
        )}
        <button
          onClick={() => setShowAll(!showAll)}
          className={`rounded-lg px-5 py-2.5 text-base font-semibold ${
            showAll ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {showAll ? '👁 Tất cả VĐV' : '📋 Theo hạng cân'}
        </button>
        <button
          onClick={() => setCloudOpen(true)}
          title="Lưu sơ đồ lên đám mây / tải về từ máy khác"
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          ☁ Đồng bộ máy khác
        </button>
        {allAthletes.length > 0 && (
          <button
            onClick={handleClearAll}
            className="ml-auto rounded-lg bg-red-100 px-5 py-2.5 text-base font-semibold text-red-600 hover:bg-red-200"
          >
            🗑 Xóa hết
          </button>
        )}
      </div>
      {fileName && (
        <p className="mb-4 text-base text-gray-600">
          📄 File ({allAthletes.length} VĐV): <b>{fileName}</b>
        </p>
      )}

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
              {importReport.drawnClasses.length > 0 && (
                <p className="mt-1 rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                  ✔ File có sẵn <b>số thăm</b> cho {importReport.drawnClasses.length} hạng —
                  sơ đồ đã được dựng đúng theo kết quả bốc thăm trong file:{' '}
                  {importReport.drawnClasses.join(', ')}. VĐV thiếu/trùng số thăm nằm ở
                  hàng đợi.
                </p>
              )}
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

      {/* Weight-class dropdown (bảng xổ lựa chọn) + action row for the selected
          class: draw / edit / add / delete. */}
      <CategoryCards
        categories={categories}
        activeKey={activeKey}
        drawnKeys={drawnKeys}
        onSelect={(key) => {
          handleSelectCategory(key);
          setShowAll(false);
        }}
        onDraw={drawCategoryByKey}
        onEdit={(key) => {
          handleSelectCategory(key);
          setShowAll(false);
          setIsEditing(true);
        }}
        onAdd={(key) => {
          handleSelectCategory(key);
          setShowAll(false);
          setIsEditing(true);
          handleAddRow();
        }}
        onDelete={handleDeleteCategory}
      />

      {/* VĐV của các hạng cân đã xóa — nằm chờ ở đây, không ai bị mất. */}
      {unassigned.length > 0 && (
        <div className="mb-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-amber-900">
              🗂 VĐV chưa xếp hạng ({unassigned.length})
            </h3>
            <span className="text-xs text-amber-800">
              — VĐV của hạng cân đã xóa, chưa bị mất. Bấm ↩ để trả về hạng cũ.
            </span>
            <button
              onClick={() => restoreUnassigned(unassigned)}
              className="ml-auto rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700"
            >
              ↩ Khôi phục tất cả
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((a) => (
              <div
                key={recordKey(a)}
                className="flex items-center gap-1.5 rounded border border-amber-300 bg-white py-1 pl-2 pr-1 text-sm"
              >
                <span className="font-semibold">{a.name}</span>
                <span className="text-xs text-gray-600">({a.unit})</span>
                <span className="text-xs text-gray-500">
                  · {categoryLabel(a.category, a.ageGroup, a.gender)}
                </span>
                <button
                  onClick={() => restoreUnassigned([a])}
                  title="Khôi phục về hạng cân cũ"
                  className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700 hover:bg-green-200"
                >
                  ↩
                </button>
                <button
                  onClick={() => deleteUnassigned(a)}
                  title="Xóa hẳn (không khôi phục được)"
                  className="grid h-5 w-5 place-items-center rounded bg-red-600 text-[11px] font-bold leading-none text-white opacity-60 hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-wrap gap-8">
        {/* Left: Roster */}
        <div className="min-w-[360px] max-w-[600px] flex-1">
          {showAll && allAthletes.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-2xl font-bold">
                  Danh sách tất cả VĐV ({allAthletes.length})
                </h3>
                <button
                  onClick={() => setEditingAll((v) => !v)}
                  className={`rounded-lg px-4 py-2 text-base font-semibold ${
                    editingAll
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-600 text-white hover:bg-gray-700'
                  }`}
                >
                  {editingAll ? '✓ Xong' : '✎ Sửa thông tin'}
                </button>
              </div>
              {editingAll && (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Sửa trực tiếp trong ô. Đổi <b>hạng cân / lứa tuổi / giới tính</b> sẽ tự
                  chuyển VĐV sang hạng đúng.
                </p>
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
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-2xl font-bold">
                  Danh sách VĐV - {currentCategory?.label || ''}
                </h3>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleAddRow}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-base font-semibold text-white hover:bg-blue-600"
                      >
                        ＋ Thêm
                      </button>
                      <button
                        onClick={handleRemoveEmpty}
                        className="rounded-lg bg-orange-500 px-4 py-2 text-base font-semibold text-white hover:bg-orange-600"
                      >
                        Xóa trống
                      </button>
                      <button
                        onClick={handleSaveRoster}
                        className="rounded-lg bg-green-600 px-4 py-2 text-base font-semibold text-white hover:bg-green-700"
                      >
                        ✓ Lưu
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="rounded-lg bg-gray-600 px-4 py-2 text-base font-semibold text-white hover:bg-gray-700"
                    >
                      ✎ Sửa
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
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-10 text-center text-lg text-gray-400">
              {allAthletes.length === 0
                ? 'Import file Excel để bắt đầu'
                : 'Chọn một hạng cân để xem danh sách'}
            </div>
          )}

          {/* Hàng đợi nằm dưới danh sách VĐV: kéo từ sơ đồ (cột phải) thả vào
              đây để cất, kéo ngược lại để trả về sơ đồ. */}
          {bracketData && (
            <div className="mt-4">
              <BenchPanel
                bench={bench}
                onDropFromBracket={handleBenchDrop}
                onRemove={handleBenchRemove}
              />
            </div>
          )}
        </div>

        {/* Right: Bracket + pager */}
        <div className="min-w-[500px] flex-1">
          {drawnCount > 0 && categories.length > 0 && (
            <div className="mb-3 rounded-lg bg-gray-100 px-3 py-2.5">
              {/* Hàng 1: điều hướng giữa các hạng cân */}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => gotoCategory(-1)}
                  className="rounded-lg bg-white px-4 py-2 text-base font-semibold shadow hover:bg-gray-50"
                >
                  ‹ Trước
                </button>
                <div className="text-center leading-tight">
                  <div className="text-lg font-bold">{currentCategory?.label}</div>
                  <div className="text-sm text-gray-500">
                    Hạng {catIndex + 1}/{categories.length} · Đã bốc {drawnCount}
                  </div>
                </div>
                <button
                  onClick={() => gotoCategory(1)}
                  className="rounded-lg bg-white px-4 py-2 text-base font-semibold shadow hover:bg-gray-50"
                >
                  Tiếp ›
                </button>
              </div>
              {/* Hàng 2: hoàn tác/làm lại + các nút xuất file */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 border-t border-gray-200 pt-2">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  title="Hoàn tác (Ctrl+Z)"
                  className="rounded-lg bg-white px-4 py-2 text-base font-semibold shadow hover:bg-gray-50 disabled:opacity-40"
                >
                  ↶ Hoàn tác
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  title="Làm lại (Ctrl+Y)"
                  className="rounded-lg bg-white px-4 py-2 text-base font-semibold shadow hover:bg-gray-50 disabled:opacity-40"
                >
                  ↷ Làm lại
                </button>
                <span className="mx-1 h-8 w-px bg-gray-300" />
                <button
                  onClick={handleExportPdf}
                  disabled={!bracketData || exporting}
                  className="rounded-lg bg-gray-700 px-4 py-2 text-base font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
                >
                  ⬇ Xuất PDF hạng này
                </button>
                <button
                  onClick={handleExportAllPdf}
                  disabled={exporting}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-base font-semibold text-white hover:bg-black disabled:opacity-40"
                >
                  {exporting ? 'Đang xuất…' : `⬇ Xuất tất cả PDF (${drawnCount})`}
                </button>
                <button
                  onClick={handleExportExcel}
                  title="File Excel có cột Số thăm — import lại sẽ dựng đúng các sơ đồ này"
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-base font-semibold text-white hover:bg-emerald-800"
                >
                  ⬇ Xuất Excel kèm số thăm
                </button>
              </div>
            </div>
          )}

          {bracketData ? (
            <div className="overflow-x-auto bg-white p-4">
              <div className="mb-2 rounded bg-gray-700 px-3 py-2 text-base font-bold uppercase text-white">
                {bracketData.category}
              </div>
              <Bracket
                data={bracketData}
                onSwapSlots={handleSwap}
                onClearSlot={handleClearSlot}
                onSetSlot={handleSetSlot}
                onDropAthlete={handleDropAthlete}
              />
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-4 text-center text-lg text-gray-400">
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
              <Bracket data={brackets[c.key]} />
            </div>
          ))}
      </div>
    </div>
  );
}
