import Dexie, { type Table } from 'dexie';
import type { BodyWeight, CustomExercise, Routine, Synced, Workout, WorkoutSet } from './types';

export interface SyncBase {
  key: string; // `${table}:${id}`
  hash: string;
  updatedAt: number;
}

class TrackerDb extends Dexie {
  workouts!: Table<Workout, string>;
  sets!: Table<WorkoutSet, string>;
  routines!: Table<Routine, string>;
  customExercises!: Table<CustomExercise, string>;
  bodyWeights!: Table<BodyWeight, string>;
  syncBase!: Table<SyncBase, string>;

  constructor() {
    super('workout-tracker');
    this.version(1).stores({
      workouts: 'id, startedAt',
      sets: 'id, workoutId, exerciseId',
      routines: 'id',
      customExercises: 'id',
      bodyWeights: 'id, date',
      syncBase: 'key',
    });
  }
}

export const db = new TrackerDb();

export type SyncedTableName = 'workouts' | 'sets' | 'routines' | 'customExercises' | 'bodyWeights';

export const newId = () => crypto.randomUUID();

/** Every local change goes through here so sync can see it. */
export const changed = new EventTarget();

export async function save<T extends Synced>(table: Table<T, string>, record: T) {
  await table.put({ ...record, updatedAt: Date.now() });
  changed.dispatchEvent(new Event('change'));
}

export async function patch<T extends Synced>(table: Table<T, string>, id: string, fields: Partial<T>) {
  const current = await table.get(id);
  if (current) await save(table, { ...current, ...fields });
}

export async function remove<T extends Synced>(table: Table<T, string>, id: string) {
  await patch(table, id, { deleted: 1 } as Partial<T>);
}

export const live = <T extends Synced>(rows: T[]) => rows.filter((r) => !r.deleted);
