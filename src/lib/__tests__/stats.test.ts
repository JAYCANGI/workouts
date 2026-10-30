import { describe, expect, it } from 'vitest';
import type { Exercise, Workout, WorkoutSet } from '../../types';
import { e1rm, progressionHint, recordEvents, sessionsByExercise, type Session } from '../stats';
import { insights, suggestSession } from '../suggest';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 1);

const ex = (id: string, primary: string[], kind: Exercise['kind'] = 'weight'): Exercise => ({
  id, name: id, kind, primary, secondary: [], equipment: 'barbell', level: 'beginner', mechanic: 'compound', instructions: [], images: [],
});

const set = (id: string, workoutId: string, exerciseId: string, weightKg: number, reps: number): WorkoutSet => ({
  id, workoutId, exerciseId, weightKg, reps, position: 0, done: true, updatedAt: 0,
});

const session = (i: number, weight: number, reps: number[]): Session => ({
  workoutId: `w${i}`,
  at: i,
  sets: reps.map((r, n) => set(`${i}-${n}`, `w${i}`, 'bench', weight, r)),
});

const bench = ex('bench', ['chest']);

describe('e1rm', () => {
  it('uses the lifted weight for singles and ignores high-rep sets', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 3)).toBeCloseTo(110);
    expect(e1rm(100, 13)).toBe(0);
  });
});

describe('progressionHint', () => {
  it('stays quiet with no history', () => {
    expect(progressionHint(bench, [])).toBeUndefined();
  });
  it('adds weight after hitting the target twice', () => {
    const hint = progressionHint(bench, [session(1, 60, [8, 8]), session(2, 60, [8, 8])], 8);
    expect(hint).toContain('Try 62.5 kg');
  });
  it('holds weight until every set hits the target', () => {
    expect(progressionHint(bench, [session(1, 60, [8, 6])], 8)).toContain('Aim for 8 reps');
  });
  it('flags a stall with a rounded deload', () => {
    const flat = [1, 2, 3, 4, 5].map((i) => session(i, 100, [5]));
    expect(progressionHint(bench, flat, 8)).toContain('Try 90 kg');
  });
});

describe('recordEvents', () => {
  it('does not count the first session and reports real increases only', () => {
    const events = recordEvents('bench', 'weight', [session(1, 60, [5]), session(2, 60, [5]), session(3, 70, [5])]);
    expect(events.map((e) => e.workoutId)).toEqual(['w3', 'w3']);
  });
});

describe('sessionsByExercise', () => {
  it('ignores undone sets and unfinished workouts', () => {
    const workouts: Workout[] = [
      { id: 'a', name: '', startedAt: 1, finishedAt: 2, updatedAt: 0 },
      { id: 'b', name: '', startedAt: 3, updatedAt: 0 },
    ];
    const sets = [set('1', 'a', 'bench', 50, 5), { ...set('2', 'a', 'bench', 60, 5), done: false }, set('3', 'b', 'bench', 70, 5)];
    const result = sessionsByExercise(workouts, sets).get('bench')!;
    expect(result).toHaveLength(1);
    expect(result[0].sets.map((s) => s.id)).toEqual(['1']);
  });
});

describe('suggestSession', () => {
  const exercises = new Map(['chest', 'lats', 'shoulders', 'biceps', 'quadriceps', 'abdominals'].map((m) => [m, ex(m, [m])]));
  const workout = (id: string, daysAgo: number): Workout => ({ id, name: '', startedAt: NOW - daysAgo * DAY, finishedAt: NOW - daysAgo * DAY, updatedAt: 0 });

  it('gives new users a real starting session', () => {
    const s = suggestSession([], [], [], exercises, NOW);
    expect(s.items.length).toBeGreaterThan(0);
    expect(s.reason).toContain('starting point');
  });

  it('prefers the saved routine covering the most rested muscles', () => {
    const workouts = [workout('a', 1), workout('b', 9)];
    const sets = [set('1', 'a', 'chest', 50, 5), set('2', 'b', 'quadriceps', 50, 5)];
    const routines = [
      { id: 'push', name: 'Push', updatedAt: 0, items: [{ exerciseId: 'chest', sets: 3 }] },
      { id: 'legs', name: 'Legs', updatedAt: 0, items: [{ exerciseId: 'quadriceps', sets: 3 }] },
    ];
    expect(suggestSession(workouts, sets, routines, exercises, NOW).routineId).toBe('legs');
  });

  it('builds a session from overdue groups when no routine fits', () => {
    const workouts = [workout('a', 1)];
    const sets = [set('1', 'a', 'chest', 50, 5)];
    const s = suggestSession(workouts, sets, [], exercises, NOW);
    expect(s.title).not.toContain('Chest');
    expect(s.items.length).toBeGreaterThan(0);
  });
});

describe('insights', () => {
  it('flags a push and pull imbalance', () => {
    const exercises = new Map([['chest', ex('chest', ['chest'])]]);
    const workouts: Workout[] = [{ id: 'a', name: '', startedAt: NOW - DAY, finishedAt: NOW - DAY, updatedAt: 0 }];
    const sets = [1, 2, 3, 4, 5, 6].map((i) => set(String(i), 'a', 'chest', 50, 5));
    expect(insights(workouts, sets, exercises, NOW)[0]).toContain('Pushing 6');
  });
});
