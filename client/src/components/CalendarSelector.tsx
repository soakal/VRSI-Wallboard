import React from 'react';
import { CalendarItem } from '../types/index';

interface CalendarSelectorProps {
  calendars: CalendarItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

const CalendarSelector: React.FC<CalendarSelectorProps> = ({ calendars, selectedIds, onChange }) => {
  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    onChange(calendars.map((c) => c.id));
  };

  const handleSelectNone = () => {
    onChange([]);
  };

  return (
    <div className="space-y-2">
      {/* Bulk actions */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={handleSelectAll}
          className="rounded px-2 py-1 text-xs font-medium text-blue-400 hover:bg-white/5 transition-colors"
        >
          Select All
        </button>
        <button
          type="button"
          onClick={handleSelectNone}
          className="rounded px-2 py-1 text-xs font-medium text-slate-400 hover:bg-white/5 transition-colors"
        >
          None
        </button>
      </div>

      {/* Calendar list */}
      <div className="space-y-1">
        {calendars.map((calendar) => {
          const isChecked = selectedIds.includes(calendar.id);
          return (
            <label
              key={calendar.id}
              className="flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer hover:bg-white/5 transition-colors"
            >
              {/* Colored circle */}
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: calendar.hexColor || '#3b82f6' }}
              />

              {/* Name */}
              <span className="flex-1 text-sm text-slate-200 truncate">
                {calendar.name}
                {calendar.isDefault && (
                  <span className="ml-1.5 text-[10px] text-slate-500">(default)</span>
                )}
              </span>

              {/* Checkbox */}
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => handleToggle(calendar.id)}
                className="h-4 w-4 rounded border-white/20 bg-white/10 text-blue-500 accent-blue-500 cursor-pointer flex-shrink-0"
              />
            </label>
          );
        })}
      </div>

      {calendars.length === 0 && (
        <p className="text-xs text-slate-500 py-2">No calendars found.</p>
      )}
    </div>
  );
};

export default CalendarSelector;
