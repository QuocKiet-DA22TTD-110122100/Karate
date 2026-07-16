interface FlagProps {
  country: string;
  className?: string;
}

/**
 * A regular five-pointed star, drawn rather than typed.
 *
 * The ★ glyph carries whatever side bearings its font gives it, so centring the
 * text box leaves the star itself visibly off-centre — worse the larger it gets.
 * These points put all five tips on a circle centred at (50,50), so the star
 * centres on the box exactly, in any font, at any size.
 */
export function Star({ className }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <polygon points="50,0 61.23,34.55 97.55,34.55 68.16,55.9 79.39,90.45 50,69.1 20.61,90.45 31.84,55.9 2.45,34.55 38.77,34.55" />
    </svg>
  );
}

// Minimal Vietnam-style flag placeholder (red field, yellow star).
// Swap for a real flag set later if more countries are needed.
export default function Flag({ country, className }: Readonly<FlagProps>) {
  return (
    <div className={className}>
      <div className="grid h-16 w-24 place-items-center rounded bg-red-600">
        <Star className="h-11 w-11 fill-timer" />
      </div>
      <div className="mt-1 text-center text-lg font-bold text-white">
        {country}
      </div>
    </div>
  );
}
