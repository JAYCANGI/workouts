import { useMemo, useState } from 'react';
import { db, newId, save } from '../db';
import { GROUPS, groupOf, MUSCLES, type Group } from '../lib/library';
import type { Exercise, Kind } from '../types';
import { useReady } from './data';

const PAGE = 50;

const KIND_LABEL: Record<Kind, string> = {
  weight: 'Weights',
  bodyweight: 'Bodyweight',
  timed: 'Timed hold',
  cardio: 'Cardio',
};

export function Picker({ onPick, onClose }: { onPick(id: string): void; onClose(): void }) {
  const data = useReady();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<Group | 'Cardio' | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = [...data.exercises.values()].filter((e) => {
      if (group === 'Cardio' && e.kind !== 'cardio') return false;
      if (group && group !== 'Cardio' && !e.primary.some((m) => groupOf(m) === group)) return false;
      const name = e.name.toLowerCase();
      return words.every((w) => name.includes(w));
    });
    const used = (e: Exercise) => data.sessions.get(e.id)?.length ?? 0;
    return matches.sort((a, b) => used(b) - used(a) || a.name.localeCompare(b.name));
  }, [data, query, group]);

  if (creating) return <CreateExercise name={query} onCreated={onPick} onCancel={() => setCreating(false)} />;

  return (
    <div className="sheet" role="dialog" aria-label="Choose an exercise">
      <header className="sheet-head">
        <input
          type="search"
          placeholder="Search 870+ exercises"
          aria-label="Search exercises"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
        />
        <button className="ghost" onClick={onClose}>Close</button>
      </header>
      <div className="chips">
        {[...GROUPS, 'Cardio' as const].map((g) => (
          <button key={g} className={group === g ? 'chip on' : 'chip'} aria-pressed={group === g} onClick={() => { setGroup(group === g ? null : g); setLimit(PAGE); }}>
            {g}
          </button>
        ))}
      </div>
      <ul className="pick-list">
        {list.slice(0, limit).map((e) => (
          <li key={e.id}>
            <button className="pick" onClick={() => onPick(e.id)}>
              <span>{e.name}</span>
              <small className="muted">
                {[e.primary[0], e.equipment].filter(Boolean).join(' · ')}
                {data.sessions.has(e.id) ? ' · used' : ''}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {list.length > limit && <button className="ghost wide" onClick={() => setLimit(limit + PAGE)}>Show more ({list.length - limit})</button>}
      {list.length === 0 && <p className="muted pad">No matches.</p>}
      <button className="ghost wide" onClick={() => setCreating(true)}>Create your own exercise</button>
    </div>
  );
}

function CreateExercise({ name: initial, onCreated, onCancel }: { name: string; onCreated(id: string): void; onCancel(): void }) {
  const [name, setName] = useState(initial);
  const [kind, setKind] = useState<Kind>('weight');
  const [muscle, setMuscle] = useState('chest');

  const create = async () => {
    const id = `custom-${newId()}`;
    await save(db.customExercises, { id, name: name.trim(), kind, primary: kind === 'cardio' ? [] : [muscle], updatedAt: 0 });
    onCreated(id);
  };

  return (
    <div className="sheet" role="dialog" aria-label="Create exercise">
      <div className="pad stack">
        <h2>New exercise</h2>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Type
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {Object.entries(KIND_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        {kind !== 'cardio' && (
          <label>Main muscle
            <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
              {MUSCLES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}
        <button className="primary" disabled={!name.trim()} onClick={() => void create()}>Create and add</button>
        <button className="ghost" onClick={onCancel}>Back</button>
      </div>
    </div>
  );
}
