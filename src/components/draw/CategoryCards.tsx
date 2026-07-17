import { useMemo, useRef, useState } from 'react';
import type { CategoryInfo } from '../../types';

interface CategoryCardsProps {
  categories: CategoryInfo[];
  activeKey: string;
  /** Keys of classes that already have a bracket drawn. */
  drawnKeys: Set<string>;
  onSelect: (key: string) => void;
  onDraw: (key: string) => void;
  onEdit: (key: string) => void;
  onAdd: (key: string) => void;
  onDelete: (key: string) => void;
}

// Fold Vietnamese diacritics so "22kg nu" also finds "22kg - Nữ".
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

// A gold action button matching the reference mockup.
function CardButton(props: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <button
      onClick={props.onClick}
      className="rounded bg-amber-400 px-3 py-1.5 text-sm font-semibold text-black shadow-sm hover:bg-amber-500"
    >
      {props.label}
    </button>
  );
}

/**
 * Weight-class picker: a searchable combobox (type to filter, arrow keys +
 * Enter to pick) plus an action row for the selected class.
 */
export default function CategoryCards({
  categories,
  activeKey,
  drawnKeys,
  onSelect,
  onDraw,
  onEdit,
  onAdd,
  onDelete,
}: Readonly<CategoryCardsProps>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = categories.find((c) => c.key === activeKey);
  const drawn = current ? drawnKeys.has(current.key) : false;

  const optionText = (c: CategoryInfo) =>
    `${c.label} · ${c.athletes.length} VĐV${drawnKeys.has(c.key) ? ' · đã bốc' : ''}`;

  // Every typed word must appear somewhere in the option text (diacritics
  // ignored), so "22 nam" or "7-9" narrows the list as expected.
  const filtered = useMemo(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return categories;
    return categories.filter((c) => {
      const hay = fold(
        `${c.label} ${c.athletes.length} VĐV${drawnKeys.has(c.key) ? ' đã bốc' : ''}`
      );
      return tokens.every((t) => hay.includes(t));
    });
  }, [categories, query, drawnKeys]);

  if (categories.length === 0) return null;

  const hi = Math.min(highlight, Math.max(0, filtered.length - 1));

  const pick = (key: string) => {
    onSelect(key);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const openList = () => {
    setQuery('');
    setHighlight(Math.max(0, categories.findIndex((c) => c.key === activeKey)));
    setOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(Math.min(hi + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(Math.max(hi - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[hi]) pick(filtered[hi].key);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <label className="flex items-center gap-2 text-base font-semibold">
        Hạng cân:
        <div className="relative">
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-label="Tìm và chọn hạng cân"
            value={open ? query : current ? optionText(current) : ''}
            placeholder={current ? optionText(current) : 'Gõ để tìm hạng cân…'}
            onFocus={openList}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
              if (!open) setOpen(true);
            }}
            onBlur={() => {
              setOpen(false);
              setQuery('');
            }}
            onKeyDown={handleKeyDown}
            className="w-[420px] max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-base font-normal"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500">
            ▾
          </span>
          {open && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm font-normal text-gray-400">
                  Không có hạng cân nào khớp “{query}”
                </p>
              ) : (
                filtered.map((c, i) => (
                  <button
                    key={c.key}
                    // preventDefault keeps the input's blur from closing the
                    // list before this click lands.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(c.key);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    ref={i === hi ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                    className={`block w-full px-3 py-2 text-left text-base font-normal ${
                      i === hi ? 'bg-amber-100' : 'bg-white'
                    } ${c.key === activeKey ? 'font-semibold' : ''}`}
                  >
                    {c.label}{' '}
                    <span className="text-sm text-gray-500">· {c.athletes.length} VĐV</span>
                    {drawnKeys.has(c.key) && (
                      <span className="ml-1 text-sm font-semibold text-green-700">· đã bốc</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </label>

      {current && (
        <>
          <span className="text-sm text-gray-600">
            {current.athletes.length} VĐV
            {drawn && <span className="ml-1 font-semibold text-green-700">· đã bốc thăm</span>}
          </span>
          <span className="mx-1 h-8 w-px bg-gray-300" />
          <CardButton
            label={drawn ? 'bốc lại' : 'bốc thăm'}
            onClick={() => onDraw(current.key)}
          />
          <CardButton label="sửa" onClick={() => onEdit(current.key)} />
          <CardButton label="thêm" onClick={() => onAdd(current.key)} />
          <button
            onClick={() => onDelete(current.key)}
            className="rounded bg-white px-3 py-1.5 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-100"
            title="Xóa hạng cân này"
          >
            × xóa hạng
          </button>
        </>
      )}
    </div>
  );
}
