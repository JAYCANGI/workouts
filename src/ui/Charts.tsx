import { useState } from 'react';
import { trim } from '../lib/stats';

export interface Point {
  x: number;
  y: number;
}

const W = 340;
const H = 170;
const PAD = { l: 34, r: 12, t: 12, b: 22 };

const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function niceTicks(min: number, max: number) {
  const span = max - min || Math.max(Math.abs(max), 1);
  const step = Math.pow(10, Math.floor(Math.log10(span / 2)));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= 3) ?? step * 10;
  const start = Math.floor(min / nice) * nice;
  const ticks: number[] = [];
  for (let v = start; v <= max + nice * 0.999 && ticks.length < 6; v += nice) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/** One series, so the title names it and no legend is needed. Tap or drag to read a value. */
export function LineChart({ points, unit, label }: { points: Point[]; unit: string; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) return <p className="muted">No data yet.</p>;

  const ys = points.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const [lo, hi] = [ticks[0], ticks[ticks.length - 1]];
  const [x0, x1] = [points[0].x, points[points.length - 1].x];
  const sx = (x: number) => (x1 === x0 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r));
  const sy = (y: number) => H - PAD.b - ((y - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const shown = active !== null ? points[active] : points[points.length - 1];

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(sx(p.x) - x) < Math.abs(sx(points[best].x) - x)) best = i;
    });
    setActive(best);
  };

  return (
    <figure className="chart">
      <figcaption>
        <strong>{trim(shown.y)} {unit}</strong> <span className="muted">{shortDate(shown.x)}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}: ${points.length} entries, latest ${trim(points[points.length - 1].y)} ${unit}`}
        onPointerDown={pick}
        onPointerMove={(e) => e.buttons && pick(e)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} />
            <text className="tick" x={PAD.l - 6} y={sy(t) + 4} textAnchor="end">{trim(t)}</text>
          </g>
        ))}
        <text className="tick" x={PAD.l} y={H - 5}>{shortDate(x0)}</text>
        {x1 !== x0 && <text className="tick" x={W - PAD.r} y={H - 5} textAnchor="end">{shortDate(x1)}</text>}
        {points.length > 1 && (
          <polyline className="line" points={points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
        )}
        {active !== null && <line className="cross" x1={sx(shown.x)} x2={sx(shown.x)} y1={PAD.t} y2={H - PAD.b} />}
        {(points.length <= 30 ? points : [shown]).map((p) => (
          <circle key={p.x} className="dot" cx={sx(p.x)} cy={sy(p.y)} r={p === shown ? 5 : 3.5} />
        ))}
      </svg>
      <details>
        <summary>Show as table</summary>
        <table>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.x}>
                <td>{new Date(p.x).toLocaleDateString()}</td>
                <td className="right">{trim(p.y)} {unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export function BarList({ rows, unit }: { rows: { label: string; value: number; note?: string }[]; unit: string }) {
  const top = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            {r.value > 0 && <span className="bar" style={{ width: `${(r.value / top) * 100}%` }} />}
          </span>
          <span className="bar-value">{trim(r.value)} {unit}</span>
        </li>
      ))}
    </ul>
  );
}
