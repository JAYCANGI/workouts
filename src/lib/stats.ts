import type { Exercise, Kind, Workout, WorkoutSet } from '../types';

export interface Session {
  workoutId: string;
  at: number;
  sets: WorkoutSet[];
}

/** Completed sets of finished workouts, grouped per exercise, oldest session first. */
export function sessionsByExercise(workouts: Workout[], sets: WorkoutSet[]) {
  const finished = new Map(workouts.filter((w) => w.finishedAt && !w.deleted).map((w) => [w.id, w]));
  const grouped = new Map<string, Map<string, WorkoutSet[]>>();
  for (const s of sets) {
    if (s.deleted || !s.done || !finished.has(s.workoutId)) continue;
    const byWorkout = grouped.get(s.exerciseId) ?? new Map<string, WorkoutSet[]>();
    grouped.set(s.exerciseId, byWorkout);
    byWorkout.set(s.workoutId, [...(byWorkout.get(s.workoutId) ?? []), s]);
  }
  const result = new Map<string, Session[]>();
  for (const [exerciseId, byWorkout] of grouped) {
    const sessions = [...byWorkout].map(([workoutId, rows]) => ({
      workoutId,
      at: finished.get(workoutId)!.startedAt,
      sets: rows.sort((a, b) => a.position - b.position),
    }));
    result.set(exerciseId, sessions.sort((a, b) => a.at - b.at));
  }
  return result;
}

/** Epley estimate. Above 12 reps the estimate is too unreliable to use. */
export function e1rm(weightKg?: number, reps?: number) {
  if (!weightKg || !reps || reps > 12) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

const max = (values: number[]) => values.reduce((a, b) => Math.max(a, b), 0);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export interface Metric {
  key: string;
  label: string;
  unit: string;
  of: (s: Session) => number;
  /** Counts toward personal records. */
  record?: boolean;
}

export const METRICS: Record<Kind, Metric[]> = {
  weight: [
    { key: 'e1rm', label: 'Est. 1RM', unit: 'kg', record: true, of: (s) => max(s.sets.map((x) => e1rm(x.weightKg, x.reps))) },
    { key: 'top', label: 'Top weight', unit: 'kg', record: true, of: (s) => max(s.sets.map((x) => x.weightKg ?? 0)) },
    { key: 'volume', label: 'Volume', unit: 'kg', of: (s) => sum(s.sets.map((x) => (x.weightKg ?? 0) * (x.reps ?? 0))) },
  ],
  bodyweight: [
    { key: 'best', label: 'Best set', unit: 'reps', record: true, of: (s) => max(s.sets.map((x) => x.reps ?? 0)) },
    { key: 'total', label: 'Total reps', unit: 'reps', of: (s) => sum(s.sets.map((x) => x.reps ?? 0)) },
    { key: 'added', label: 'Added weight', unit: 'kg', record: true, of: (s) => max(s.sets.map((x) => x.weightKg ?? 0)) },
  ],
  timed: [
    { key: 'hold', label: 'Longest', unit: 's', record: true, of: (s) => max(s.sets.map((x) => x.durationSec ?? 0)) },
    { key: 'total', label: 'Total time', unit: 's', of: (s) => sum(s.sets.map((x) => x.durationSec ?? 0)) },
  ],
  cardio: [
    { key: 'distance', label: 'Distance', unit: 'km', record: true, of: (s) => sum(s.sets.map((x) => x.distanceKm ?? 0)) },
    { key: 'duration', label: 'Duration', unit: 'min', record: true, of: (s) => sum(s.sets.map((x) => x.durationSec ?? 0)) / 60 },
    {
      key: 'pace',
      label: 'Pace',
      unit: 'min/km',
      of: (s) => {
        const km = sum(s.sets.map((x) => x.distanceKm ?? 0));
        return km ? sum(s.sets.map((x) => x.durationSec ?? 0)) / 60 / km : 0;
      },
    },
  ],
};

export interface RecordEvent {
  exerciseId: string;
  workoutId: string;
  at: number;
  label: string;
  value: number;
  unit: string;
}

/** A session sets a record only by beating an earlier one, so a first session never counts. */
export function recordEvents(exerciseId: string, kind: Kind, sessions: Session[]) {
  const events: RecordEvent[] = [];
  for (const metric of METRICS[kind].filter((m) => m.record)) {
    let best = 0;
    sessions.forEach((session, i) => {
      const value = metric.of(session);
      if (value > best) {
        if (i > 0 && best > 0) {
          events.push({ exerciseId, workoutId: session.workoutId, at: session.at, label: metric.label, value, unit: metric.unit });
        }
        best = value;
      }
    });
  }
  return events;
}

export const bestOf = (metric: Metric, sessions: Session[]) => max(sessions.map(metric.of));

export const roundKg = (kg: number) => Math.round(kg / 2.5) * 2.5;

export const trim = (n: number, digits = 1) => String(Number(n.toFixed(digits)));

export function formatSet(kind: Kind, s: Partial<WorkoutSet>) {
  switch (kind) {
    case 'weight':
      return `${s.weightKg ?? 0} kg × ${s.reps ?? 0}`;
    case 'bodyweight':
      return s.weightKg ? `+${s.weightKg} kg × ${s.reps ?? 0}` : `${s.reps ?? 0} reps`;
    case 'timed':
      return s.weightKg ? `+${s.weightKg} kg, ${s.durationSec ?? 0} s` : `${s.durationSec ?? 0} s`;
    case 'cardio':
      return `${trim((s.durationSec ?? 0) / 60)} min, ${s.distanceKm ?? 0} km`;
  }
}

const STEP_KG = 2.5;

/** Next-session advice from past sessions. Rules only: returns undefined when there is nothing useful to say. */
export function progressionHint(exercise: Exercise, sessions: Session[], targetReps?: number): string | undefined {
  const last = sessions[sessions.length - 1];
  if (!last) return undefined;
  const prev = sessions[sessions.length - 2];

  if (exercise.kind === 'weight') {
    const top = (s: Session) => max(s.sets.map((x) => x.weightKg ?? 0));
    const target = targetReps ?? 10;
    const hit = (s: Session) => s.sets.filter((x) => (x.weightKg ?? 0) === top(s)).every((x) => (x.reps ?? 0) >= target);
    const weight = top(last);
    if (!weight) return undefined;
    if (sessions.length >= 5) {
      const score = (s: Session) => max(s.sets.map((x) => e1rm(x.weightKg, x.reps)));
      const recent = sessions.slice(-4);
      const before = score(sessions[sessions.length - 5]);
      if (before > 0 && max(recent.map(score)) <= before) {
        return `Stalled for 4 sessions. Try ${roundKg(weight * 0.9)} kg and build back up.`;
      }
    }
    if (hit(last) && prev && top(prev) === weight && hit(prev)) {
      return `Hit ${target} reps twice at ${weight} kg. Try ${weight + STEP_KG} kg.`;
    }
    if (last.sets.filter((x) => x.weightKg === weight).every((x) => (x.reps ?? 0) >= target + 2)) {
      return `Well past ${target} reps at ${weight} kg. Try ${weight + STEP_KG} kg.`;
    }
    if (!hit(last)) return `Aim for ${target} reps on every set at ${weight} kg.`;
    return `Hit ${target} reps at ${weight} kg. Repeat it once more, then add weight.`;
  }

  if (exercise.kind === 'bodyweight') {
    const target = targetReps ?? 12;
    const hit = (s: Session) => s.sets.every((x) => (x.reps ?? 0) >= target);
    if (hit(last) && prev && hit(prev)) return `Hit ${target} reps twice. Add 1–2 reps or ${STEP_KG} kg.`;
    return `Aim for ${target} reps on every set.`;
  }

  if (exercise.kind === 'timed') {
    const best = max(last.sets.map((x) => x.durationSec ?? 0));
    return best ? `Last best was ${best} s. Try ${best + 5} s.` : undefined;
  }

  const km = sum(last.sets.map((x) => x.distanceKm ?? 0));
  const min = sum(last.sets.map((x) => x.durationSec ?? 0)) / 60;
  return km ? `Last time: ${trim(km, 2)} km in ${trim(min)} min. Try a little further or faster.` : undefined;
}
