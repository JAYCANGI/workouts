export type Kind = 'weight' | 'bodyweight' | 'timed' | 'cardio';

export interface Synced {
  id: string;
  updatedAt: number;
  /** Soft delete: kept locally until sync has removed the row from the Sheet. */
  deleted?: 0 | 1;
}

export interface Workout extends Synced {
  name: string;
  routineId?: string;
  startedAt: number;
  finishedAt?: number;
  notes?: string;
}

export interface WorkoutSet extends Synced {
  workoutId: string;
  exerciseId: string;
  position: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  distanceKm?: number;
  done: boolean;
}

export interface RoutineItem {
  exerciseId: string;
  sets: number;
  targetReps?: number;
}

export interface Routine extends Synced {
  name: string;
  items: RoutineItem[];
}

export interface CustomExercise extends Synced {
  name: string;
  kind: Kind;
  primary: string[];
  equipment?: string;
  notes?: string;
}

export interface BodyWeight extends Synced {
  date: string; // YYYY-MM-DD
  kg: number;
}

export interface Exercise {
  id: string;
  name: string;
  kind: Kind;
  primary: string[];
  secondary: string[];
  equipment: string;
  level: string;
  mechanic: string;
  instructions: string[];
  images: string[];
  custom?: boolean;
}
