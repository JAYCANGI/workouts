import type { SyncedTableName } from '../../db';

export type CellType = 'string' | 'number' | 'time' | 'bool' | 'json' | 'list';

export interface Column {
  key: string;
  type: CellType;
  /** Shown for readability only. Never read back from the Sheet. */
  derived?: boolean;
}

export interface TabSpec {
  tab: string;
  table: SyncedTableName;
  columns: Column[];
  required: string[];
}

const c = (key: string, type: CellType = 'string', derived = false): Column => ({ key, type, derived });

export const TABS: TabSpec[] = [
  {
    tab: 'Workouts',
    table: 'workouts',
    required: ['startedAt'],
    columns: [c('name'), c('startedAt', 'time'), c('finishedAt', 'time'), c('notes'), c('routineId'), c('id'), c('updatedAt', 'time')],
  },
  {
    tab: 'Sets',
    table: 'sets',
    required: ['workoutId', 'exerciseId'],
    columns: [
      c('date', 'string', true),
      c('exercise', 'string', true),
      c('position', 'number'),
      c('reps', 'number'),
      c('weightKg', 'number'),
      c('durationSec', 'number'),
      c('distanceKm', 'number'),
      c('done', 'bool'),
      c('exerciseId'),
      c('workoutId'),
      c('id'),
      c('updatedAt', 'time'),
    ],
  },
  {
    tab: 'Routines',
    table: 'routines',
    required: ['name'],
    columns: [c('name'), c('items', 'json'), c('id'), c('updatedAt', 'time')],
  },
  {
    tab: 'CustomExercises',
    table: 'customExercises',
    required: ['name', 'kind'],
    columns: [c('name'), c('kind'), c('primary', 'list'), c('equipment'), c('notes'), c('id'), c('updatedAt', 'time')],
  },
  {
    tab: 'BodyWeight',
    table: 'bodyWeights',
    required: ['date', 'kg'],
    columns: [c('date'), c('kg', 'number'), c('id'), c('updatedAt', 'time')],
  },
];

export type Rec = Record<string, unknown> & { id: string; updatedAt: number; deleted?: 0 | 1 };
export type Cell = string | number | boolean;

export function toCell(type: CellType, value: unknown): Cell {
  if (value === undefined || value === null) return '';
  switch (type) {
    case 'time':
      return new Date(value as number).toISOString();
    case 'json':
      return JSON.stringify(value);
    case 'list':
      return (value as string[]).join(', ');
    default:
      return value as Cell;
  }
}

/** Returns undefined for blank or unreadable cells, since people edit this Sheet by hand. */
export function fromCell(type: CellType, cell: unknown): unknown {
  if (cell === '' || cell === undefined || cell === null) return undefined;
  switch (type) {
    case 'string':
      return String(cell);
    case 'number': {
      const n = typeof cell === 'number' ? cell : Number(String(cell).replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'time': {
      const t = typeof cell === 'number' ? cell : Date.parse(String(cell));
      return Number.isFinite(t) ? t : undefined;
    }
    case 'bool':
      return cell === true || String(cell).toUpperCase() === 'TRUE';
    case 'json':
      try {
        return JSON.parse(String(cell));
      } catch {
        return undefined;
      }
    case 'list':
      return String(cell).split(',').map((s) => s.trim()).filter(Boolean);
  }
}

/** Content fingerprint. Leaves out updatedAt and derived columns so only real edits register. */
export function hashRec(spec: TabSpec, rec: Rec): string {
  return JSON.stringify(
    spec.columns
      .filter((col) => !col.derived && col.key !== 'updatedAt')
      .map((col) => toCell(col.type, rec[col.key])),
  );
}

export type Derive = (rec: Rec, key: string) => Cell;

export const header = (spec: TabSpec) => spec.columns.map((col) => col.key);

export function recToRow(spec: TabSpec, rec: Rec, derive: Derive): Cell[] {
  return spec.columns.map((col) => (col.derived ? derive(rec, col.key) : toCell(col.type, rec[col.key])));
}

export interface ParsedTab {
  recs: Rec[];
  /** Rows missing required values. Kept in the Sheet and ignored by the app. */
  invalid: Rec[];
  /** Rows typed by hand without an id, which were given one. */
  assignedIds: boolean;
}

export function parseRows(spec: TabSpec, rows: unknown[][], makeId: () => string): ParsedTab {
  const result: ParsedTab = { recs: [], invalid: [], assignedIds: false };
  if (!rows.length) return result;
  const head = rows[0].map(String);
  if (!head.includes('id')) throw new Error(`The "${spec.tab}" tab has no "id" column, so it can't be read safely.`);
  for (const row of rows.slice(1)) {
    if (!row.some((cell) => cell !== '' && cell !== undefined && cell !== null)) continue;
    const rec: Record<string, unknown> = {};
    for (const col of spec.columns) {
      if (col.derived) continue;
      const at = head.indexOf(col.key);
      const value = at >= 0 ? fromCell(col.type, row[at]) : undefined;
      if (value !== undefined) rec[col.key] = value;
    }
    if (!rec.id) {
      rec.id = makeId();
      result.assignedIds = true;
    }
    rec.updatedAt ??= 0;
    const ok = spec.required.every((key) => rec[key] !== undefined);
    (ok ? result.recs : result.invalid).push(rec as Rec);
  }
  return result;
}
