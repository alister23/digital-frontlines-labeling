import type { Datapoint } from '../types'

const DRIVE = 'https://www.googleapis.com/drive/v3'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  thumbnailLink?: string
}

// ── Low-level Drive helpers ────────────────────────────────────────────────────

async function listFolder(folderId: string, token: string): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink)',
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await fetch(`${DRIVE}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Drive API ${res.status}: ${body}`)
    }
    const data = await res.json() as { files?: DriveFile[]; nextPageToken?: string }
    files.push(...(data.files ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return files
}

// Recursively finds all JSON files under a folder (traverses subfolders).
async function listJsonFilesRecursive(folderId: string, token: string): Promise<DriveFile[]> {
  const items = await listFolder(folderId, token)
  const jsonFiles: DriveFile[] = []
  const subfolderIds: string[] = []

  for (const item of items) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      subfolderIds.push(item.id)
    } else if (item.name.endsWith('.json')) {
      jsonFiles.push(item)
    }
  }

  if (subfolderIds.length > 0) {
    const nested = await Promise.all(subfolderIds.map(id => listJsonFilesRecursive(id, token)))
    jsonFiles.push(...nested.flat())
  }

  return jsonFiles
}

async function downloadText(fileId: string, token: string): Promise<string> {
  const res = await fetch(`${DRIVE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Download failed (${fileId}): ${res.status}`)
  return res.text()
}

// ── Caption index ──────────────────────────────────────────────────────────────

// { channelName → { postId → captionText } }
type CaptionIndex = Map<string, Map<number, string>>

async function buildCaptionIndex(
  messagesFolderId: string,
  token: string,
  onProgress: (msg: string) => void,
): Promise<CaptionIndex> {
  onProgress('Scanning caption files…')
  const jsonFiles = await listJsonFilesRecursive(messagesFolderId, token)
  onProgress(`Found ${jsonFiles.length} channel file${jsonFiles.length !== 1 ? 's' : ''}. Downloading…`)

  const index: CaptionIndex = new Map()
  const BATCH = 8

  for (let i = 0; i < jsonFiles.length; i += BATCH) {
    const batch = jsonFiles.slice(i, i + BATCH)
    onProgress(`Loading captions… ${Math.min(i + BATCH, jsonFiles.length)} / ${jsonFiles.length}`)

    await Promise.all(
      batch.map(async file => {
        try {
          const text = await downloadText(file.id, token)
          const records = JSON.parse(text) as Array<{ id?: number | string; caption?: string }>
          const channel = file.name.replace(/\.json$/, '')
          const map = new Map<number, string>()
          for (const r of records) {
            if (r.id != null && r.caption && String(r.caption).trim() !== '' && r.caption !== 'null') {
              map.set(Number(r.id), String(r.caption))
            }
          }
          index.set(channel, map)
        } catch (e) {
          console.warn(`Skipping ${file.name}:`, e)
        }
      })
    )
  }

  return index
}

// ── Filename parsing ───────────────────────────────────────────────────────────

// "{post_id}_...|{channel_name}.jpg" → { channel, postId }
function parseFilename(filename: string): { channel: string | null; postId: number | null } {
  const stem = filename.replace(/\.[^.]+$/, '')
  if (!stem.includes('|')) return { channel: null, postId: null }
  try {
    const parts = stem.split('|')
    const channel = parts[parts.length - 1]
    const postId = parseInt(stem.split('_')[0], 10)
    if (!channel || isNaN(postId)) return { channel: null, postId: null }
    return { channel, postId }
  } catch {
    return { channel: null, postId: null }
  }
}

export function makeImageUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${fileId}`
}

// ── Translation ────────────────────────────────────────────────────────────────

async function translateText(text: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Translate ${res.status}`)
  const data = await res.json() as [Array<[string, ...unknown[]]>, ...unknown[]]
  return data[0].map(chunk => chunk[0]).join('')
}

export async function translateDatapoints(
  datapoints: Datapoint[],
  onProgress: (msg: string) => void,
): Promise<Datapoint[]> {
  const toTranslate = datapoints.filter(dp => dp.caption && !dp.captionTranslated)
  if (toTranslate.length === 0) return datapoints

  const translated = new Map<string, string>()
  const BATCH = 5

  for (let i = 0; i < toTranslate.length; i += BATCH) {
    const batch = toTranslate.slice(i, i + BATCH)
    onProgress(`Translating captions… ${Math.min(i + BATCH, toTranslate.length)} / ${toTranslate.length}`)
    await Promise.all(batch.map(async dp => {
      try {
        const result = await translateText(dp.caption as string)
        translated.set(dp.id, result)
      } catch (e) {
        console.warn(`Translation failed for ${dp.id}:`, e)
      }
    }))
  }

  return datapoints.map(dp =>
    translated.has(dp.id) ? { ...dp, captionTranslated: translated.get(dp.id) } : dp
  )
}

// ── Main pipeline ──────────────────────────────────────────────────────────────

export interface DriveLoadStats {
  total: number
  withCaption: number
  channels: number
}

export interface DriveLoadResult {
  datapoints: Datapoint[]
  stats: DriveLoadStats
}

export async function loadFromDrive(
  imagesFolderId: string,
  messagesFolderId: string,
  token: string,
  onProgress: (msg: string) => void,
): Promise<DriveLoadResult> {
  // 1. List images
  onProgress('Listing images…')
  const all = await listFolder(imagesFolderId, token)
  const images = all
    .filter(f => f.mimeType.startsWith('image/'))
    .sort((a, b) => a.name.localeCompare(b.name))
  onProgress(`Found ${images.length} image${images.length !== 1 ? 's' : ''}`)

  // 2. Build caption index from messages folder
  const captionIndex = await buildCaptionIndex(messagesFolderId, token, onProgress)

  // 3. Match
  onProgress('Matching images to captions…')
  let withCaption = 0

  const datapoints: Datapoint[] = images.map(file => {
    const { channel, postId } = parseFilename(file.name)
    const caption = (channel && postId != null)
      ? (captionIndex.get(channel)?.get(postId) ?? null)
      : null
    if (caption) withCaption++
    return {
      id: file.name.replace(/\.[^.]+$/, ''),
      imageName: file.name,
      imageUrl: `drive://${file.id}`,
      caption: caption ?? undefined,
      captionTranslated: undefined,
      channel: channel ?? undefined,
      postId: postId ?? undefined,
    }
  })

  return {
    datapoints,
    stats: { total: images.length, withCaption, channels: captionIndex.size },
  }
}
