import { useState } from 'react'
import { useStore } from '../store'
import { QuestionField } from '../components/QuestionField'
import { AuthenticatedImage } from '../components/AuthenticatedImage'
import type { Datapoint } from '../types'

interface Props {
  datapoint: Datapoint
  index: number
  total: number
  onPrev: () => void
  onNext: () => void
}

export function DetailView({ datapoint, index, total, onPrev, onNext }: Props) {
  const { currentTaskId, tasks, labels, setLabel } = useStore()
  const task = tasks.find((t) => t.id === currentTaskId)
  const dpLabels = labels[datapoint.id] ?? {}
  const [showTranslation, setShowTranslation] = useState(true)
  const [imgError, setImgError] = useState(false)

  if (!task) return null

  // Group questions by category
  const groups = task.questions.reduce<Record<string, typeof task.questions>>((acc, q) => {
    acc[q.category] = acc[q.category] ?? []
    acc[q.category].push(q)
    return acc
  }, {})

  const answeredCount = task.questions.filter((q) => {
    const v = dpLabels[q.id]
    return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  }).length

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left pane: image + caption */}
      <div className="w-[380px] flex-shrink-0 border-r border-[#2a2d42] flex flex-col overflow-hidden">
        {/* Nav */}
        <div className="px-4 py-3 border-b border-[#2a2d42] flex items-center justify-between flex-shrink-0">
          <button
            onClick={onPrev}
            disabled={index === 0}
            className="px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed border border-[#2a2d42] hover:border-slate-600 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-slate-400 font-mono">{index + 1} / {total}</span>
          <button
            onClick={onNext}
            disabled={index === total - 1}
            className="px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed border border-[#2a2d42] hover:border-slate-600 transition-colors"
          >
            Next →
          </button>
        </div>

        {/* Image */}
        <div className="flex-shrink-0 bg-[#0d0f1a] border-b border-[#2a2d42] flex items-center justify-center" style={{ minHeight: 220, maxHeight: 320 }}>
          {datapoint.imageUrl && !imgError ? (
            <AuthenticatedImage
              src={datapoint.imageUrl as string}
              alt={datapoint.imageName as string ?? 'datapoint image'}
              onError={() => setImgError(true)}
              className="max-w-full max-h-full object-contain"
              style={{ maxHeight: 300 }}
            />
          ) : (
            <div className="text-slate-600 text-sm text-center p-4">
              <div className="text-3xl mb-2">🖼️</div>
              {datapoint.imageName ? (
                <span className="font-mono text-xs break-all">{datapoint.imageName as string}</span>
              ) : (
                <span>No image</span>
              )}
            </div>
          )}
        </div>

        {/* Caption */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {datapoint.imageName && (
            <div>
              <span className="text-xs text-slate-500 font-medium">File</span>
              <p className="text-xs text-slate-400 font-mono mt-0.5 break-all">{datapoint.imageName as string}</p>
            </div>
          )}

          {(datapoint.caption || datapoint.captionTranslated) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500 font-medium">Caption</span>
                {datapoint.captionTranslated && datapoint.caption && (
                  <button
                    onClick={() => setShowTranslation((s) => !s)}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    {showTranslation ? 'Show original' : 'Show translation'}
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                {showTranslation && datapoint.captionTranslated
                  ? (datapoint.captionTranslated as string)
                  : (datapoint.caption as string)}
              </p>
            </div>
          )}

          {/* Progress for this item */}
          <div className="pt-2 border-t border-[#2a2d42]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500">Questions answered</span>
              <span className="text-xs text-slate-400 font-mono">{answeredCount}/{task.questions.length}</span>
            </div>
            <div className="h-1 bg-[#2a2d42] rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${(answeredCount / task.questions.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right pane: questions */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {Object.entries(groups).map(([category, questions]) => (
          <div key={category}>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-[#2a2d42]">
              {category.replace(/_/g, ' ')}
            </h3>
            <div className="space-y-4">
              {questions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm text-slate-300 mb-1.5 leading-snug">{q.text}</label>
                  <QuestionField
                    question={q}
                    value={dpLabels[q.id]}
                    onChange={(v) => setLabel(datapoint.id, q.id, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
