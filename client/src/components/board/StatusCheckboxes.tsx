import { JobStatus, STATUS_ORDER } from '@vrsi/wallboard-shared'
import { statusLabel } from './boardColors'

interface Props {
  jobNumber: string
  status: JobStatus
  disabled: boolean
  onStatusChange: (s: JobStatus) => void
  statusColors: Record<JobStatus, string>
}

export default function StatusCheckboxes({ jobNumber, status, disabled, onStatusChange, statusColors }: Props) {
  const currentIndex = STATUS_ORDER.indexOf(status)

  const handleCheckboxClick = (boxStatus: JobStatus) => {
    if (boxStatus === status) {
      // Clicking the current status: step back one
      if (currentIndex === 0) {
        onStatusChange('none')
      } else {
        onStatusChange(STATUS_ORDER[currentIndex - 1])
      }
    } else {
      // Clicking a different status
      onStatusChange(boxStatus)
    }
  }

  const isChecked = (boxStatus: JobStatus): boolean => {
    if (status === 'none') {
      return false
    }
    const boxIndex = STATUS_ORDER.indexOf(boxStatus)
    return boxIndex <= currentIndex
  }

  return (
    <div className={`flex gap-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {STATUS_ORDER.filter(s => s !== 'none').map((boxStatus) => {
        const checked = isChecked(boxStatus)
        const backgroundColor = statusColors[boxStatus]

        return (
          <button
            key={boxStatus}
            onClick={() => handleCheckboxClick(boxStatus)}
            disabled={disabled}
            className="flex items-center gap-2 cursor-pointer focus:outline-none"
            aria-label={`${statusLabel(boxStatus)} - Job ${jobNumber}`}
          >
            <div
              className="w-5 h-5 border-2 border-slate-600 rounded flex items-center justify-center transition-colors"
              style={{
                backgroundColor: checked ? backgroundColor : 'transparent',
                borderColor: backgroundColor,
              }}
            >
              {checked && <span className="text-white text-xs font-bold">✓</span>}
            </div>
            <span className="text-slate-300 text-sm">{statusLabel(boxStatus)}</span>
          </button>
        )
      })}
    </div>
  )
}
