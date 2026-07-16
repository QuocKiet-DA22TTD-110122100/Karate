# Karate Tournament

Interactive scoreboard / draw app for a karate tournament (kumite, kata, bốc thăm),
scaffolded from a Figma wireframe.

## Stack
Vite + React + TypeScript, Zustand (match state), React Router, Tailwind CSS.

## Run
```bash
npm install
npm run dev      # http://localhost:5175
npm run build    # typecheck + production build
```

## Screens
| Route | Screen |
|-------|--------|
| `/` | Menu (kata / bốc thăm / kumite) |
| `/kumite` | Kumite scoreboard — scores, senshu, penalties, timer |
| `/kata` | Kata scoreboard — kata selectors + timer |
| `/draw` | Roster table + single-elimination bracket |

## Interactivity (kumite)
- `+1 / +2 / +3 / −1` per side; first side to score gets **senshu** (green `s`).
- Penalty cells `C1–C5` toggle per side; `warning` label in the middle.
- Timer: Start / Stop / Reset (counts down from 2:00).

## Notes / TODO
- Competitor names/units are seeded with placeholder data in `matchStore.ts`.
- Draw seeding uses roster entry order — add a real shuffle for an actual draw.
- `data excel` frame (roster import) not built yet — add SheetJS (`xlsx`) later.
- Screens are designed for a 16:9 display (1728×1117 source frames).
