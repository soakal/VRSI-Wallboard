import React, { useState, useRef, useEffect } from 'react';

interface Props {
  mode: 'day' | 'week' | 'month';
  onChange: (mode: 'day' | 'week' | 'month') => void;
}

const MODES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;

export const DisplayModePicker: React.FC<Props> = ({ mode, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = MODES.find((m) => m.value === mode)?.label ?? mode;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        title="Calendar view"
      >
        {/* Calendar icon */}
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="text-xs font-medium">{label}</span>
        {/* Chevron */}
        <svg className={`h-3 w-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 z-50 min-w-[110px] rounded-lg border border-white/10 bg-[#1e2536] py-1 shadow-xl">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => { onChange(m.value); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                m.value === mode
                  ? 'bg-blue-600/30 font-medium text-white'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              {m.value === mode && (
                <svg className="h-3 w-3 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {m.value !== mode && <span className="h-3 w-3" />}
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
