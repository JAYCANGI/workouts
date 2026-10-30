import type { Workout } from '../types';
import { useReady } from '../ui/data';

export function WorkoutRow({ workout }: { workout: Workout }) {
  const data = useReady();
  const sets = data.sets.filter((s) => s.workoutId === workout.id && s.done);
  const exercises = new Set(sets.map((s) => s.exerciseId)).size;
  const minutes = workout.finishedAt ? Math.round((workout.finishedAt - workout.startedAt) / 60000) : 0;
  return (
    <a className="row-button" href={`#/workout/${workout.id}`}>
      <span>{workout.name}</span>
      <small className="muted">
        {new Date(workout.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {exercises} exercises · {sets.length} sets · {minutes} min
      </small>
    </a>
  );
}

export function History() {
  const data = useReady();
  const finished = data.workouts.filter((w) => w.finishedAt);
  return (
    <div className="pad stack-s">
      <h1>History</h1>
      {finished.length === 0 && <p className="muted">Finished workouts will appear here.</p>}
      {finished.map((w) => <WorkoutRow key={w.id} workout={w} />)}
    </div>
  );
}
