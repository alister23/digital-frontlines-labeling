import { useState, useEffect } from 'react'
import { useStore } from '../store'

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files'

// Module-level cache: fileId → object URL (persists for page lifetime)
const blobCache = new Map<string, string>()

interface Props {
  src: string | undefined
  alt?: string
  className?: string
  style?: React.CSSProperties
  onError?: () => void
}

export function AuthenticatedImage({ src, alt, className, style, onError }: Props) {
  const driveToken = useStore(s => s.driveToken)
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!src) return

    // Plain URL — use directly
    if (!src.startsWith('drive://')) {
      setResolvedSrc(src)
      return
    }

    const fileId = src.slice('drive://'.length)

    // Already cached
    if (blobCache.has(fileId)) {
      setResolvedSrc(blobCache.get(fileId)!)
      return
    }

    if (!driveToken) return

    let cancelled = false
    setLoading(true)

    fetch(`${DRIVE_API}/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${driveToken}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.blob()
      })
      .then(blob => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        blobCache.set(fileId, url)
        setResolvedSrc(url)
      })
      .catch(() => {
        if (!cancelled) onError?.()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [src, driveToken, onError])

  if (!src) return null

  if (loading) {
    return (
      <div className={`flex items-center justify-center text-slate-600 text-xs ${className ?? ''}`} style={style}>
        <svg className="animate-spin w-4 h-4 text-slate-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    )
  }

  if (!resolvedSrc) return null

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      style={style}
      onError={onError}
    />
  )
}
