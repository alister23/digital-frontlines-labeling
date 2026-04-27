import { MultiSelect } from './MultiSelect'
import type { Question, LabelValue } from '../types'

interface Props {
  question: Question
  value: LabelValue | undefined
  onChange: (value: LabelValue) => void
  compact?: boolean
}

export function QuestionField({ question, value, onChange, compact = false }: Props) {
  const strVal = (value as string) ?? ''
  const arrVal = (value as string[]) ?? []

  if (question.type === 'text') {
    return (
      <textarea
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your answer…"
        rows={compact ? 2 : 3}
        className={`w-full rounded-md border border-[#2a2d42] bg-[#1c1f33] text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500 transition-colors ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}`}
      />
    )
  }

  if (question.type === 'single') {
    return (
      <select
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-[#2a2d42] bg-[#1c1f33] text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer appearance-none ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}`}
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '16px', paddingRight: '28px' }}
      >
        <option value="">Select…</option>
        {(question.options ?? []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    )
  }

  // multi
  return (
    <MultiSelect
      options={question.options ?? []}
      value={arrVal}
      onChange={onChange}
      compact={compact}
    />
  )
}
