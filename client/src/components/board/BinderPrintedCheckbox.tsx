interface Props {
  jobNumber: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}

const CHECK_COLOR = '#22c55e'

export default function BinderPrintedCheckbox({
  jobNumber,
  checked,
  disabled,
  onChange,
}: Props) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`flex items-center gap-2 cursor-pointer focus:outline-none shrink-0 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
      aria-label={`Binder Printed - Job ${jobNumber}`}
    >
      <div
        className="w-5 h-5 border-2 rounded flex items-center justify-center transition-colors"
        style={{
          backgroundColor: checked ? CHECK_COLOR : 'transparent',
          borderColor: checked ? CHECK_COLOR : '#475569',
        }}
      >
        {checked && <span className="text-white text-xs font-bold">✓</span>}
      </div>
      <span className="text-slate-300 text-sm whitespace-nowrap">Binder Printed</span>
    </button>
  )
}
