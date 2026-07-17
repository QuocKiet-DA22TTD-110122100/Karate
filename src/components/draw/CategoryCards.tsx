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

// A gold action button matching the reference mockup.
function CardButton(props: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation(); // don't also trigger the card's select
        props.onClick();
      }}
      className="rounded bg-amber-400 px-3 py-1.5 text-sm font-semibold text-black shadow-sm hover:bg-amber-500"
    >
      {props.label}
    </button>
  );
}

/**
 * Weight classes as a grid of cards (replacing the old dropdown). Each card is a
 * self-contained control: pick it to show its bracket, or run its own draw /
 * edit / add / delete — mirroring the reference layout.
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
  if (categories.length === 0) return null;

  return (
    <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
      {categories.map((c) => {
        const active = c.key === activeKey;
        const drawn = drawnKeys.has(c.key);
        return (
          <button
            key={c.key}
            onClick={() => onSelect(c.key)}
            className={`relative flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-colors ${
              active
                ? 'border-red-500 bg-red-50 ring-2 ring-red-200'
                : 'border-gray-200 bg-gray-100 hover:border-gray-400'
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.key);
              }}
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white text-lg font-bold text-gray-500 shadow hover:bg-red-100 hover:text-red-600"
              title="Xóa hạng cân này"
            >
              ×
            </button>

            <div className="pr-8">
              <div className="text-base font-bold leading-tight">{c.label}</div>
              <div className="mt-0.5 text-sm text-gray-600">
                {c.athletes.length} VĐV
                {drawn && <span className="ml-1 font-semibold text-green-700">· đã bốc thăm</span>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <CardButton label={drawn ? 'bốc lại' : 'bốc thăm'} onClick={() => onDraw(c.key)} />
              <CardButton label="sửa" onClick={() => onEdit(c.key)} />
              <CardButton label="thêm" onClick={() => onAdd(c.key)} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
