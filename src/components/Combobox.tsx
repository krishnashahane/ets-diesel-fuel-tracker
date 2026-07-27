'use client';
// Typeable dropdown that works identically on phone and desktop. Native
// <datalist> is unreliable on mobile browsers (no dropdown, no caret); this
// renders its own filtered list while still allowing any free-typed value.
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  uppercase?: boolean;   // e.g. bus numbers
  max?: number;          // cap rendered rows for large lists
}

export default function Combobox({ value, onChange, options, placeholder, uppercase, max = 50 }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = value.trim().toLowerCase();
  const filtered = (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, max);

  function pick(v: string) { onChange(uppercase ? v.toUpperCase() : v); setOpen(false); }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className="input pr-8"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(uppercase ? e.target.value.toUpperCase() : e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      <button type="button" aria-label="Toggle list" tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-slate-400"
        onClick={() => setOpen((o) => !o)}>▾</button>
      {open && filtered.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.map((o) => (
            <li key={o}>
              <button type="button"
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-brand-50"
                onClick={() => pick(o)}>{o}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
