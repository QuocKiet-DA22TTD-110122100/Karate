export type Side = 'ao' | 'aka'; // ao = blue, aka = red

export interface Competitor {
  name: string;
  unit: string;
  country: string; // ISO-ish label shown on the board, e.g. "VIE"
}

export interface RosterEntry {
  stt: number;
  name: string;
  unit: string;
}

export interface AthleteRecord {
  stt: number;
  name: string;
  unit: string;
  category: string; // e.g. "25kg", "36kg"
  ageGroup: string; // e.g. "6-9", "10-11"
  gender: string; // e.g. "Nam", "Nữ"
}

export interface CategoryInfo {
  key: string;
  label: string;
  athletes: AthleteRecord[];
}
