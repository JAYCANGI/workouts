import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { db, live, newId, save } from '../db';
import { exerciseMap, unknownExercise } from '../lib/library';
import { sessionsByExercise, type Session } from '../lib/stats';
import type { BodyWeight, CustomExercise, Exercise, Routine, RoutineItem, Workout, WorkoutSet } from '../types';

export interface Data {
  workouts: Workout[];
  sets: WorkoutSet[];
  routines: Routine[];
  custom: CustomExercise[];
  bodyWeights: BodyWeight[];
  exercises: Map<string, Exercise>;
  sessions: Map<string, Session[]>;
  exercise(id: string): Exercise;
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const raw = useLiveQuery(async () => {
    const [workouts, sets, routines, custom, bodyWeights] = await Promise.all([
      db.workouts.toArray(),
      db.sets.toArray(),
      db.routines.toArray(),
      db.customExercises.toArray(),
      db.bodyWeights.toArray(),
    ]);
    return {
      workouts: live(workouts).sort((a, b) => b.startedAt - a.startedAt),
      sets: live(sets).sort((a, b) => a.position - b.position),
      routines: live(routines).sort((a, b) => a.name.localeCompare(b.name)),
      custom: live(custom),
      bodyWeights: live(bodyWeights).sort((a, b) => a.date.localeCompare(b.date)),
    };
  });
  const value = useMemo<Data | null>(() => {
    if (!raw) return null;
    const exercises = exerciseMap(raw.custom);
    return {
      ...raw,
      exercises,
      sessions: sessionsByExercise(raw.workouts, raw.sets),
      exercise: (id) => exercises.get(id) ?? unknownExercise(id),
    };
  }, [raw]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useData = () => useContext(Ctx);
/** For screens rendered only after data has loaded. */
export const useReady = () => useContext(Ctx)!;

/** Builds a set for this exercise from the same position last session, or the routine target. */
export function prefill(sessions: Session[] | undefined, index: number, targetReps?: number): Partial<WorkoutSet> {
  const last = sessions?.[sessions.length - 1];
  const from = last?.sets[index] ?? last?.sets[last.sets.length - 1];
  return {
    reps: targetReps ?? from?.reps,
    weightKg: from?.weightKg,
    durationSec: from?.durationSec,
    distanceKm: from?.distanceKm,
  };
}

export async function addSets(workoutId: string, items: RoutineItem[], data: Data, startPosition = 0) {
  let position = startPosition;
  for (const item of items) {
    const sessions = data.sessions.get(item.exerciseId);
    const count = item.sets || sessions?.[sessions.length - 1]?.sets.length || 3;
    for (let i = 0; i < count; i++) {
      await save(db.sets, {
        ...prefill(sessions, i, item.targetReps),
        id: newId(),
        workoutId,
        exerciseId: item.exerciseId,
        position: position++,
        done: false,
        updatedAt: 0,
      });
    }
  }
}

export async function startWorkout(name: string, items: RoutineItem[], data: Data, routineId?: string) {
  const id = newId();
  const startedAt = Date.now();
  await save(db.workouts, { id, name, routineId, startedAt, updatedAt: startedAt });
  await addSets(id, items, data);
  location.hash = `#/workout/${id}`;
}
