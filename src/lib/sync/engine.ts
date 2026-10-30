import type { Table } from 'dexie';
import { changed, db, newId, type SyncBase } from '../../db';
import { exerciseMap } from '../library';
import { AuthRequired, getSheetId, getToken, googleClient, setSheetId, SheetMissing, wasConnected, type SheetsClient } from './google';
import { mergeTable, type Base } from './merge';
import { hashRec, header, parseRows, recToRow, TABS, type Rec, type TabSpec } from './schema';

const tableOf = (spec: TabSpec) => db[spec.table] as unknown as Table<Rec, string>;

const SORT_KEY: Record<string, (r: Rec) => string | number> = {
  workouts: (r) => r.startedAt as number,
  bodyWeights: (r) => r.date as string,
  routines: (r) => r.name as string,
  customExercises: (r) => r.name as string,
};

const compare = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

export interface SyncReport {
  skippedRows: number;
}

export async function runSync(client: SheetsClient, now: () => number = Date.now): Promise<SyncReport> {
  let sheetId = getSheetId();
  const names = TABS.map((t) => t.tab);
  if (!sheetId) {
    sheetId = (await client.findSheet()) ?? (await client.createSheet(names));
    setSheetId(sheetId);
  }
  const existing = await client.tabTitles(sheetId);
  const missing = names.filter((n) => !existing.includes(n));
  if (missing.length) await client.addTabs(sheetId, missing);

  const modifiedAt = (await client.modifiedAt(sheetId)) || now();
  const remote = await client.readTabs(sheetId, names);
  const baseRows = await db.syncBase.toArray();

  const merged = await Promise.all(TABS.map(async (spec, i) => {
    const parsed = parseRows(spec, remote[i], newId);
    const base = new Map<string, Base>();
    for (const row of baseRows) {
      const [table, id] = [row.key.slice(0, row.key.indexOf(':')), row.key.slice(row.key.indexOf(':') + 1)];
      if (table === spec.table) base.set(id, { hash: row.hash, updatedAt: row.updatedAt });
    }
    // An emptied tab is treated as an accident: restore it instead of deleting local history.
    const emptied = parsed.recs.length === 0 && base.size > 0;
    const local = await tableOf(spec).toArray();
    const result = mergeTable(local, parsed.recs, emptied ? new Map() : base, (r) => hashRec(spec, r), modifiedAt);
    return { spec, parsed, local, result, previousRows: remote[i].length, emptied };
  }));

  // Names and dates in the Sets tab should reflect this merge.
  const customRows = merged.find((m) => m.spec.table === 'customExercises')!.result.rows;
  const exercises = exerciseMap(customRows as never);
  const workoutRows = merged.find((m) => m.spec.table === 'workouts')!.result.rows;
  const startedAt = new Map(workoutRows.map((w) => [w.id, w.startedAt as number]));

  const derive = (rec: Rec, key: string) => {
    if (key === 'exercise') return exercises.get(rec.exerciseId as string)?.name ?? '';
    const at = startedAt.get(rec.workoutId as string);
    return at ? new Date(at).toISOString().slice(0, 10) : '';
  };
  SORT_KEY.sets = (r) => `${String(startedAt.get(r.workoutId as string) ?? 0).padStart(15, '0')}:${String(r.position ?? 0).padStart(6, '0')}`;

  const writes = merged
    .filter((m) => m.result.sheetChanged || m.parsed.assignedIds || m.emptied || m.previousRows === 0)
    .map((m) => {
      const key = SORT_KEY[m.spec.table];
      const rows = [...m.result.rows].sort((a, b) => compare(key(a), key(b)));
      const values = [header(m.spec), ...[...rows, ...m.parsed.invalid].map((r) => recToRow(m.spec, r, derive))];
      return { tab: m.spec.tab, rows: values, clearFrom: values.length + 1 };
    });
  if (writes.length) await client.writeTabs(sheetId, writes);

  // The Sheet is safe, so local changes can be committed. Anything edited during the sync is left for next time.
  await db.transaction('rw', [...TABS.map(tableOf), db.syncBase], async () => {
    for (const { spec, local, result } of merged) {
      const table = tableOf(spec);
      const seen = new Map(local.map((r) => [r.id, r.updatedAt]));
      for (const rec of result.upsertLocal) {
        const current = await table.get(rec.id);
        if (!current || current.updatedAt === seen.get(rec.id)) await table.put(rec);
      }
      for (const id of result.purgeLocal) {
        const current = await table.get(id);
        if (current && current.updatedAt === seen.get(id)) await table.delete(id);
      }
    }
    await db.syncBase.clear();
    const rows: SyncBase[] = merged.flatMap(({ spec, result }) =>
      [...result.base].map(([id, b]) => ({ key: `${spec.table}:${id}`, ...b })),
    );
    await db.syncBase.bulkPut(rows);
  });

  return { skippedRows: merged.reduce((n, m) => n + m.parsed.invalid.length, 0) };
}

export type SyncState =
  | { status: 'off' }
  | { status: 'syncing' }
  | { status: 'ok'; at: number; skippedRows: number }
  | { status: 'reconnect' }
  | { status: 'missing' }
  | { status: 'error'; message: string };

const LAST_SYNC = 'last-sync';

function lastOk(): SyncState {
  try {
    const at = Number(localStorage.getItem(LAST_SYNC));
    return at ? { status: 'ok', at, skippedRows: 0 } : { status: 'off' };
  } catch {
    return { status: 'off' };
  }
}

let state: SyncState = { status: 'off' };
const listeners = new Set<() => void>();

function setState(next: SyncState) {
  state = next;
  listeners.forEach((l) => l());
}

export const syncStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};

let running = false;
let again = false;

export async function syncNow() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  setState({ status: 'syncing' });
  try {
    const { skippedRows } = await runSync(googleClient);
    localStorage.setItem(LAST_SYNC, String(Date.now()));
    setState({ status: 'ok', at: Date.now(), skippedRows });
  } catch (e) {
    if (e instanceof AuthRequired) setState({ status: 'reconnect' });
    else if (e instanceof SheetMissing) setState({ status: 'missing' });
    else setState({ status: 'error', message: e instanceof Error ? e.message : 'Sync failed.' });
  } finally {
    running = false;
    if (again) {
      again = false;
      void syncNow();
    }
  }
}

/** For when the Sheet was deleted: forget it, so the next sync makes a new one from local data. */
export async function resetSheetLink() {
  setSheetId(null);
  await db.syncBase.clear();
}

let timer: ReturnType<typeof setTimeout> | undefined;

function autoSync(delay: number) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!wasConnected()) return;
    if (!navigator.onLine) return;
    // Silent token renewal needs a tap, so without a token just prompt for one.
    if (getToken()) void syncNow();
    else setState({ status: 'reconnect' });
  }, delay);
}

export function startAutoSync() {
  if (wasConnected()) setState(lastOk());
  changed.addEventListener('change', () => autoSync(5000));
  window.addEventListener('online', () => autoSync(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') autoSync(500);
  });
  autoSync(500);
}
