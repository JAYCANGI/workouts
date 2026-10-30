import { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  value: number | undefined;
  onCommit(value: number | undefined): void;
  decimal?: boolean;
}

/** Keeps its own text while typing, so entries like "62." aren't rewritten mid-keystroke. */
export function NumberField({ label, value, onCommit, decimal }: Props) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value === undefined ? '' : String(value));
  }, [value]);

  return (
    <input
      className="num"
      aria-label={label}
      placeholder="–"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(value === undefined ? '' : String(value));
      }}
      onChange={(e) => {
        const next = e.target.value.replace(',', '.');
        if (!/^\d*\.?\d*$/.test(next)) return;
        setText(next);
        const n = parseFloat(next);
        onCommit(Number.isFinite(n) ? n : undefined);
      }}
    />
  );
}
