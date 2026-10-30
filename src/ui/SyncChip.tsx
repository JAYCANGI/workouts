import { useSyncExternalStore } from 'react';
import { signIn } from '../lib/sync/google';
import { syncNow, syncStore } from '../lib/sync/engine';

export const useSync = () => useSyncExternalStore(syncStore.subscribe, syncStore.get);

export async function connectAndSync() {
  await signIn();
  await syncNow();
}

/** Appears only when sync needs a tap. Logging keeps working either way. */
export function SyncChip() {
  const sync = useSync();
  if (sync.status !== 'reconnect') return null;
  return (
    <button className="sync-banner" onClick={() => void connectAndSync().catch(() => undefined)}>
      Your workouts are saved here. Tap to reconnect Google and sync.
    </button>
  );
}
