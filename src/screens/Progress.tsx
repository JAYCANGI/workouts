import { useMemo, useState } from 'react';
import { db, newId, remove, save } from '../db';
import { METRICS, recordEvents, trim } from '../lib/stats';
import { groupLoads } from '../lib/suggest';
import { BarList, LineChart } from '../ui/Charts';
import { useReady } from '../ui/data';
import { NumberField } from '../ui/NumberField';

export function Progress() {
  const data = useReady();
  const logged = useMemo(
    () => [...data.sessions.keys()].sort((a, b) => data.exercise(a).name.localeCompare(data.exercise(b).name)),
    [data],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState<string | null>(null);
  const exerciseId = picked && data.sessions.has(picked) ? picked : logged[0];
  const exercise = exerciseId ? data.exercise(exerciseId) : null;
  const metrics = exercise ? METRICS[exercise.kind] : [];
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const sessions = exerciseId ? data.sessions.get(exerciseId) ?? [] : [];

  const records = useMemo(
    () =>
      [...data.sessions]
        .flatMap(([id, s]) => recordEvents(id, data.exercise(id).kind, s))
        .sort((a, b) => b.at - a.at)
        .slice(0, 8),
    [data],
  );
  const loads = useMemo(() => groupLoads(data.workouts, data.sets, data.exercises, Date.now()), [data]);

  return (
    <div className="pad stack">
      <h1>Progress</h1>

      <section className="card stack-s">
        <h2>Exercise</h2>
        {!exercise && <p className="muted">Finish a workout to see your trends.</p>}
        {exercise && metric && (
          <>
            <select aria-label="Exercise" value={exerciseId} onChange={(e) => { setPicked(e.target.value); setMetricKey(null); }}>
              {logged.map((id) => <option key={id} value={id}>{data.exercise(id).name}</option>)}
            </select>
            <div className="chips flush">
              {metrics.map((m) => (
                <button key={m.key} className={m.key === metric.key ? 'chip on' : 'chip'} aria-pressed={m.key === metric.key} onClick={() => setMetricKey(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
            <LineChart
              label={`${exercise.name} ${metric.label}`}
              unit={metric.unit}
              points={sessions.map((s) => ({ x: s.at, y: metric.of(s) })).filter((p) => p.y > 0)}
            />
          </>
        )}
      </section>

      <section className="card stack-s">
        <h2>Sets this week</h2>
        <BarList unit="sets" rows={loads.map((l) => ({ label: l.group, value: l.weeklySets }))} />
      </section>

      <BodyWeightCard />

      <section className="card stack-s">
        <h2>Recent records</h2>
        {records.length === 0 && <p className="muted">Beat a previous best and it will show up here.</p>}
        {records.map((r) => (
          <p key={`${r.exerciseId}${r.workoutId}${r.label}`}>
            <strong>{data.exercise(r.exerciseId).name}</strong>: {r.label} {trim(r.value)} {r.unit}
            <small className="muted"> · {new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small>
          </p>
        ))}
      </section>
    </div>
  );
}

const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function BodyWeightCard() {
  const data = useReady();
  const [kg, setKg] = useState<number | undefined>();
  const [date, setDate] = useState(today);
  const entries = data.bodyWeights;

  const add = async () => {
    if (!kg) return;
    const existing = entries.find((e) => e.date === date);
    await save(db.bodyWeights, { id: existing?.id ?? newId(), date, kg, updatedAt: 0 });
    setKg(undefined);
  };

  return (
    <section className="card stack-s">
      <h2>Body weight</h2>
      <div className="field-row">
        <label>Kg<NumberField label="Body weight in kg" decimal value={kg} onCommit={setKg} /></label>
        <label>Date<input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
        <button className="primary small end" disabled={!kg} onClick={() => void add()}>Log</button>
      </div>
      <LineChart label="Body weight" unit="kg" points={entries.map((e) => ({ x: Date.parse(`${e.date}T12:00:00`), y: e.kg }))} />
      {entries.length > 0 && (
        <details>
          <summary>Edit entries</summary>
          <ul className="plain">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="card-head">
                <span>{e.date}: {e.kg} kg</span>
                <button className="icon" aria-label={`Delete ${e.date}`} onClick={() => void remove(db.bodyWeights, e.id)}>×</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
