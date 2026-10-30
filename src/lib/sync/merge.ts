import type { Rec } from './schema';

export interface Base {
  hash: string;
  updatedAt: number;
}

export interface MergeResult {
  /** The rows the Sheet should hold afterwards. */
  rows: Rec[];
  upsertLocal: Rec[];
  purgeLocal: string[];
  /** Base entries for every row in `rows`. */
  base: Map<string, Base>;
  sheetChanged: boolean;
}

/**
 * Three-way merge of one tab. A row counts as changed on a side when its hash
 * differs from the last-synced hash. When both sides changed, the later edit
 * wins. A hand edit in the Sheet doesn't touch updatedAt, so it is dated by the
 * spreadsheet's last-modified time.
 */
export function mergeTable(
  local: Rec[],
  remote: Rec[],
  baseIn: Map<string, Base>,
  hash: (rec: Rec) => string,
  remoteModifiedAt: number,
): MergeResult {
  const localById = new Map(local.map((r) => [r.id, r]));
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const out: MergeResult = { rows: [], upsertLocal: [], purgeLocal: [], base: new Map(), sheetChanged: false };

  const keep = (rec: Rec) => {
    out.rows.push(rec);
    out.base.set(rec.id, { hash: hash(rec), updatedAt: rec.updatedAt });
  };
  const remoteTime = (r: Rec, b?: Base) => (!r.updatedAt || (b && r.updatedAt === b.updatedAt) ? remoteModifiedAt : r.updatedAt);
  const takeRemote = (r: Rec, b?: Base) => {
    const rec = { ...r, updatedAt: Math.max(remoteTime(r, b), r.updatedAt) };
    if (rec.updatedAt !== r.updatedAt) out.sheetChanged = true;
    out.upsertLocal.push(rec);
    keep(rec);
  };

  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const L = localById.get(id);
    const R = remoteById.get(id);
    const b = baseIn.get(id);

    if (L?.deleted) {
      if (R && b && hash(R) !== b.hash && remoteTime(R, b) > L.updatedAt) {
        takeRemote(R, b);
      } else {
        out.purgeLocal.push(id);
        if (R) out.sheetChanged = true;
      }
      continue;
    }
    if (!L) {
      if (R) takeRemote(R, undefined);
      continue;
    }
    if (!R) {
      if (b && hash(L) === b.hash) {
        out.purgeLocal.push(id); // Row removed from the Sheet by hand.
      } else {
        out.sheetChanged = true;
        keep(L);
      }
      continue;
    }

    const lh = hash(L);
    const rh = hash(R);
    if (lh === rh) {
      if (L.updatedAt !== R.updatedAt) out.sheetChanged = true;
      keep(L);
      continue;
    }
    const localChanged = !b || lh !== b.hash;
    const remoteChanged = !b || rh !== b.hash;
    if (remoteChanged && (!localChanged || remoteTime(R, b) > L.updatedAt)) {
      takeRemote(R, b);
    } else {
      out.sheetChanged = true;
      keep(L);
    }
  }
  return out;
}
