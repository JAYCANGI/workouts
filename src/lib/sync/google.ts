// Google sign-in and the small part of the Sheets and Drive APIs this app uses.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'google-token';
const CLIENT_KEY = 'google-client-id';
const SHEET_TITLE = 'Workout Tracker';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void;
            error_callback?: (e: { type?: string; message?: string }) => void;
          }): { requestAccessToken(options?: { prompt?: string }): void };
        };
      };
    };
  }
}

export class AuthRequired extends Error {}
export class SheetMissing extends Error {}

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the app still works, it just won't remember this.
  }
}

export const getClientId = () => read(CLIENT_KEY) || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const setClientId = (id: string) => write(CLIENT_KEY, id.trim() || null);
export const getSheetId = () => read('sheet-id');
export const setSheetId = (id: string | null) => write('sheet-id', id);

export function getToken(): string | null {
  const raw = read(TOKEN_KEY);
  if (!raw) return null;
  try {
    const { token, expires } = JSON.parse(raw);
    return Date.now() < expires - 60_000 ? token : null;
  } catch {
    return null;
  }
}

export const wasConnected = () => !!read('google-connected');

export function disconnect() {
  write(TOKEN_KEY, null);
  write('google-connected', null);
}

function loadGis(): Promise<void> {
  if (window.google) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection.'));
    document.head.appendChild(script);
  });
}

// Loaded ahead of the tap, because a popup opened after an await can be blocked on phones.
export const preloadGoogle = () => void loadGis().catch(() => undefined);

/** Must run from a tap, otherwise the browser blocks the sign-in popup. */
export async function signIn(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error('Add your Google client ID first.');
  await loadGis();
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error ?? 'Google sign-in failed.'));
        write(TOKEN_KEY, JSON.stringify({ token: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 }));
        write('google-connected', '1');
        resolve();
      },
      error_callback: (e) => reject(new Error(e.message ?? 'Google sign-in was closed.')),
    });
    client.requestAccessToken({ prompt: wasConnected() ? '' : 'consent' });
  });
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  if (!token) throw new AuthRequired('Reconnect Google to sync.');
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  });
  if (res.status === 401) {
    write(TOKEN_KEY, null);
    throw new AuthRequired('Reconnect Google to sync.');
  }
  if (res.status === 404) throw new SheetMissing('The Google Sheet was not found.');
  if (!res.ok) throw new Error(`Google returned an error (${res.status}).`);
  return res.json();
}

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';

export interface SheetsClient {
  findSheet(): Promise<string | null>;
  createSheet(tabs: string[]): Promise<string>;
  tabTitles(id: string): Promise<string[]>;
  addTabs(id: string, tabs: string[]): Promise<void>;
  modifiedAt(id: string): Promise<number>;
  readTabs(id: string, tabs: string[]): Promise<unknown[][][]>;
  writeTabs(id: string, data: { tab: string; rows: unknown[][]; clearFrom: number }[]): Promise<void>;
}

export const googleClient: SheetsClient = {
  async findSheet() {
    // drive.file only ever lists files this app created.
    const q = encodeURIComponent(`name='${SHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
    const r = await api<{ files: { id: string }[] }>(`${DRIVE}?q=${q}&fields=files(id)&orderBy=createdTime`);
    return r.files[0]?.id ?? null;
  },
  async createSheet(tabs) {
    const r = await api<{ spreadsheetId: string }>(SHEETS, {
      method: 'POST',
      body: JSON.stringify({
        properties: { title: SHEET_TITLE },
        sheets: tabs.map((title) => ({ properties: { title, gridProperties: { frozenRowCount: 1 } } })),
      }),
    });
    return r.spreadsheetId;
  },
  async tabTitles(id) {
    const r = await api<{ sheets: { properties: { title: string } }[] }>(`${SHEETS}/${id}?fields=sheets.properties.title`);
    return r.sheets.map((s) => s.properties.title);
  },
  async addTabs(id, tabs) {
    await api(`${SHEETS}/${id}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: tabs.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })),
      }),
    });
  },
  async modifiedAt(id) {
    const r = await api<{ modifiedTime: string }>(`${DRIVE}/${id}?fields=modifiedTime`);
    return Date.parse(r.modifiedTime);
  },
  async readTabs(id, tabs) {
    const ranges = tabs.map((t) => `ranges=${encodeURIComponent(t)}`).join('&');
    const r = await api<{ valueRanges: { values?: unknown[][] }[] }>(
      `${SHEETS}/${id}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`,
    );
    return r.valueRanges.map((v) => v.values ?? []);
  },
  async writeTabs(id, data) {
    // Write first and clear leftovers after, so a dropped connection can't leave a tab empty.
    await api(`${SHEETS}/${id}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: data.map((d) => ({ range: `${d.tab}!A1`, values: d.rows })),
      }),
    });
    await api(`${SHEETS}/${id}/values:batchClear`, {
      method: 'POST',
      body: JSON.stringify({ ranges: data.map((d) => `${d.tab}!A${d.clearFrom}:Z`) }),
    });
  },
};
