import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { dbFetchSubmissions } from '../lib/db'
import type { SubmissionRecord } from '../lib/db'

function downloadJson(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ResultsPage() {
  const { navigate, tasks } = useStore()
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    dbFetchSubmissions()
      .then(setSubmissions)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  // Group submissions by task
  const byTask = submissions.reduce<Record<string, SubmissionRecord[]>>((acc, s) => {
    acc[s.taskId] = acc[s.taskId] ?? []
    acc[s.taskId].push(s)
    return acc
  }, {})

  const taskName = (id: string) => tasks.find(t => t.id === id)?.name ?? id

  const countAnswered = (labels: SubmissionRecord['labels']) =>
    Object.values(labels).reduce((n, dp) => {
      const answered = Object.values(dp).filter(v =>
        v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
      ).length
      return n + (answered > 0 ? 1 : 0)
    }, 0)

  return (
    <div className="min-h-screen bg-[#0d0f1a] flex flex-col">
      <header className="border-b border-[#2a2d42] px-8 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('home')}
          className="text-slate-500 hover:text-white text-sm transition-colors"
        >
          ← Home
        </button>
        <div className="h-4 w-px bg-[#2a2d42]" />
        <h1 className="text-white font-semibold">Submissions</h1>
      </header>

      <main className="flex-1 px-8 py-8 max-w-4xl w-full mx-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Loading submissions…
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : submissions.length === 0 ? (
          <div className="border border-dashed border-[#2a2d42] rounded-xl py-16 text-center">
            <p className="text-slate-400 text-sm">No submissions yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(byTask).map(([taskId, subs]) => (
              <div key={taskId}>
                <h2 className="text-white font-medium text-sm mb-3">{taskName(taskId)}</h2>
                <div className="bg-[#141624] border border-[#2a2d42] rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a2d42] text-slate-500 text-xs">
                        <th className="text-left px-4 py-3 font-medium">Labeler</th>
                        <th className="text-left px-4 py-3 font-medium">Submitted</th>
                        <th className="text-left px-4 py-3 font-medium">Items answered</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map(s => (
                        <tr key={s.id} className="border-b border-[#2a2d42] last:border-0 hover:bg-[#1a1d2e]/50">
                          <td className="px-4 py-3 text-slate-200">{s.labelerName}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                            {new Date(s.submittedAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                            {countAnswered(s.labels)} items
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => downloadJson(
                                { taskId, taskName: taskName(taskId), labelerName: s.labelerName, submittedAt: s.submittedAt, labels: s.labels },
                                `labels_${taskName(taskId).replace(/\s+/g, '_')}_${s.labelerName}_${s.submittedAt.slice(0, 10)}.json`,
                              )}
                              className="text-xs text-indigo-400 hover:text-indigo-300"
                            >
                              Download
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
