import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { DetailView } from './DetailView'
import { TableView } from './TableView'
import { dbCreateSubmission } from '../lib/db'
import { hasSupabase } from '../lib/supabase'
import type { ExportedSession } from '../types'

function DriveConnectBanner() {
  const { driveToken, googleClientId, setDriveToken, datapoints } = useStore()
  const [status, setStatus] = useState<'idle' | 'waiting' | 'error'>('idle')
  const [gisReady, setGisReady] = useState(false)

  const effectiveClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || googleClientId
  const needsDrive = datapoints.some(
    dp => typeof dp.imageUrl === 'string' && (dp.imageUrl as string).startsWith('drive://')
  )

  useEffect(() => {
    if (!needsDrive || driveToken || !effectiveClientId) return
    const check = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof google !== 'undefined' && (google as any).accounts?.oauth2) {
        setGisReady(true)
      } else {
        setTimeout(check, 200)
      }
    }
    check()
  }, [needsDrive, driveToken, effectiveClientId])

  if (!needsDrive || driveToken) return null

  if (!effectiveClientId) {
    return (
      <div className="flex-shrink-0 bg-amber-950/30 border-b border-amber-700/30 px-6 py-2 text-xs text-amber-400/80">
        Images require Google Drive — add a Google Client ID in Settings to connect.
      </div>
    )
  }

  const handleConnect = () => {
    if (!gisReady) return
    setStatus('waiting')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokenClient = (google as any).accounts.oauth2.initTokenClient({
      client_id: effectiveClientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (response: any) => {
        if (response.error) { setStatus('error'); return }
        setDriveToken(response.access_token)
      },
      error_callback: () => setStatus('idle'),
    })
    tokenClient.requestAccessToken({ prompt: '' })
  }

  return (
    <div className="flex-shrink-0 bg-amber-950/30 border-b border-amber-700/30 px-6 py-2.5 flex items-center justify-between gap-4">
      <p className="text-xs text-amber-400/90">
        {status === 'error' ? 'Google sign-in failed — try again.' : 'Sign in with Google to load images from Drive.'}
      </p>
      <button
        onClick={handleConnect}
        disabled={!gisReady || status === 'waiting'}
        className="px-3 py-1 text-xs font-medium bg-amber-800/40 hover:bg-amber-700/50 disabled:opacity-50 text-amber-200 rounded-md transition-colors whitespace-nowrap flex-shrink-0"
      >
        {status === 'waiting' ? 'Waiting…' : 'Connect Drive'}
      </button>
    </div>
  )
}

function downloadJson(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function LabelingPage() {
  const {
    currentTaskId, tasks, datapoints, labels,
    currentIndex, viewMode, profile, user,
    navigate, setCurrentIndex, setViewMode, exportSession,
  } = useStore()

  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [submitError, setSubmitError] = useState('')

  const task = tasks.find((t) => t.id === currentTaskId)
  const userEmail = profile?.email ?? user?.email ?? ''

  if (!task || datapoints.length === 0) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center text-slate-400">
        <div className="text-center">
          <p className="mb-4">No active session.</p>
          <button onClick={() => navigate('home')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-md">
            Go Home
          </button>
        </div>
      </div>
    )
  }

  const totalAnswered = datapoints.filter((dp) => {
    const dpLabels = labels[dp.id] ?? {}
    return task.questions.some((q) => {
      const v = dpLabels[q.id]
      return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
    })
  }).length

  const handleExport = () => {
    const session = exportSession()
    if (!session) return
    const filename = `labels_${task.name.replace(/\s+/g, '_')}_${userEmail.split('@')[0]}_${new Date().toISOString().slice(0, 10)}.json`
    downloadJson(session as ExportedSession, filename)
  }

  const handleSubmit = async () => {
    if (!currentTaskId) return
    setSubmitting(true)
    setSubmitStatus('idle')
    setSubmitError('')
    try {
      await dbCreateSubmission(currentTaskId, userEmail, labels)
      setSubmitStatus('ok')
      setTimeout(() => setSubmitStatus('idle'), 3000)
    } catch (e) {
      setSubmitStatus('error')
      setSubmitError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const currentDatapoint = datapoints[currentIndex]

  return (
    <div className="h-screen bg-[#0d0f1a] flex flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b border-[#2a2d42] px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => navigate('home')}
            className="text-slate-500 hover:text-white text-sm transition-colors flex-shrink-0"
          >
            ← Home
          </button>
          <div className="h-4 w-px bg-[#2a2d42] flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-white font-medium text-sm truncate">{task.name}</h1>
            {userEmail && <p className="text-slate-500 text-xs truncate">{userEmail}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Progress */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-28 h-1.5 bg-[#2a2d42] rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${(totalAnswered / datapoints.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
              {totalAnswered}/{datapoints.length}
            </span>
          </div>

          {/* View toggle */}
          <div className="flex rounded-md border border-[#2a2d42] overflow-hidden">
            <button
              onClick={() => setViewMode('detail')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'detail' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Detail
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-[#2a2d42] ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Table
            </button>
          </div>

          <button
            onClick={handleExport}
            className="px-3 py-1.5 bg-[#1c1f33] hover:bg-[#252840] border border-[#2a2d42] text-slate-300 text-xs font-medium rounded-md transition-colors"
          >
            Export JSON
          </button>

          {hasSupabase && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
              >
                {submitting ? 'Submitting…' : submitStatus === 'ok' ? '✓ Submitted' : 'Submit'}
              </button>
              {submitStatus === 'error' && (
                <span className="text-xs text-red-400">{submitError}</span>
              )}
            </div>
          )}
        </div>
      </header>

      <DriveConnectBanner />

      <div className="flex-1 overflow-hidden">
        {viewMode === 'detail' ? (
          <DetailView
            datapoint={currentDatapoint}
            index={currentIndex}
            total={datapoints.length}
            onPrev={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
            onNext={() => setCurrentIndex(Math.min(datapoints.length - 1, currentIndex + 1))}
          />
        ) : (
          <TableView
            onOpenDetail={(i) => {
              setCurrentIndex(i)
              setViewMode('detail')
            }}
          />
        )}
      </div>
    </div>
  )
}
