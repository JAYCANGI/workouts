import { useEffect, useRef, useState } from 'react';
import type { Table } from 'dexie';
import { db, type SyncedTableName } from '../db';
import { disconnect, getClientId, getSheetId, preloadGoogle, setClientId, wasConnected } from '../lib/sync/google';
import { resetSheetLink, syncNow, type SyncState } from '../lib/sync/engine';
import { connectAndSync, useSync } from '../ui/SyncChip';

const TABLES: SyncedTableName[] = ['workouts', 'sets', 'routines', 'customExercises', 'bodyWeights'];

function statusText(s: SyncState) {
  switch (s.status) {
    case 'off':
      return 'Not synced yet.';
    case 'syncing':
      return 'Syncing…';
    case 'ok': {
      const at = `Last synced ${new Date(s.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}.`;
      return s.skippedRows ? `${at} ${s.skippedRows} rows in the Sheet are missing required values and were ignored.` : at;
    }
    case 'reconnect':
      return 'Google access expired. Your data is safe on this phone. Reconnect to sync.';
    case 'missing':
      return "The Google Sheet couldn't be found. It may have been deleted.";
    case 'error':
      return s.message;
  }
}

export function More() {
  const sync = useSync();
  const [clientId, setClient] = useState(getClientId);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [, refresh] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const connected = wasConnected();
  const sheetId = getSheetId();

  useEffect(() => {
    if (clientId) preloadGoogle();
  }, [clientId]);

  const connect = async () => {
    setError('');
    try {
      await connectAndSync();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.');
    }
    refresh((n) => n + 1);
  };

  const exportData = async () => {
    const dump: Record<string, unknown[]> = {};
    for (const name of TABLES) dump[name] = await db[name].toArray();
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, ...dump })], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `workouts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Backup downloaded.');
  };

  const importData = async (f: File) => {
    try {
      const dump = JSON.parse(await f.text());
      if (dump?.version !== 1) throw new Error();
      const rowsOk = TABLES.every((t) => Array.isArray(dump[t]) && dump[t].every((r: { id?: unknown; updatedAt?: unknown }) => typeof r?.id === 'string' && typeof r.updatedAt === 'number'));
      if (!rowsOk) throw new Error();
      if (!confirm('Merge this backup into your data? Entries with the same ID are replaced.')) return;
      await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
        for (const t of TABLES) await (db[t] as Table<unknown, string>).bulkPut(dump[t]);
      });
      setMessage('Backup restored.');
    } catch {
      setMessage("That file isn't a backup from this app.");
    }
  };

  return (
    <div className="pad stack">
      <h1>More</h1>

      <section className="card stack-s">
        <h2>Google Sheets sync</h2>
        <p role="status" className="muted">{statusText(sync)}</p>
        {error && <p role="alert" className="error">{error}</p>}
        <label>Google client ID
          <input
            value={clientId}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="….apps.googleusercontent.com"
            onChange={(e) => {
              setClient(e.target.value);
              setClientId(e.target.value);
            }}
          />
        </label>
        {(!connected || sync.status === 'reconnect') && (
          <button className="primary" disabled={!clientId} onClick={() => void connect()}>
            {connected ? 'Reconnect Google' : 'Connect Google'}
          </button>
        )}
        {connected && sync.status !== 'reconnect' && (
          <button className="primary" disabled={sync.status === 'syncing'} onClick={() => void syncNow()}>Sync now</button>
        )}
        {sync.status === 'missing' && (
          <button className="ghost" onClick={() => void resetSheetLink().then(syncNow)}>Create a new Sheet from this phone's data</button>
        )}
        {sheetId && (
          <a className="ghost" href={`https://docs.google.com/spreadsheets/d/${sheetId}`} target="_blank" rel="noreferrer">Open my Sheet</a>
        )}
        {connected && (
          <button className="ghost" onClick={() => { disconnect(); refresh((n) => n + 1); }}>Disconnect</button>
        )}
      </section>

      <section className="card stack-s">
        <h2>Backup file</h2>
        <p className="muted">A copy of everything on this phone, separate from Google.</p>
        <button className="ghost" onClick={() => void exportData()}>Download backup</button>
        <button className="ghost" onClick={() => file.current?.click()}>Restore from backup</button>
        <input
          ref={file}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importData(f);
            e.target.value = '';
          }}
        />
        {message && <p role="status">{message}</p>}
      </section>

      <p className="muted small">Exercise data and images: free-exercise-db (public domain). Progression hints and estimates are general guidance, not medical or coaching advice.</p>
    </div>
  );
}
