// Downloads free-exercise-db (Unlicense) and trims it to src/data/exercises.json.
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const res = await fetch(URL);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
const raw = await res.json();

const TIMED = /\b(plank|wall sit|hold|hang)\b/i;
function kindOf(e) {
  if (e.category === 'cardio') return 'cardio';
  if (e.category === 'stretching' || TIMED.test(e.name)) return 'timed';
  if (e.equipment === 'body only' || e.equipment === null) return 'bodyweight';
  return 'weight';
}

const text = (v) => (typeof v === 'string' ? v : '');
const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

const out = raw.map((e) => ({
  id: text(e.id),
  name: text(e.name),
  kind: kindOf(e),
  primary: list(e.primaryMuscles),
  secondary: list(e.secondaryMuscles),
  equipment: text(e.equipment),
  level: text(e.level),
  mechanic: text(e.mechanic),
  instructions: list(e.instructions),
  images: list(e.images),
})).filter((e) => e.id && e.name).sort((a, b) => a.name.localeCompare(b.name));

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/exercises.json', JSON.stringify(out));
const kinds = {};
for (const e of out) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
console.log(`${out.length} exercises`, kinds);
