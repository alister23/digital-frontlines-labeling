import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { dbGetDataset, dbGetProgress } from '../lib/db'
import { hasSupabase } from '../lib/supabase'
import type { DatasetRecord, ProgressRecord } from '../lib/db'
import type { Task } from '../types'

// ── Settings modal ─────────────────────────────────────────────────────────────

function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    googleClientId, setGoogleClientId,
    defaultMessagesFolderId, setDefaultMessagesFolderId,
  } = useStore()
  const [clientId, setClientId] = useState(googleClientId)
  const [msgFolderId, setMsgFolderId] = useState(defaultMessagesFolderId)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setGoogleClientId(clientId.trim())
    setDefaultMessagesFolderId(msgFolderId.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141624] border border-[#2a2d42] rounded-xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-[#2a2d42] flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Google OAuth Client ID
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Required for loading data from Google Drive during task creation.
            </p>
            <input
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="123456789-abc….apps.googleusercontent.com"
              className="w-full px-3 py-2 rounded-md border border-[#2a2d42] bg-[#0d0f1a] text-slate-200 text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Default Messages Folder ID
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Pre-fills the messages folder field when loading from Drive.
            </p>
            <input
              type="text"
              value={msgFolderId}
              onChange={e => setMsgFolderId(e.target.value)}
              placeholder="1O63dutFjZFlXnaHv3vy…"
              className="w-full px-3 py-2 rounded-md border border-[#2a2d42] bg-[#0d0f1a] text-slate-200 text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="bg-[#0d0f1a] rounded-lg border border-[#2a2d42] px-4 py-3 space-y-2 text-xs text-slate-500">
            <p className="text-slate-400 font-medium">Google OAuth one-time setup (~5 min):</p>
            <ol className="space-y-1.5 list-decimal list-inside">
              <li>Go to <span className="text-indigo-400">console.cloud.google.com</span></li>
              <li>Create a project → enable <strong className="text-slate-400">Google Drive API</strong></li>
              <li>Credentials → Create → <strong className="text-slate-400">OAuth 2.0 Client ID</strong> → Web application</li>
              <li>Add your deployed URL and <code className="text-indigo-400">http://localhost:5174</code> to Authorized JavaScript origins</li>
              <li>Copy the Client ID and paste it above</li>
            </ol>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#2a2d42] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-colors"
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Session dialog ─────────────────────────────────────────────────────────────

function SessionDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const { startSession } = useStore()
  const [dataset, setDataset] = useState<DatasetRecord | null | 'loading'>('loading')
  const [prog, setProg] = useState<ProgressRecord | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!hasSupabase) { setDataset(null); return }
    Promise.all([dbGetDataset(task.id), dbGetProgress(task.id)])
      .then(([ds, pr]) => { setDataset(ds); setProg(pr) })
      .catch(() => setDataset(null))
  }, [task.id])

  const handleStart = async () => {
    setStarting(true)
    await startSession(task.id)
    onClose()
  }

  const isLoading = dataset === 'loading'
  const hasData = dataset !== null && dataset !== 'loading'
  const count = hasData ? (dataset as DatasetRecord).datapoints.length : 0

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141624] border border-[#2a2d42] rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-[#2a2d42] flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Start Session</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{task.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none mt-0.5 ml-4">×</button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
              <Spinner /> Checking dataset…
            </div>
          ) : !hasData ? (
            <div className="rounded-lg bg-amber-900/20 border border-amber-700/40 px-4 py-3">
              <p className="text-amber-400 text-sm font-medium">No data loaded yet</p>
              <p className="text-xs text-slate-400 mt-0.5">
                The admin needs to upload data for this task before it can be labeled.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-lg bg-emerald-900/20 border border-emerald-700/40 px-4 py-3">
                <p className="text-emerald-400 text-sm font-medium">✓ {count} items ready</p>
                {(dataset as DatasetRecord).loadedBy && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Loaded by {(dataset as DatasetRecord).loadedBy}
                    {' · '}{new Date((dataset as DatasetRecord).loadedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              {prog && (
                <div className="rounded-lg bg-indigo-900/20 border border-indigo-700/40 px-4 py-3">
                  <p className="text-indigo-400 text-sm font-medium">Progress saved</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    You were on item {prog.currentIndex + 1} of {count}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#2a2d42] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!hasData || starting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
          >
            {starting ? 'Loading…' : prog ? 'Resume →' : 'Start →'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-slate-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

// ── Home page ──────────────────────────────────────────────────────────────────

export function HomePage() {
  const {
    tasks, deleteTask, setEditingTask, navigate,
    adminMode, loadTasksFromDb, logout, profile, user,
  } = useStore()
  const [sessionTask, setSessionTask] = useState<Task | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => { loadTasksFromDb() }, [loadTasksFromDb])

  const handleNewTask = () => { setEditingTask(null); navigate('task-setup') }
  const handleEditTask = (task: Task) => { setEditingTask(task.id); navigate('task-setup') }
  const userEmail = profile?.email ?? user?.email ?? ''

  return (
    <div className="min-h-screen bg-[#0d0f1a] flex flex-col">
      <header className="border-b border-[#2a2d42] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">L</div>
          <span className="text-white font-semibold tracking-tight">LabelKit</span>
        </div>
        <div className="flex items-center gap-2">
          {adminMode && (
            <button
              onClick={() => navigate('results')}
              className="px-3 py-2 text-slate-400 hover:text-white text-sm transition-colors"
            >
              Submissions
            </button>
          )}
          {userEmail && (
            <span className="text-xs text-slate-500 hidden sm:block">{userEmail}</span>
          )}
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="p-2 text-slate-500 hover:text-white rounded-md hover:bg-[#1c1f33] transition-colors"
          >
            <SettingsIcon />
          </button>
          {hasSupabase && (
            <button
              onClick={logout}
              className="px-3 py-2 text-slate-400 hover:text-white text-sm transition-colors"
            >
              Sign out
            </button>
          )}
          {adminMode && (
            <button
              onClick={handleNewTask}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-colors"
            >
              + New Task
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 px-8 py-10 max-w-4xl w-full mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white">Tasks</h1>
          <p className="text-slate-400 text-sm mt-1">Select a task to start a labeling session.</p>
        </div>

        {tasks.length === 0 ? (
          <div className="border border-dashed border-[#2a2d42] rounded-xl py-16 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-slate-400 text-sm">No tasks yet.</p>
            {adminMode && (
              <button
                onClick={handleNewTask}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-colors"
              >
                Create your first task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map(task => (
              <div
                key={task.id}
                className="bg-[#141624] border border-[#2a2d42] rounded-xl px-5 py-4 flex items-center gap-4 group hover:border-indigo-500/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium text-sm">{task.name}</h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {task.questions.length} question{task.questions.length !== 1 ? 's' : ''} · Created{' '}
                    {new Date(task.createdAt).toLocaleDateString()}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Array.from(new Set(task.questions.map(q => q.category))).slice(0, 6).map(cat => (
                      <span key={cat} className="text-xs text-indigo-400 bg-indigo-900/30 px-2 py-0.5 rounded-full">
                        {cat.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {adminMode && (
                    <>
                      <button
                        onClick={() => handleEditTask(task)}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-[#2a2d42] hover:border-slate-600 rounded-md transition-colors"
                      >
                        Edit
                      </button>
                      {confirmDeleteId === task.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { deleteTask(task.id); setConfirmDeleteId(null) }}
                            className="px-3 py-1.5 text-xs text-red-400 border border-red-800 rounded-md"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1.5 text-xs text-slate-500 rounded-md"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(task.id)}
                          className="px-3 py-1.5 text-xs text-slate-500 hover:text-red-400 border border-[#2a2d42] hover:border-red-800 rounded-md transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => setSessionTask(task)}
                    className="px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors"
                  >
                    Start →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {sessionTask && <SessionDialog task={sessionTask} onClose={() => setSessionTask(null)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}
