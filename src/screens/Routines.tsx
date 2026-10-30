import { useState } from 'react';
import { db, newId, patch, remove, save } from '../db';
import type { RoutineItem } from '../types';
import { startWorkout, useReady } from '../ui/data';
import { NumberField } from '../ui/NumberField';
import { Picker } from '../ui/Picker';

export function Routines() {
  const data = useReady();
  const create = async () => {
    const id = newId();
    await save(db.routines, { id, name: 'New routine', items: [], updatedAt: 0 });
    location.hash = `#/routine/${id}`;
  };
  return (
    <div className="pad stack-s">
      <h1>Routines</h1>
      {data.routines.length === 0 && <p className="muted">Build a routine, then start it with one tap.</p>}
      {data.routines.map((r) => (
        <a key={r.id} className="row-button" href={`#/routine/${r.id}`}>
          <span>{r.name}</span>
          <small className="muted">
            {r.items.length ? r.items.map((i) => data.exercise(i.exerciseId).name).slice(0, 3).join(', ') : 'No exercises yet'}
            {r.items.length > 3 ? ` +${r.items.length - 3}` : ''}
          </small>
        </a>
      ))}
      <button className="primary" onClick={() => void create()}>New routine</button>
    </div>
  );
}

export function RoutineEdit({ id }: { id: string }) {
  const data = useReady();
  const routine = data.routines.find((r) => r.id === id);
  const [picking, setPicking] = useState(false);

  if (!routine) {
    return (
      <div className="pad stack">
        <p className="muted">This routine no longer exists.</p>
        <a className="ghost" href="#/routines">Back to Routines</a>
      </div>
    );
  }

  const setItems = (items: RoutineItem[]) => void patch(db.routines, id, { items });
  const update = (i: number, fields: Partial<RoutineItem>) =>
    setItems(routine.items.map((item, n) => (n === i ? { ...item, ...fields } : item)));
  const move = (i: number, by: number) => {
    const items = [...routine.items];
    const [item] = items.splice(i, 1);
    items.splice(i + by, 0, item);
    setItems(items);
  };

  return (
    <div className="pad stack">
      <header className="workout-head">
        <a className="ghost" href="#/routines">Back</a>
        <button
          className="primary small"
          disabled={!routine.items.length || data.workouts.some((w) => !w.finishedAt)}
          onClick={() => void startWorkout(routine.name, routine.items, data, routine.id)}
        >
          Start
        </button>
      </header>
      <input
        className="title-input"
        aria-label="Routine name"
        defaultValue={routine.name}
        onBlur={(e) => {
          const name = e.target.value.trim();
          if (name && name !== routine.name) void patch(db.routines, id, { name });
        }}
      />
      {data.workouts.some((w) => !w.finishedAt) && <p className="muted">Finish your current workout to start this one.</p>}

      {routine.items.map((item, i) => (
        <section key={`${item.exerciseId}-${i}`} className="card stack-s">
          <div className="card-head">
            <a className="exercise-name" href={`#/exercise/${encodeURIComponent(item.exerciseId)}`}>{data.exercise(item.exerciseId).name}</a>
            <button className="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="icon" aria-label="Move down" disabled={i === routine.items.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="icon" aria-label="Remove" onClick={() => setItems(routine.items.filter((_, n) => n !== i))}>×</button>
          </div>
          <div className="field-row">
            <label>Sets
              <NumberField label="Sets" value={item.sets} onCommit={(v) => update(i, { sets: Math.max(1, v ?? 1) })} />
            </label>
            {['weight', 'bodyweight'].includes(data.exercise(item.exerciseId).kind) && (
              <label>Target reps
                <NumberField label="Target reps" value={item.targetReps} onCommit={(v) => update(i, { targetReps: v })} />
              </label>
            )}
          </div>
        </section>
      ))}

      <button className="ghost wide" onClick={() => setPicking(true)}>Add exercise</button>
      <button
        className="danger wide"
        onClick={() => {
          if (!confirm(`Delete ${routine.name}?`)) return;
          void remove(db.routines, id).then(() => (location.hash = '#/routines'));
        }}
      >
        Delete routine
      </button>

      {picking && (
        <Picker
          onClose={() => setPicking(false)}
          onPick={(exerciseId) => {
            setPicking(false);
            setItems([...routine.items, { exerciseId, sets: 3, targetReps: data.exercise(exerciseId).kind === 'weight' ? 10 : undefined }]);
          }}
        />
      )}
    </div>
  );
}
