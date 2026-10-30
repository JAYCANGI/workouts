import { useEffect, useState } from 'react';
import { DataProvider, useData } from './ui/data';
import { SyncChip } from './ui/SyncChip';
import { ExerciseScreen } from './screens/ExerciseScreen';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { More } from './screens/More';
import { Progress } from './screens/Progress';
import { RoutineEdit, Routines } from './screens/Routines';
import { WorkoutScreen } from './screens/WorkoutScreen';

function useHash() {
  const [hash, setHash] = useState(() => location.hash.slice(2));
  useEffect(() => {
    const onChange = () => {
      setHash(location.hash.slice(2));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

const TABS = [
  { path: '', label: 'Train' },
  { path: 'routines', label: 'Routines' },
  { path: 'history', label: 'History' },
  { path: 'progress', label: 'Progress' },
  { path: 'more', label: 'More' },
];

function Routes({ route }: { route: string }) {
  const data = useData();
  if (!data) return <p className="muted pad">Loading…</p>;
  const [screen, id] = route.split('/');
  switch (screen) {
    case 'workout':
      return <WorkoutScreen key={id} id={id} />;
    case 'routines':
      return <Routines />;
    case 'routine':
      return <RoutineEdit key={id} id={id} />;
    case 'history':
      return <History />;
    case 'progress':
      return <Progress />;
    case 'exercise':
      return <ExerciseScreen key={id} id={decodeURIComponent(id)} />;
    case 'more':
      return <More />;
    default:
      return <Home />;
  }
}

export function App() {
  const route = useHash();
  const top = route.split('/')[0];
  const active = top === 'routine' ? 'routines' : top === 'workout' || top === 'exercise' ? null : top;
  return (
    <DataProvider>
      <SyncChip />
      <main>
        <Routes route={route} />
      </main>
      {active !== null && (
        <nav className="tabs" aria-label="Main">
          {TABS.map((t) => (
            <a key={t.label} href={`#/${t.path}`} className={active === t.path ? 'on' : ''} aria-current={active === t.path ? 'page' : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
      )}
    </DataProvider>
  );
}
