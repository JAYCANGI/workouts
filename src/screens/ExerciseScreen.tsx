import { useEffect, useState } from 'react';
import { imageUrl } from '../lib/library';
import { bestOf, METRICS, trim } from '../lib/stats';
import { useReady } from '../ui/data';

export function ExerciseScreen({ id }: { id: string }) {
  const data = useReady();
  const exercise = data.exercise(id);
  const sessions = data.sessions.get(id) ?? [];
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  const images = exercise.images;

  // The dataset has start and end positions, so alternating them shows the movement.
  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % images.length), 1100);
    return () => clearInterval(timer);
  }, [images.length]);

  return (
    <div className="pad stack">
      <header className="workout-head">
        <button className="ghost" onClick={() => history.back()}>Back</button>
      </header>
      <h1>{exercise.name}</h1>
      {images.length > 0 && !failed && (
        <div className="demo">
          {images.map((path, i) => (
            <img
              key={path}
              className={i === frame ? 'on' : ''}
              src={imageUrl(path)}
              alt={i === 0 ? `${exercise.name} demonstration` : ''}
              onError={() => setFailed(true)}
            />
          ))}
        </div>
      )}
      {failed && <p className="note">The demo image isn't saved on this phone yet. It will load the next time you view it online.</p>}
      <p className="muted">
        {[...exercise.primary, exercise.equipment, exercise.level].filter(Boolean).join(' · ')}
      </p>
      {exercise.secondary.length > 0 && <p className="muted">Also works: {exercise.secondary.join(', ')}</p>}

      {sessions.length > 0 && (
        <section className="card stack-s">
          <h2>Your bests</h2>
          {METRICS[exercise.kind].filter((m) => m.record).map((m) => (
            <p key={m.key}>{m.label}: <strong>{trim(bestOf(m, sessions))} {m.unit}</strong></p>
          ))}
        </section>
      )}

      {exercise.instructions.length > 0 && (
        <section className="stack-s">
          <h2>How to</h2>
          <ol className="steps">
            {exercise.instructions.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </section>
      )}
    </div>
  );
}
