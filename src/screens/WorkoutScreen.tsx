import { useMemo, useState } from 'react';
import { db, newId, patch, remove, save } from '../db';
import { formatSet, progressionHint, recordEvents, trim, type Session } from '../lib/stats';
import type { Exercise, WorkoutSet } from '../types';
import { addSets, prefill, useReady } from '../ui/data';
import { NumberField } from '../ui/NumberField';
import { Picker } from '../ui/Picker';

export function WorkoutScreen({ id }: { id: string }) {
  const data = useReady();
  const workout = data.workouts.find((w) => w.id === id);
  const [picking, setPicking] = useState(false);
  const sets = useMemo(() => data.sets.filter((s) => s.workoutId === id), [data.sets, id]);
  const routine = data.routines.find((r) => r.id === workout?.routineId);

  const records = useMemo(() => {
    if (!workout?.finishedAt) return [];
    const ids = new Set(sets.map((s) => s.exerciseId));
    return [...ids].flatMap((exId) =>
      recordEvents(exId, data.exercise(exId).kind, data.sessions.get(exId) ?? [])
        .filter((e) => e.workoutId === id),
    );
  }, [data, sets, workout?.finishedAt, id]); // eslint-disable-line

  if (!workout) {
    return (
      <div className="pad stack">
        <p className="muted">This workout no longer exists.</p>
        <a className="ghost" href="#/">Back to Train</a>
      </div>
    );
  }

  const order = [...new Set(sets.map((s) => s.exerciseId))];
  const nextPosition = sets.reduce((p, s) => Math.max(p, s.position + 1), 0);

  const finish = async () => {
    const undone = sets.filter((s) => !s.done);
    const doneCount = sets.length - undone.length;
    if (doneCount === 0) {
      if (!confirm('No sets are ticked, so this workout will be discarded. Continue?')) return;
      await discard();
      return;
    }
    if (undone.length && !confirm(`Finish and remove ${undone.length} unticked set${undone.length > 1 ? 's' : ''}?`)) return;
    for (const s of undone) await remove(db.sets, s.id);
    await patch(db.workouts, id, { finishedAt: Date.now() });
    window.scrollTo(0, 0);
  };

  const discard = async () => {
    for (const s of sets) await remove(db.sets, s.id);
    await remove(db.workouts, id);
    location.hash = '#/';
  };

  const saveAsRoutine = async () => {
    const name = prompt('Routine name', workout.name);
    if (!name?.trim()) return;
    const routineId = newId();
    await save(db.routines, {
      id: routineId,
      name: name.trim(),
      updatedAt: 0,
      items: order.map((exerciseId) => ({ exerciseId, sets: sets.filter((s) => s.exerciseId === exerciseId).length })),
    });
    location.hash = `#/routine/${routineId}`;
  };

  return (
    <div className="pad stack workout">
      <header className="workout-head">
        <a className="ghost" href={workout.finishedAt ? '#/history' : '#/'}>Back</a>
        {!workout.finishedAt && <button className="primary small" onClick={() => void finish()}>Finish</button>}
      </header>
      <input
        className="title-input"
        aria-label="Workout name"
        defaultValue={workout.name}
        onBlur={(e) => {
          const name = e.target.value.trim();
          if (name && name !== workout.name) void patch(db.workouts, id, { name });
        }}
      />
      {workout.finishedAt && (
        <p className="muted">
          {new Date(workout.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {Math.round((workout.finishedAt - workout.startedAt) / 60000)} min
        </p>
      )}

      {records.length > 0 && (
        <section className="card records stack-s">
          <h2>New records</h2>
          {records.map((r) => (
            <p key={r.exerciseId + r.label}>
              <strong>{data.exercise(r.exerciseId).name}</strong>: {r.label} {trim(r.value)} {r.unit}
            </p>
          ))}
        </section>
      )}

      {order.map((exerciseId) => (
        <ExerciseCard
          key={exerciseId}
          exercise={data.exercise(exerciseId)}
          sets={sets.filter((s) => s.exerciseId === exerciseId)}
          history={(data.sessions.get(exerciseId) ?? []).filter((s) => s.workoutId !== id && s.at < workout.startedAt)}
          targetReps={routine?.items.find((i) => i.exerciseId === exerciseId)?.targetReps}
          workoutId={id}
          nextPosition={nextPosition}
          finished={!!workout.finishedAt}
        />
      ))}

      <button className="ghost wide" onClick={() => setPicking(true)}>Add exercise</button>

      {workout.finishedAt ? (
        <>
          <button className="ghost wide" onClick={() => void saveAsRoutine()}>Save as routine</button>
          <button className="danger wide" onClick={() => { if (confirm('Delete this workout?')) void discard(); }}>Delete workout</button>
        </>
      ) : (
        <button className="danger wide" onClick={() => { if (confirm('Discard this workout?')) void discard(); }}>Discard workout</button>
      )}

      {picking && (
        <Picker
          onClose={() => setPicking(false)}
          onPick={(exerciseId) => {
            setPicking(false);
            void addSets(id, [{ exerciseId, sets: 0 }], data, nextPosition);
          }}
        />
      )}
    </div>
  );
}

function ExerciseCard(props: {
  exercise: Exercise;
  sets: WorkoutSet[];
  history: Session[];
  targetReps?: number;
  workoutId: string;
  nextPosition: number;
  finished: boolean;
}) {
  const { exercise, sets, history, targetReps, workoutId, nextPosition, finished } = props;
  const last = history[history.length - 1];
  const hint = finished ? undefined : progressionHint(exercise, history, targetReps);

  const addSet = () => {
    const previous = sets[sets.length - 1];
    void save(db.sets, {
      ...(previous
        ? { reps: previous.reps, weightKg: previous.weightKg, durationSec: previous.durationSec, distanceKm: previous.distanceKm }
        : prefill(history, 0, targetReps)),
      id: newId(),
      workoutId,
      exerciseId: exercise.id,
      position: nextPosition,
      done: finished,
      updatedAt: 0,
    });
  };

  const removeExercise = () => {
    if (!confirm(`Remove ${exercise.name} from this workout?`)) return;
    for (const s of sets) void remove(db.sets, s.id);
  };

  return (
    <section className="card stack-s">
      <div className="card-head">
        <a className="exercise-name" href={`#/exercise/${encodeURIComponent(exercise.id)}`}>{exercise.name}</a>
        <button className="icon" aria-label={`Remove ${exercise.name}`} onClick={removeExercise}>×</button>
      </div>
      {hint && <p className="hint">{hint}</p>}
      <table className="sets">
        <thead>
          <tr>
            <th>Set</th>
            <th>Last</th>
            {columns(exercise).map((c) => <th key={c.label}>{c.label}</th>)}
            <th><span className="sr">Done</span></th>
            <th><span className="sr">Delete</span></th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s, i) => {
            const before = last?.sets[i];
            return (
              <tr key={s.id} className={s.done ? 'done' : ''}>
                <td>{i + 1}</td>
                <td className="prev">{before ? formatSet(exercise.kind, before) : '–'}</td>
                {columns(exercise).map((c) => (
                  <td key={c.label}>
                    <NumberField
                      label={`Set ${i + 1} ${c.label}`}
                      decimal={c.decimal}
                      value={c.get(s)}
                      onCommit={(v) => void patch(db.sets, s.id, c.set(v))}
                    />
                  </td>
                ))}
                <td>
                  <button
                    className={s.done ? 'tick on' : 'tick'}
                    aria-pressed={s.done}
                    aria-label={`Mark set ${i + 1} done`}
                    onClick={() => void patch(db.sets, s.id, { done: !s.done })}
                  >
                    ✓
                  </button>
                </td>
                <td>
                  <button className="icon" aria-label={`Delete set ${i + 1}`} onClick={() => void remove(db.sets, s.id)}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="ghost wide" onClick={addSet}>Add set</button>
    </section>
  );
}

interface Col {
  label: string;
  decimal?: boolean;
  get(s: WorkoutSet): number | undefined;
  set(v: number | undefined): Partial<WorkoutSet>;
}

const repsCol: Col = { label: 'Reps', get: (s) => s.reps, set: (reps) => ({ reps }) };
const kgCol = (label: string): Col => ({ label, decimal: true, get: (s) => s.weightKg, set: (weightKg) => ({ weightKg }) });

function columns(e: Exercise): Col[] {
  switch (e.kind) {
    case 'weight':
      return [kgCol('kg'), repsCol];
    case 'bodyweight':
      return [kgCol('+kg'), repsCol];
    case 'timed':
      return [kgCol('+kg'), { label: 'Sec', get: (s) => s.durationSec, set: (durationSec) => ({ durationSec }) }];
    case 'cardio':
      return [
        {
          label: 'Min',
          decimal: true,
          get: (s) => (s.durationSec === undefined ? undefined : Number((s.durationSec / 60).toFixed(2))),
          set: (min) => ({ durationSec: min === undefined ? undefined : Math.round(min * 60) }),
        },
        { label: 'km', decimal: true, get: (s) => s.distanceKm, set: (distanceKm) => ({ distanceKm }) },
      ];
  }
}
