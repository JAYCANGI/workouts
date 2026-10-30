// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { runSync } from '../sync/engine';
import type { SheetsClient } from '../sync/google';
import { mergeTable } from '../sync/merge';
import type { Rec } from '../sync/schema';

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;

function fakeSheet() {
  const tabs = new Map<string, unknown[][]>();
  let modified = 1000;
  const client: SheetsClient = {
    findSheet: async () => null,
    createSheet: async (names) => {
      names.forEach((n) => tabs.set(n, []));
      return 'sheet1';
    },
    tabTitles: async () => [...tabs.keys()],
    addTabs: async (_, names) => names.forEach((n) => tabs.set(n, [])),
    modifiedAt: async () => modified,
    readTabs: async (_, names) => names.map((n) => tabs.get(n) ?? []),
    writeTabs: async (_, data) => {
      data.forEach((d) => tabs.set(d.tab, d.rows));
      modified = Date.now();
    },
  };
  return { client, tabs, touch: (t: number) => (modified = t) };
}

const col = (rows: unknown[][], name: string) => rows[0].indexOf(name);
const hash = (r: Rec) => JSON.stringify([r.v]);
const rec = (id: string, v: string, updatedAt = 1): Rec => ({ id, v, updatedAt });

describe('mergeTable', () => {
  const base = (r: Rec) => new Map([[r.id, { hash: hash(r), updatedAt: r.updatedAt }]]);

  it('pushes new local rows and pulls new remote rows', () => {
    const m = mergeTable([rec('a', '1')], [rec('b', '2')], new Map(), hash, 0);
    expect(m.rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(m.upsertLocal.map((r) => r.id)).toEqual(['b']);
    expect(m.sheetChanged).toBe(true);
  });

  it('takes a hand edit from the Sheet', () => {
    const old = rec('a', '1');
    const m = mergeTable([old], [rec('a', 'edited')], base(old), hash, 500);
    expect(m.upsertLocal[0].v).toBe('edited');
    expect(m.upsertLocal[0].updatedAt).toBe(500);
  });

  it('lets the later edit win a conflict, using Sheet modified time for hand edits', () => {
    const old = rec('a', '1');
    const localEdit = rec('a', 'local', 300);
    expect(mergeTable([localEdit], [rec('a', 'sheet')], base(old), hash, 500).upsertLocal[0].v).toBe('sheet');
    const later = mergeTable([rec('a', 'local', 900)], [rec('a', 'sheet')], base(old), hash, 500);
    expect(later.upsertLocal).toEqual([]);
    expect(later.rows[0].v).toBe('local');
  });

  it('deletes locally when the row was removed from the Sheet, unless edited locally', () => {
    const old = rec('a', '1');
    expect(mergeTable([old], [], base(old), hash, 0).purgeLocal).toEqual(['a']);
    expect(mergeTable([rec('a', 'new', 9)], [], base(old), hash, 0).rows[0].v).toBe('new');
  });

  it('removes locally deleted rows from the Sheet', () => {
    const old = rec('a', '1');
    const m = mergeTable([{ ...old, deleted: 1, updatedAt: 5 }], [old], base(old), hash, 0);
    expect(m.rows).toEqual([]);
    expect(m.purgeLocal).toEqual(['a']);
    expect(m.sheetChanged).toBe(true);
  });

  it('does not rewrite the Sheet when nothing changed', () => {
    const old = rec('a', '1');
    expect(mergeTable([old], [old], base(old), hash, 0).sheetChanged).toBe(false);
  });
});

describe('runSync', () => {
  beforeEach(async () => {
    store.clear();
    await Promise.all([db.workouts.clear(), db.sets.clear(), db.bodyWeights.clear(), db.routines.clear(), db.customExercises.clear(), db.syncBase.clear()]);
  });

  const seed = async () => {
    await db.workouts.put({ id: 'w1', name: 'Push', startedAt: Date.UTC(2026, 0, 2), finishedAt: Date.UTC(2026, 0, 2, 1), updatedAt: 10 });
    await db.sets.put({ id: 's1', workoutId: 'w1', exerciseId: 'custom1', position: 0, reps: 8, weightKg: 60, done: true, updatedAt: 10 });
    await db.customExercises.put({ id: 'custom1', name: 'My Press', kind: 'weight', primary: ['chest'], updatedAt: 10 });
  };

  it('creates a readable Sheet with derived date and exercise name', async () => {
    await seed();
    const { client, tabs } = fakeSheet();
    await runSync(client);
    const sets = tabs.get('Sets')!;
    expect(sets[1][col(sets, 'exercise')]).toBe('My Press');
    expect(sets[1][col(sets, 'date')]).toBe('2026-01-02');
    expect(sets[1][col(sets, 'weightKg')]).toBe(60);
  });

  it('round-trips a hand edit, a new row and a deleted row', async () => {
    await seed();
    await db.bodyWeights.put({ id: 'b1', date: '2026-01-01', kg: 80, updatedAt: 10 });
    const { client, tabs, touch } = fakeSheet();
    await runSync(client);

    const sets = tabs.get('Sets')!;
    sets[1][col(sets, 'weightKg')] = 62.5;
    const bw = tabs.get('BodyWeight')!;
    bw.splice(1, 1);
    bw.push(['2026-01-03', 79.5, '', '']);
    touch(Date.now() + 1000);
    await runSync(client);

    expect((await db.sets.get('s1'))!.weightKg).toBe(62.5);
    const weights = await db.bodyWeights.toArray();
    expect(weights.map((w) => w.kg)).toEqual([79.5]);
    expect(weights[0].id).toBeTruthy();
    expect(tabs.get('BodyWeight')![1][col(tabs.get('BodyWeight')!, 'id')]).toBe(weights[0].id);
  });

  it('restores an emptied tab instead of wiping local history', async () => {
    await seed();
    const { client, tabs } = fakeSheet();
    await runSync(client);
    tabs.set('Sets', []);
    await runSync(client);
    expect(await db.sets.get('s1')).toBeTruthy();
    expect(tabs.get('Sets')!.length).toBe(2);
  });

  it('keeps unusable hand-typed rows in the Sheet and reports them', async () => {
    await seed();
    const { client, tabs } = fakeSheet();
    await runSync(client);
    const bw = tabs.get('BodyWeight');
    tabs.set('BodyWeight', [bw![0], ['2026-02-01', 'heavy', '', '']]);
    const report = await runSync(client);
    expect(report.skippedRows).toBe(1);
    expect(tabs.get('BodyWeight')!.length).toBe(2);
    expect(await db.bodyWeights.count()).toBe(0);
  });

  it('removes a local delete from the Sheet and purges it locally', async () => {
    await seed();
    const { client, tabs } = fakeSheet();
    await runSync(client);
    const live = (await db.sets.get('s1'))!;
    await db.sets.put({ ...live, deleted: 1, updatedAt: live.updatedAt + 1 });
    await runSync(client);
    expect(await db.sets.get('s1')).toBeUndefined();
    expect(tabs.get('Sets')!.length).toBe(1);
  });
});
