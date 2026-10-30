import { useMemo } from 'react';
import { insights, suggestSession } from '../lib/suggest';
import { startWorkout, useReady } from '../ui/data';
import { WorkoutRow } from './History';

export function Home() {
  const data = useReady();
  const now = Date.now();
  const active = data.workouts.find((w) => !w.finishedAt);
  const suggestion = useMemo(
    () => suggestSession(data.workouts, data.sets, data.routines, data.exercises, Date.now()),
    [data],
  );
  const notes = useMemo(() => insights(data.workouts, data.sets, data.exercises, now), [data]); // eslint-disable-line
  const recent = data.workouts.filter((w) => w.finishedAt).slice(0, 3);

  return (
    <div className="pad stack">
      <h1>Train</h1>

      {active && (
        <a className="card resume" href={`#/workout/${active.id}`}>
          <strong>Resume {active.name}</strong>
          <span className="muted">Started {new Date(active.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </a>
      )}

      {!active && (
        <section className="card stack-s">
          <small className="eyebrow">Suggested next</small>
          <h2>{suggestion.title}</h2>
          <p className="muted">{suggestion.reason}</p>
          <ul className="plain">
            {suggestion.items.map((i) => (
              <li key={i.exerciseId}>
                {i.sets} × {data.exercise(i.exerciseId).name}
              </li>
            ))}
          </ul>
          <button
            className="primary"
            disabled={!suggestion.items.length}
            onClick={() => void startWorkout(suggestion.title, suggestion.items, data, suggestion.routineId)}
          >
            Start this session
          </button>
        </section>
      )}

      {notes.map((n) => <p key={n} className="note">{n}</p>)}

      {!active && (
        <section className="stack-s">
          <h2>Start</h2>
          {data.routines.map((r) => (
            <button key={r.id} className="row-button" disabled={!r.items.length} onClick={() => void startWorkout(r.name, r.items, data, r.id)}>
              <span>{r.name}</span>
              <small className="muted">{r.items.length} exercises</small>
            </button>
          ))}
          <button className="row-button" onClick={() => void startWorkout('Workout', [], data)}>
            <span>Empty workout</span>
          </button>
        </section>
      )}

      {recent.length > 0 && (
        <section className="stack-s">
          <h2>Recent</h2>
          {recent.map((w) => <WorkoutRow key={w.id} workout={w} />)}
        </section>
      )}
    </div>
  );
}
