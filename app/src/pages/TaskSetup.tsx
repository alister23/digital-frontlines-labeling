import { useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { PRESET_CATEGORIES } from '../data/presets'
import { DriveLoader } from '../components/DriveLoader'
import { dbGetDataset, dbSaveDataset } from '../lib/db'
import { hasSupabase } from '../lib/supabase'
import type { Question, Task, Datapoint } from '../types'

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function parseDatapoints(raw: unknown[]): Datapoint[] {
  return raw.map((item, i) => {
    const obj = item as Record<string, unknown>
    return { id: String(obj.id ?? i), ...obj } as Datapoint
  })
}

// ── Custom question builder ────────────────────────────────────────────────────

function CustomQuestionBuilder({ onAdd }: { onAdd: (q: Question) => void }) {
  const [text, setText] = useState('')
  const [type, setType] = useState<Question['type']>('single')
  const [optionsText, setOptionsText] = useState('')
  const [error, setError] = useState('')

  const handleAdd = () => {
    setError('')
    if (!text.trim()) { setError('Question text is required.'); return }
    if ((type === 'single' || type === 'multi') && !optionsText.trim()) {
      setError('Please enter at least one option.'); return
    }
    const options = type !== 'text' ? optionsText.split('\n').map(s => s.trim()).filter(Boolean) : undefined
    onAdd({ id: `custom_${generateId()}`, text: text.trim(), type, options, category: 'custom' })
    setText('')
    setOptionsText('')
  }

  return (
    <div className="bg-[#0d0f1a] border border-[#2a2d42] rounded-xl p-4 space-y-3">
      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Custom Question</h4>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Question text</label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Is this image graphic or disturbing?"
          className="w-full px-3 py-2 rounded-md border border-[#2a2d42] bg-[#1c1f33] text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Answer type</label>
        <div className="flex gap-2">
          {(['single', 'multi', 'text'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${type === t ? 'bg-indigo-600 text-white' : 'bg-[#1c1f33] text-slate-400 hover:text-white border border-[#2a2d42]'}`}
            >
              {t === 'single' ? 'Single choice' : t === 'multi' ? 'Multi-select' : 'Free text'}
            </button>
          ))}
        </div>
      </div>

      {type !== 'text' && (
        <div>
          <label className="block text-xs text-slate-400 mb-1">Options (one per line)</label>
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            rows={4}
            placeholder={"Option A\nOption B\nOption C"}
            className="w-full px-3 py-2 rounded-md border border-[#2a2d42] bg-[#1c1f33] text-slate-200 text-sm font-mono placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500"
          />
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        onClick={handleAdd}
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-colors"
      >
        Add Question
      </button>
    </div>
  )
}

// ── Dataset section ────────────────────────────────────────────────────────────

type DataTab = 'drive' | 'upload'

interface DatasetSectionProps {
  taskId: string
  userEmail: string
  onDatapointsChange: (dps: Datapoint[], imagesFolderId: string, messagesFolderId: string) => void
}

function DatasetSection({ taskId, userEmail, onDatapointsChange }: DatasetSectionProps) {
  const { googleClientId, driveImagesFolderId, driveMessagesFolderId, defaultMessagesFolderId, setDriveFolderIds } = useStore()
  const effectiveClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || googleClientId
  const [activeTab, setActiveTab] = useState<DataTab>(effectiveClientId ? 'drive' : 'upload')
  const [existingDataset, setExistingDataset] = useState<{ count: number; loadedBy: string; loadedAt: string } | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(hasSupabase)
  const [showLoader, setShowLoader] = useState(false)
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!hasSupabase) { setLoadingExisting(false); return }
    dbGetDataset(taskId)
      .then(ds => {
        if (ds) setExistingDataset({ count: ds.datapoints.length, loadedBy: ds.loadedBy, loadedAt: ds.loadedAt })
      })
      .catch(console.error)
      .finally(() => setLoadingExisting(false))
  }, [taskId])

  const handleDriveLoaded = (dps: Datapoint[], imagesId: string, messagesId: string) => {
    setDriveFolderIds(imagesId, messagesId)
    setPendingCount(dps.length)
    setShowLoader(false)
    onDatapointsChange(dps, imagesId, messagesId)
  }

  const loadJson = useCallback((text: string) => {
    setUploadError('')
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error('File must contain a JSON array')
      if (parsed.length === 0) throw new Error('Array is empty')
      const dps = parseDatapoints(parsed)
      setPendingCount(dps.length)
      onDatapointsChange(dps, '', '')
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }, [onDatapointsChange])

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.json')) { setUploadError('Please upload a .json file'); return }
    const reader = new FileReader()
    reader.onload = e => loadJson(e.target?.result as string)
    reader.readAsText(file)
  }, [loadJson])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dataset</label>
        {pendingCount !== null && (
          <span className="text-xs text-emerald-400">✓ {pendingCount} items staged — will save with task</span>
        )}
      </div>

      {loadingExisting ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Checking existing dataset…
        </div>
      ) : existingDataset && !showLoader ? (
        <div className="rounded-lg bg-emerald-900/20 border border-emerald-700/40 px-4 py-3 space-y-2">
          <p className="text-emerald-400 text-sm font-medium">✓ Dataset already loaded</p>
          <p className="text-xs text-slate-400">
            {existingDataset.count} items
            {existingDataset.loadedBy ? ` · loaded by ${existingDataset.loadedBy}` : ''}
            {' · '}{new Date(existingDataset.loadedAt).toLocaleDateString()}
          </p>
          <button
            onClick={() => { setShowLoader(true); setPendingCount(null) }}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Replace dataset
          </button>
        </div>
      ) : (
        <>
          {/* Tab toggle */}
          <div className="flex rounded-md border border-[#2a2d42] overflow-hidden w-fit">
            <TabButton active={activeTab === 'drive'} onClick={() => setActiveTab('drive')}>
              Google Drive
            </TabButton>
            <TabButton active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} border>
              Upload JSON
            </TabButton>
          </div>

          {activeTab === 'drive' && (
            effectiveClientId ? (
              <DriveLoader
                clientId={effectiveClientId}
                initialImagesFolderId={driveImagesFolderId}
                initialMessagesFolderId={driveMessagesFolderId}
                defaultMessagesFolderId={defaultMessagesFolderId}
                onLoaded={handleDriveLoaded}
              />
            ) : (
              <div className="border border-dashed border-[#2a2d42] rounded-xl px-5 py-6 text-center space-y-1">
                <p className="text-sm text-slate-400">No Google Client ID configured.</p>
                <p className="text-xs text-slate-500">Add it in Settings (gear icon, top right of Home).</p>
              </div>
            )
          )}

          {activeTab === 'upload' && (
            <div className="space-y-2">
              <div
                onDragEnter={e => { e.preventDefault(); setIsDragging(true) }}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-colors ${
                  pendingCount !== null
                    ? 'border-emerald-600/60 bg-emerald-900/10'
                    : isDragging
                    ? 'border-indigo-500 bg-indigo-900/20'
                    : 'border-[#2a2d42] hover:border-indigo-500/50 hover:bg-[#1c1f33]/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
                {pendingCount !== null ? (
                  <div className="pointer-events-none space-y-1">
                    <div className="text-emerald-400 text-2xl mb-2">✓</div>
                    <p className="text-sm font-medium text-slate-200">{pendingCount} datapoints ready</p>
                    <p className="text-xs text-slate-500">Will be saved when you save the task</p>
                  </div>
                ) : (
                  <div className="pointer-events-none space-y-1">
                    <div className="text-3xl mb-2">📂</div>
                    <p className="text-sm font-medium text-slate-300">
                      {isDragging ? 'Drop here' : 'Drag & drop or click to upload'}
                    </p>
                    <p className="text-xs text-slate-500">data.json from prepare_data.py</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowPaste(s => !s)}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPaste ? '▾' : '▸'} Or paste JSON
              </button>
              {showPaste && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    rows={5}
                    placeholder={'[\n  { "id": "1", "imageName": "...", "caption": "..." }\n]'}
                    className="w-full px-3 py-2 rounded-md border border-[#2a2d42] bg-[#0d0f1a] text-slate-300 text-xs font-mono resize-none focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => loadJson(pasteText)}
                    className="px-3 py-1.5 text-xs text-white bg-[#1c1f33] hover:bg-[#252840] border border-[#2a2d42] rounded-md"
                  >
                    Load
                  </button>
                </div>
              )}
              {uploadError && <p className="text-red-400 text-xs">{uploadError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TabButton({ active, onClick, border, children }: {
  active: boolean; onClick: () => void; border?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium transition-colors ${border ? 'border-l border-[#2a2d42]' : ''} ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
    >
      {children}
    </button>
  )
}

// ── Task setup page ────────────────────────────────────────────────────────────

export function TaskSetupPage() {
  const { tasks, editingTaskId, saveTask, setEditingTask, navigate, adminMode, profile, user } = useStore()

  const existingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) : null
  const [taskId] = useState(() => existingTask?.id ?? generateId())
  const [taskName, setTaskName] = useState(existingTask?.name ?? '')
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>(existingTask?.questions ?? [])
  const [activeCatId, setActiveCatId] = useState(PRESET_CATEGORIES[0].id)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Pending dataset staged for save
  const [pendingDatapoints, setPendingDatapoints] = useState<Datapoint[] | null>(null)
  const [pendingImagesFolderId, setPendingImagesFolderId] = useState('')
  const [pendingMessagesFolderId, setPendingMessagesFolderId] = useState('')

  const userEmail = profile?.email ?? user?.email ?? ''

  if (!adminMode) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center text-slate-400">
        <div className="text-center">
          <p className="mb-4">Admin access required to create tasks.</p>
          <button onClick={() => navigate('home')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-md">
            Go Home
          </button>
        </div>
      </div>
    )
  }

  const selectedIds = new Set(selectedQuestions.map((q) => q.id))

  const toggleQuestion = (q: Question) => {
    if (selectedIds.has(q.id)) {
      setSelectedQuestions((prev) => prev.filter((sq) => sq.id !== q.id))
    } else {
      setSelectedQuestions((prev) => [...prev, q])
    }
  }

  const addCategory = (catId: string) => {
    const cat = PRESET_CATEGORIES.find((c) => c.id === catId)
    if (!cat) return
    setSelectedQuestions((prev) => {
      const newOnes = cat.questions.filter((q) => !selectedIds.has(q.id))
      return [...prev, ...newOnes]
    })
  }

  const removeQuestion = (id: string) => {
    setSelectedQuestions((prev) => prev.filter((q) => q.id !== id))
  }

  const moveQuestion = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= selectedQuestions.length) return
    const arr = [...selectedQuestions]
    ;[arr[index], arr[next]] = [arr[next], arr[index]]
    setSelectedQuestions(arr)
  }

  const handleSave = async () => {
    setError('')
    if (!taskName.trim()) { setError('Please enter a task name.'); return }
    if (selectedQuestions.length === 0) { setError('Please add at least one question.'); return }

    setSaving(true)
    const task: Task = {
      id: taskId,
      name: taskName.trim(),
      questions: selectedQuestions,
      createdAt: existingTask?.createdAt ?? new Date().toISOString(),
    }
    saveTask(task)

    if (pendingDatapoints) {
      try {
        await dbSaveDataset(taskId, pendingDatapoints, pendingImagesFolderId, pendingMessagesFolderId, userEmail)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save dataset')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setEditingTask(null)
    navigate('home')
  }

  const handleBack = () => {
    setEditingTask(null)
    navigate('home')
  }

  const activeCat = PRESET_CATEGORIES.find((c) => c.id === activeCatId)

  return (
    <div className="min-h-screen bg-[#0d0f1a] flex flex-col">
      <header className="border-b border-[#2a2d42] px-8 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={handleBack} className="text-slate-500 hover:text-white text-sm transition-colors">
            ← Back
          </button>
          <div className="h-4 w-px bg-[#2a2d42]" />
          <span className="text-slate-400 text-sm">{existingTask ? 'Edit Task' : 'New Task'}</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
        >
          {saving ? 'Saving…' : 'Save Task'}
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: question library */}
        <div className="w-80 flex-shrink-0 border-r border-[#2a2d42] flex flex-col">
          <div className="px-4 pt-4 pb-3 border-b border-[#2a2d42]">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Question Library</h2>
          </div>

          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto flex-shrink-0 max-h-52 border-b border-[#2a2d42]">
              {PRESET_CATEGORIES.map((cat) => {
                const allSelected = cat.questions.every((q) => selectedIds.has(q.id))
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCatId(cat.id)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${activeCatId === cat.id ? 'bg-[#1c1f33] text-white' : 'text-slate-400 hover:text-white hover:bg-[#1a1d2e]'}`}
                  >
                    <span>{cat.name}</span>
                    {allSelected && <span className="text-xs text-indigo-400">✓</span>}
                  </button>
                )
              })}
            </div>

            {activeCat && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-300">{activeCat.name}</span>
                  <button
                    onClick={() => addCategory(activeCat.id)}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Add all
                  </button>
                </div>
                {activeCat.questions.map((q) => {
                  const isSelected = selectedIds.has(q.id)
                  return (
                    <button
                      key={q.id}
                      onClick={() => toggleQuestion(q)}
                      className={`w-full text-left rounded-lg px-3 py-2.5 text-xs transition-colors border ${isSelected ? 'bg-indigo-900/30 border-indigo-700/50 text-indigo-300' : 'bg-[#1c1f33] border-[#2a2d42] text-slate-300 hover:border-indigo-500/40 hover:text-white'}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 w-3.5 h-3.5 flex-shrink-0 rounded border flex items-center justify-center text-[9px] font-bold ${isSelected ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-600'}`}>
                          {isSelected ? '✓' : ''}
                        </span>
                        <span className="leading-snug">{q.text}</span>
                      </div>
                      <div className="mt-1 ml-5 text-slate-500 text-[10px] capitalize">
                        {q.type === 'single' ? 'single choice' : q.type === 'multi' ? 'multi-select' : 'free text'}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: task config */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Task name */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Task Name</label>
              <input
                type="text"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="e.g. Propaganda Analysis — Spring 2026"
                className="w-full px-3 py-2.5 rounded-lg border border-[#2a2d42] bg-[#141624] text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Selected questions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Selected Questions ({selectedQuestions.length})
                </label>
                {selectedQuestions.length > 0 && (
                  <button onClick={() => setSelectedQuestions([])} className="text-xs text-slate-500 hover:text-red-400">
                    Clear all
                  </button>
                )}
              </div>

              {selectedQuestions.length === 0 ? (
                <div className="border border-dashed border-[#2a2d42] rounded-xl py-10 text-center text-slate-500 text-sm">
                  Select questions from the library on the left
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedQuestions.map((q, i) => (
                    <div
                      key={q.id}
                      className="flex items-start gap-3 bg-[#141624] border border-[#2a2d42] rounded-lg px-3 py-2.5"
                    >
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <button
                          onClick={() => moveQuestion(i, -1)}
                          disabled={i === 0}
                          className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-xs leading-none"
                        >▲</button>
                        <button
                          onClick={() => moveQuestion(i, 1)}
                          disabled={i === selectedQuestions.length - 1}
                          className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-xs leading-none"
                        >▼</button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 leading-snug">{q.text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500 capitalize">
                            {q.type === 'single' ? 'single choice' : q.type === 'multi' ? 'multi-select' : 'free text'}
                          </span>
                          <span className="text-xs text-slate-600">·</span>
                          <span className="text-xs text-indigo-500">{q.category.replace(/_/g, ' ')}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeQuestion(q.id)}
                        className="text-slate-600 hover:text-red-400 text-lg leading-none flex-shrink-0 mt-0.5"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Custom question builder */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Add Custom Question</label>
              <CustomQuestionBuilder onAdd={(q) => setSelectedQuestions((prev) => [...prev, q])} />
            </div>

            {/* Dataset */}
            <div className="border-t border-[#2a2d42] pt-6">
              <DatasetSection
                taskId={taskId}
                userEmail={userEmail}
                onDatapointsChange={(dps, imagesId, messagesId) => {
                  setPendingDatapoints(dps)
                  setPendingImagesFolderId(imagesId)
                  setPendingMessagesFolderId(messagesId)
                }}
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
