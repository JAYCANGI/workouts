import type { Exercise, Routine, RoutineItem, Workout, WorkoutSet } from '../types';
import { GROUPS, groupOf, type Group } from './library';
import { e1rm, sessionsByExercise } from './stats';

const DAY = 86_400_000;

export interface GroupLoad {
  group: Group;
  daysSince: number | null;
  weeklySets: number;
}

const groupsOf = (e: Exercise | undefined, field: 'primary' | 'secondary') =>
  [...new Set((e?.[field] ?? []).map(groupOf).filter((g): g is Group => !!g))];

/** Secondary muscles count as half a set. Cardio does not load a muscle group. */
export function groupLoads(workouts: Workout[], sets: WorkoutSet[], exercises: Map<string, Exercise>, now: number): GroupLoad[] {
  const started = new Map(workouts.filter((w) => w.finishedAt && !w.deleted).map((w) => [w.id, w.startedAt]));
  const last = new Map<Group, number>();
  const weekly = new Map<Group, number>();
  for (const s of sets) {
    const at = started.get(s.workoutId);
    const e = exercises.get(s.exerciseId);
    if (at === undefined || s.deleted || !s.done || !e || e.kind === 'cardio') continue;
    const inWeek = now - at < 7 * DAY;
    for (const g of groupsOf(e, 'primary')) {
      last.set(g, Math.max(last.get(g) ?? 0, at));
      if (inWeek) weekly.set(g, (weekly.get(g) ?? 0) + 1);
    }
    if (inWeek) for (const g of groupsOf(e, 'secondary')) weekly.set(g, (weekly.get(g) ?? 0) + 0.5);
  }
  return GROUPS.map((group) => {
    const at = last.get(group);
    return {
      group,
      daysSince: at === undefined ? null : Math.floor((now - at) / DAY),
      weeklySets: weekly.get(group) ?? 0,
    };
  });
}

// Never-trained groups rank as most overdue.
const overdue = (l: GroupLoad) => l.daysSince ?? 365;

export interface Suggestion {
  title: string;
  reason: string;
  routineId?: string;
  items: RoutineItem[];
}

const COMMON_EQUIPMENT = ['barbell', 'dumbbell', 'body only', 'machine', 'cable'];

function starterExercises(group: Group, exercises: Map<string, Exercise>) {
  return [...exercises.values()]
    .filter((e) => e.level === 'beginner' && e.mechanic === 'compound' && e.kind !== 'cardio')
    .filter((e) => COMMON_EQUIPMENT.includes(e.equipment) && groupsOf(e, 'primary').includes(group))
    .sort((a, b) => COMMON_EQUIPMENT.indexOf(a.equipment) - COMMON_EQUIPMENT.indexOf(b.equipment));
}

/** Picks the next session: a saved routine if one fits the overdue muscles, otherwise one built from the exercises you use most. */
export function suggestSession(
  workouts: Workout[],
  sets: WorkoutSet[],
  routines: Routine[],
  exercises: Map<string, Exercise>,
  now: number,
): Suggestion {
  const loads = groupLoads(workouts, sets, exercises, now);
  const ranked = [...loads].sort((a, b) => overdue(b) - overdue(a) || a.weeklySets - b.weeklySets);
  const need = new Map(loads.map((l) => [l.group, overdue(l)]));
  const hasHistory = loads.some((l) => l.daysSince !== null);
  const why = (l: GroupLoad) => (l.daysSince === null ? `${l.group} not trained yet` : `${l.group} last trained ${l.daysSince} d ago`);

  let bestRoutine: Routine | undefined;
  let bestScore = 0;
  if (hasHistory) {
    for (const routine of routines) {
      if (routine.deleted || !routine.items.length) continue;
      const groups = new Set(routine.items.flatMap((i) => groupsOf(exercises.get(i.exerciseId), 'primary')));
      if (!groups.size) continue;
      const score = [...groups].reduce((total, g) => total + (need.get(g) ?? 0), 0) / groups.size;
      if (score > bestScore) {
        bestScore = score;
        bestRoutine = routine;
      }
    }
  }
  // A routine only wins when it covers muscles that have actually rested.
  if (bestRoutine && bestScore >= 2) {
    return {
      title: bestRoutine.name,
      reason: ranked.slice(0, 2).map(why).join(', '),
      routineId: bestRoutine.id,
      items: bestRoutine.items,
    };
  }

  const focus = ranked.slice(0, 2);
  const counts = new Map<string, number>();
  for (const s of sets) if (s.done && !s.deleted) counts.set(s.exerciseId, (counts.get(s.exerciseId) ?? 0) + 1);

  const items: RoutineItem[] = [];
  for (const { group } of focus) {
    const used = [...counts.keys()]
      .filter((id) => groupsOf(exercises.get(id), 'primary').includes(group))
      .sort((a, b) => counts.get(b)! - counts.get(a)!);
    const fill = starterExercises(group, exercises).map((e) => e.id);
    const picks = [...new Set([...used, ...fill])].filter((id) => !items.some((i) => i.exerciseId === id)).slice(0, 3);
    for (const exerciseId of picks) items.push({ exerciseId, sets: 3, targetReps: 10 });
  }
  return {
    title: focus.map((f) => f.group).join(' + '),
    reason: hasHistory ? focus.map(why).join(', ') : 'A simple starting point. It adapts as you log workouts.',
    items,
  };
}

const PUSH: Group[] = ['Chest', 'Shoulders'];
const PULL: Group[] = ['Back'];

/** Short observations about the last week and any stalled lifts. */
export function insights(workouts: Workout[], sets: WorkoutSet[], exercises: Map<string, Exercise>, now: number): string[] {
  const out: string[] = [];
  const loads = groupLoads(workouts, sets, exercises, now);
  const total = (groups: Group[]) => loads.filter((l) => groups.includes(l.group)).reduce((a, l) => a + l.weeklySets, 0);
  const push = total(PUSH);
  const pull = total(PULL);
  if (push >= 6 && push > pull * 2) out.push(`Pushing ${push} sets vs pulling ${pull} this week. Add some back work.`);
  if (pull >= 6 && pull > push * 2) out.push(`Pulling ${pull} sets vs pushing ${push} this week. Add some chest or shoulder work.`);

  for (const [id, sessions] of sessionsByExercise(workouts, sets)) {
    const e = exercises.get(id);
    if (e?.kind !== 'weight' || sessions.length < 5 || now - sessions[sessions.length - 1].at > 21 * DAY) continue;
    const score = (i: number) => Math.max(0, ...sessions[i].sets.map((s) => e1rm(s.weightKg, s.reps)));
    const baseline = score(sessions.length - 5);
    const recent = [1, 2, 3, 4].map((n) => score(sessions.length - n));
    if (baseline > 0 && Math.max(...recent) <= baseline) out.push(`${e.name} hasn't improved in 4 sessions.`);
  }
  return out.slice(0, 3);
}
