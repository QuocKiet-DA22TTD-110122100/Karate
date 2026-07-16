import type { Side } from '../types';

// The small "AO" (blue) / "AK" (red) tab shown under the flag.
export default function SideTab({ side }: { side: Side }) {
  const bg = side === 'ao' ? 'bg-ao' : 'bg-aka';
  const label = side === 'ao' ? 'AO' : 'AK';
  return (
    <div className="flex flex-col items-center">
      <div className={`h-16 w-24 rounded-t ${bg}`} />
      <div className="grid h-8 w-24 place-items-center rounded-b bg-timer text-lg font-bold text-black">
        {label}
      </div>
    </div>
  );
}
