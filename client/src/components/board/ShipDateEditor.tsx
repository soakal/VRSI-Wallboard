import React from 'react'

interface Props {
  jobNumber: string
  originalShipDate: string | null
  effectiveShipDate: string | null
  shipDateOverridden: boolean
  overrideNote: string
  disabled: boolean
  onDateChange: (date: string | null) => void
  onNoteChange: (note: string) => void
}

export default function ShipDateEditor({
  jobNumber,
  originalShipDate,
  effectiveShipDate,
  shipDateOverridden,
  overrideNote,
  disabled,
  onDateChange,
  onNoteChange,
}: Props) {
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onDateChange(e.target.value || null)
  }

  const handleReset = () => {
    onDateChange(originalShipDate)
    onNoteChange('')
  }

  const showReason = shipDateOverridden

  return (
    <div className={`flex flex-col gap-2 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-slate-400 text-sm shrink-0">Ship Date:</label>
        <input
          type="date"
          value={effectiveShipDate ?? ''}
          onChange={handleDateChange}
          readOnly={disabled}
          disabled={disabled}
          className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          aria-label={`Ship date for Job ${jobNumber}`}
        />
        {!disabled && shipDateOverridden && (
          <>
            <span className="bg-amber-900/40 text-amber-400 text-xs px-2 py-0.5 rounded">Overridden</span>
            <button
              type="button"
              onClick={handleReset}
              className="text-slate-500 hover:text-slate-300 text-xs transition-colors cursor-pointer"
              aria-label={`Reset ship date for Job ${jobNumber}`}
            >
              Reset
            </button>
          </>
        )}
      </div>
      {showReason && (
        <div className="flex flex-col gap-1">
          <label className="text-slate-500 text-xs">Override reason (optional)</label>
          <input
            type="text"
            value={overrideNote}
            onChange={(e) => onNoteChange(e.target.value)}
            readOnly={disabled}
            disabled={disabled}
            placeholder="Why was the ship date changed?"
            className="bg-slate-900 border border-slate-700 text-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500 w-full max-w-md"
          />
        </div>
      )}
    </div>
  )
}
