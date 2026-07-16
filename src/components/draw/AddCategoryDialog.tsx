import { useMemo, useState } from 'react';
import { categoryKey, categoryLabel } from '../../lib/normalize';

const CUSTOM = '__custom__';

interface AddCategoryDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (weight: string, ageGroup: string, gender: string) => void;
  /** Values already seen in the imported roster — offered first so a hand-added
      class keys the same way an imported one does. */
  weightOptions: string[];
  ageOptions: string[];
  /** `weight|age|gender` of classes that already exist, to block duplicates. */
  existingKeys: Set<string>;
}

/** A select whose list comes from the file, with an escape hatch for new values. */
function PickOrType(props: Readonly<{
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}>) {
  const { label, options, value, onChange, placeholder } = props;
  const known = options.includes(value);
  const [typing, setTyping] = useState(false);
  const custom = typing || (!!value && !known);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase text-gray-500">{label}</span>
      <select
        value={custom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setTyping(true);
            onChange('');
          } else {
            setTyping(false);
            onChange(e.target.value);
          }
        }}
        className="rounded border-2 border-gray-300 px-2 py-1.5 text-sm font-medium"
      >
        <option value="" disabled>
          Chọn…
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={CUSTOM}>➕ Khác (tự nhập)…</option>
      </select>
      {custom && (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="rounded border-2 border-yellow-400 px-2 py-1.5 text-sm"
        />
      )}
    </label>
  );
}

/**
 * Opens a weight class the roster has nobody in yet — the case where a class is
 * on the tournament programme but drew no entries, so no import can create it.
 */
export default function AddCategoryDialog({
  open,
  onClose,
  onAdd,
  weightOptions,
  ageOptions,
  existingKeys,
}: Readonly<AddCategoryDialogProps>) {
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');

  const label = useMemo(() => categoryLabel(weight, age, gender), [weight, age, gender]);
  const duplicate = !!weight && existingKeys.has(categoryKey(weight, age, gender));
  const ready = !!weight.trim() && !!gender && !duplicate;

  if (!open) return null;

  const reset = () => {
    setWeight('');
    setAge('');
    setGender('');
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold">Thêm hạng cân</h2>
        <p className="mt-1 text-xs text-gray-500">
          Dùng khi giải có hạng cân nhưng chưa VĐV nào đăng ký — import không thể
          tự tạo hạng trống.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <PickOrType
            label="Hạng cân"
            options={weightOptions}
            value={weight}
            onChange={setWeight}
            placeholder="VD: 42kg hoặc 42kg+"
          />
          <PickOrType
            label="Lứa tuổi"
            options={ageOptions}
            value={age}
            onChange={setAge}
            placeholder="VD: 7-9"
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-gray-500">Giới tính</span>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="rounded border-2 border-gray-300 px-2 py-1.5 text-sm font-medium"
            >
              <option value="" disabled>
                Chọn…
              </option>
              <option value="Nam">Nam</option>
              <option value="Nữ">Nữ</option>
            </select>
          </label>
        </div>

        <div className="mt-4 rounded bg-gray-50 px-3 py-2 text-sm">
          <span className="text-gray-500">Sẽ tạo: </span>
          <b>{label || '—'}</b>
          {duplicate && (
            <p className="mt-1 text-xs font-semibold text-red-600">
              Hạng cân này đã có trong danh sách.
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Hủy
          </button>
          <button
            onClick={() => {
              onAdd(weight.trim(), age.trim(), gender);
              reset();
              onClose();
            }}
            disabled={!ready}
            className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
          >
            Thêm hạng cân
          </button>
        </div>
      </div>
    </div>
  );
}
