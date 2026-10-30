import libraryData from '../data/exercises.json';
import type { CustomExercise, Exercise } from '../types';

export const LIBRARY = libraryData as Exercise[];

const IMAGE_ROOT = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export const imageUrl = (path: string) => IMAGE_ROOT + path.split('/').map(encodeURIComponent).join('/');

export const GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'] as const;
export type Group = (typeof GROUPS)[number];

const GROUP_OF: Record<string, Group> = {
  chest: 'Chest',
  lats: 'Back',
  'middle back': 'Back',
  'lower back': 'Back',
  traps: 'Back',
  shoulders: 'Shoulders',
  neck: 'Shoulders',
  biceps: 'Arms',
  triceps: 'Arms',
  forearms: 'Arms',
  quadriceps: 'Legs',
  hamstrings: 'Legs',
  glutes: 'Legs',
  calves: 'Legs',
  adductors: 'Legs',
  abductors: 'Legs',
  abdominals: 'Core',
};

export const groupOf = (muscle: string): Group | undefined => GROUP_OF[muscle.toLowerCase()];

export const MUSCLES = Object.keys(GROUP_OF);

export const fromCustom = (c: CustomExercise): Exercise => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  primary: c.primary,
  secondary: [],
  equipment: c.equipment ?? '',
  level: '',
  mechanic: '',
  instructions: c.notes ? [c.notes] : [],
  images: [],
  custom: true,
});

export function exerciseMap(custom: CustomExercise[]) {
  const map = new Map<string, Exercise>();
  for (const e of LIBRARY) map.set(e.id, e);
  for (const c of custom) if (!c.deleted) map.set(c.id, fromCustom(c));
  return map;
}

export const unknownExercise = (id: string): Exercise => ({
  id,
  name: 'Unknown exercise',
  kind: 'weight',
  primary: [],
  secondary: [],
  equipment: '',
  level: '',
  mechanic: '',
  instructions: [],
  images: [],
});
