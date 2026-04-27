import { useState, useRef, useEffect } from 'react'

interface Props {
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  compact?: boolean
}

export function MultiSelect({ options, value, onChange, placeholder = 'Select…', compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])
  }

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full text-left rounded-md border border-[#2a2d42] bg-[#1c1f33] hover:border-indigo-500/50 focus:outline-none focus:border-indigo-500 transition-colors ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}`}
      >
        {value.length === 0 ? (
          <span className="text-slate-500">{placeholder}</span>
        ) : compact ? (
          <span className="text-slate-200 truncate block">{value.join(', ')}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {value.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 bg-indigo-900/60 text-indigo-300 text-xs px-2 py-0.5 rounded-full"
              >
                {v}
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); toggle(v) }}
                  className="hover:text-white cursor-pointer leading-none"
                >
                  ×
                </span>
              </span>
            ))}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] rounded-lg border border-[#2a2d42] bg-[#1c1f33] shadow-2xl max-h-64 overflow-y-auto">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#252840] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-indigo-500 w-3.5 h-3.5 flex-shrink-0"
              />
              <span className="text-sm text-slate-200 leading-snug">{opt}</span>
            </label>
          ))}
          {value.length > 0 && (
            <div className="border-t border-[#2a2d42] px-3 py-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
