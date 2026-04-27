import { useState, useEffect, useRef } from 'react'
import { loadFromDrive, translateDatapoints } from '../lib/driveApi'
import { useStore } from '../store'
import type { Datapoint } from '../types'

interface Props {
  clientId: string
  initialImagesFolderId: string
  initialMessagesFolderId: string
  defaultMessagesFolderId: string
  onLoaded: (datapoints: Datapoint[], imagesFolderId: string, messagesFolderId: string) => void
}

type Status = 'idle' | 'authing' | 'loading' | 'translating' | 'done' | 'error'

export function DriveLoader({ clientId, initialImagesFolderId, initialMessagesFolderId, defaultMessagesFolderId, onLoaded }: Props) {
  const { setDriveToken } = useStore()
  const [imagesFolderId, setImagesFolderId] = useState(initialImagesFolderId)
  const [messagesFolderId, setMessagesFolderId] = useState(initialMessagesFolderId || defaultMessagesFolderId)
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [stats, setStats] = useState<{ total: number; withCaption: number; channels: number } | null>(null)
  const [gisReady, setGisReady] = useState(false)
  const tokenRef = useRef<string | null>(null)

  const effectiveMessagesFolderId = defaultMessagesFolderId || messagesFolderId

  useEffect(() => {
    const check = () => {
      if (typeof google !== 'undefined' && google.accounts?.oauth2) {
        setGisReady(true)
      } else {
        setTimeout(check, 200)
      }
    }
    check()
  }, [])

  const validate = () => {
    if (!imagesFolderId.trim()) { setError('Enter an Images Folder ID.'); return false }
    if (!effectiveMessagesFolderId.trim()) { setError('Enter a Messages Folder ID.'); return false }
    setError('')
    return true
  }

  const runLoad = async (token: string) => {
    setStatus('loading')
    setProgress('Starting…')
    try {
      const result = await loadFromDrive(
        imagesFolderId.trim(),
        effectiveMessagesFolderId.trim(),
        token,
        setProgress,
      )
      setStats(result.stats)
      setStatus('translating')
      const translatedDps = await translateDatapoints(result.datapoints, setProgress)
      setStatus('done')
      onLoaded(translatedDps, imagesFolderId.trim(), effectiveMessagesFolderId.trim())
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'An unknown error occurred')
    }
  }

  const handleConnect = () => {
    if (!validate()) return
    if (!gisReady) { setError('Google Sign-In not loaded yet, please wait a moment.'); return }
    setStatus('authing')
    setError('')

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: (response) => {
        if (response.error) {
          setStatus('error')
          setError(`Sign-in failed: ${response.error_description ?? response.error}`)
          return
        }
        tokenRef.current = response.access_token
        setDriveToken(response.access_token)
        runLoad(response.access_token)
      },
      error_callback: () => {
        setStatus('idle')
        setError('Sign-in was cancelled.')
      },
    })

    tokenClient.requestAccessToken({ prompt: tokenRef.current ? '' : 'consent' })
  }

  const handleReset = () => {
    setStatus('idle')
    setStats(null)
    setError('')
  }

  const isBusy = status === 'loading' || status === 'translating' || status === 'authing'

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <FolderInput
          label="Images folder ID"
          hint="from the folder URL"
          value={imagesFolderId}
          onChange={setImagesFolderId}
          disabled={isBusy}
          placeholder="1RGA5DGjORl3XDKcemMre…"
        />
        {!defaultMessagesFolderId && (
          <FolderInput
            label="Messages folder ID"
            hint="contains channel .json files"
            value={messagesFolderId}
            onChange={setMessagesFolderId}
            disabled={isBusy}
            placeholder="1O63dutFjZFlXnaHv3vy…"
          />
        )}
      </div>

      {status === 'idle' || status === 'error' ? (
        <button
          onClick={handleConnect}
          disabled={!gisReady}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <GoogleIcon />
          Sign in &amp; Load Data
        </button>
      ) : status === 'authing' ? (
        <div className="text-center py-2.5 text-sm text-slate-400 animate-pulse">
          Waiting for Google sign-in popup…
        </div>
      ) : status === 'loading' || status === 'translating' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Spinner />
            <span className="truncate">{progress}</span>
          </div>
          <div className="h-1 bg-[#2a2d42] rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full animate-[pulse_1.5s_ease-in-out_infinite] w-3/5" />
          </div>
        </div>
      ) : status === 'done' && stats ? (
        <div className="rounded-lg bg-emerald-900/20 border border-emerald-700/40 px-4 py-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-emerald-400 text-sm font-medium">✓ Loaded from Google Drive</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {stats.total} images · {stats.withCaption} with captions · {stats.channels} channels
            </p>
          </div>
          <button
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-slate-300 flex-shrink-0 mt-0.5"
          >
            Reload
          </button>
        </div>
      ) : null}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {!gisReady && status === 'idle' && (
        <p className="text-xs text-slate-600">Loading Google Sign-In…</p>
      )}
    </div>
  )
}

interface FolderInputProps {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  placeholder: string
}

function FolderInput({ label, hint, value, onChange, disabled, placeholder }: FolderInputProps) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">
        {label}
        <span className="text-slate-600 ml-1">({hint})</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-md border border-[#2a2d42] bg-[#0d0f1a] text-slate-200 text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
      />
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-indigo-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
