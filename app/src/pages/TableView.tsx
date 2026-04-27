import { useRef, useState } from 'react'
import { useStore } from '../store'
import { QuestionField } from '../components/QuestionField'
import { AuthenticatedImage } from '../components/AuthenticatedImage'
import type { Datapoint, Question, LabelValue } from '../types'

const FIXED_COLS = ['image', 'caption'] as const

interface CellProps {
  question: Question
  value: LabelValue | undefined
  onChange: (v: LabelValue) => void
  isActive: boolean
  onActivate: () => void
}

function TableCell({ question, value, onChange, isActive, onActivate }: CellProps) {
  const ref = useRef<HTMLDivElement>(null)

  const displayValue = () => {
    if (!value) return null
    if (Array.isArray(value)) {
      if (value.length === 0) return null
      return value.join(', ')
    }
    return value
  }

  const display = displayValue()

  if (isActive) {
    return (
      <div
        ref={ref}
        className="p-1"
        style={{ minWidth: 220 }}
      >
        <QuestionField question={question} value={value} onChange={onChange} compact />
      </div>
    )
  }

  return (
    <div
      onClick={onActivate}
      className="px-3 py-2 cursor-pointer hover:bg-[#252840] min-h-[36px] flex items-center"
      style={{ minWidth: 180 }}
    >
      {display ? (
        <span className="text-xs text-slate-200 leading-snug line-clamp-2">{display}</span>
      ) : (
        <span className="text-xs text-slate-600 italic">—</span>
      )}
    </div>
  )
}

interface RowProps {
  datapoint: Datapoint
  questions: Question[]
  index: number
  onOpenDetail: () => void
}

function TableRow({ datapoint, questions, index, onOpenDetail }: RowProps) {
  const { labels, setLabel } = useStore()
  const dpLabels = labels[datapoint.id] ?? {}
  const [activeCell, setActiveCell] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)

  const answeredCount = questions.filter((q) => {
    const v = dpLabels[q.id]
    return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  }).length

  return (
    <tr className="border-b border-[#2a2d42] hover:bg-[#1a1d2e]/50 group">
      {/* Row number */}
      <td className="sticky left-0 bg-[#141624] group-hover:bg-[#1a1d2e] px-3 py-2 text-xs text-slate-500 font-mono border-r border-[#2a2d42] text-right" style={{ minWidth: 48 }}>
        {index + 1}
      </td>

      {/* Image */}
      <td className="sticky left-[48px] bg-[#141624] group-hover:bg-[#1a1d2e] border-r border-[#2a2d42]" style={{ minWidth: 80, width: 80 }}>
        <div className="w-[72px] h-[54px] flex items-center justify-center">
          {datapoint.imageUrl && !imgError ? (
            <AuthenticatedImage
              src={datapoint.imageUrl as string}
              alt=""
              onError={() => setImgError(true)}
              className="max-w-full max-h-full object-contain rounded"
            />
          ) : (
            <span className="text-slate-700 text-xs text-center px-1 font-mono break-all leading-tight">
              {datapoint.imageName ? String(datapoint.imageName).slice(0, 12) : '—'}
            </span>
          )}
        </div>
      </td>

      {/* Caption */}
      <td className="sticky left-[128px] bg-[#141624] group-hover:bg-[#1a1d2e] border-r border-[#2a2d42] px-3 py-2 max-w-[280px]" style={{ minWidth: 220 }}>
        <p className="text-xs text-slate-300 leading-snug line-clamp-3">
          {(datapoint.captionTranslated ?? datapoint.caption) as string ?? <span className="text-slate-600 italic">No caption</span>}
        </p>
      </td>

      {/* Progress */}
      <td className="sticky left-[408px] bg-[#141624] group-hover:bg-[#1a1d2e] border-r border-[#2a2d42] px-3 py-2 text-center" style={{ minWidth: 80 }}>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-slate-400 font-mono">{answeredCount}/{questions.length}</span>
          <div className="w-12 h-1 bg-[#2a2d42] rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
          </div>
        </div>
      </td>

      {/* Open detail */}
      <td className="sticky left-[488px] bg-[#141624] group-hover:bg-[#1a1d2e] border-r border-[#2a2d42] px-2 py-2" style={{ minWidth: 60 }}>
        <button
          onClick={onOpenDetail}
          className="w-full text-xs text-indigo-400 hover:text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Open ↗
        </button>
      </td>

      {/* Question cells */}
      {questions.map((q) => (
        <td
          key={q.id}
          className="border-r border-[#2a2d42] align-top"
          style={{ minWidth: activeCell === q.id ? 240 : 180 }}
          onClick={() => setActiveCell(q.id)}
          onBlur={() => setActiveCell(null)}
        >
          <TableCell
            question={q}
            value={dpLabels[q.id]}
            onChange={(v) => setLabel(datapoint.id, q.id, v)}
            isActive={activeCell === q.id}
            onActivate={() => setActiveCell(q.id)}
          />
        </td>
      ))}
    </tr>
  )
}

interface Props {
  onOpenDetail: (index: number) => void
}

export function TableView({ onOpenDetail }: Props) {
  const { currentTaskId, tasks, datapoints } = useStore()
  const task = tasks.find((t) => t.id === currentTaskId)
  const tableRef = useRef<HTMLDivElement>(null)

  if (!task) return null

  const FIXED_LEFT = 548 // total width of fixed columns

  return (
    <div ref={tableRef} className="h-full overflow-auto">
      <table className="border-collapse text-sm" style={{ minWidth: FIXED_LEFT + task.questions.length * 180 }}>
        <thead className="sticky top-0 z-20">
          <tr className="bg-[#0d0f1a] border-b-2 border-[#2a2d42]">
            <th className="sticky left-0 bg-[#0d0f1a] z-30 px-3 py-3 text-xs text-slate-500 font-medium text-right border-r border-[#2a2d42]" style={{ minWidth: 48 }}>#</th>
            <th className="sticky left-[48px] bg-[#0d0f1a] z-30 px-3 py-3 text-xs text-slate-400 font-medium text-left border-r border-[#2a2d42]" style={{ minWidth: 80 }}>Image</th>
            <th className="sticky left-[128px] bg-[#0d0f1a] z-30 px-3 py-3 text-xs text-slate-400 font-medium text-left border-r border-[#2a2d42]" style={{ minWidth: 220 }}>Caption</th>
            <th className="sticky left-[348px] bg-[#0d0f1a] z-30 px-3 py-3 text-xs text-slate-400 font-medium text-center border-r border-[#2a2d42]" style={{ minWidth: 80 }}>Progress</th>
            <th className="sticky left-[428px] bg-[#0d0f1a] z-30 border-r border-[#2a2d42]" style={{ minWidth: 60 }} />
            {task.questions.map((q) => (
              <th key={q.id} className="px-3 py-3 text-xs text-slate-400 font-medium text-left border-r border-[#2a2d42]" style={{ minWidth: 180, maxWidth: 240 }}>
                <span className="line-clamp-2 leading-snug">{q.text}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datapoints.map((dp, i) => (
            <TableRow
              key={dp.id}
              datapoint={dp}
              questions={task.questions}
              index={i}
              onOpenDetail={() => onOpenDetail(i)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
