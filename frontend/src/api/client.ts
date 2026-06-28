const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export interface Media {
  id: string
  filename: string
  object_key: string
  thumbnail_key: string
  file_size: number
  media_type: 'photo' | 'video'
  mime_type: string
  width: number | null
  height: number | null
  taken_at: string
  uploaded_at: string
  signed_thumbnail_url: string
}

export interface MediaDetail extends Media {
  signed_thumbnail_url: string
}

export interface ListMediaResponse {
  items: Media[]
  next_cursor: string | null
}

export interface DownloadResponse {
  signed_url: string
  filename: string
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = `HTTP ${res.status}`
    try {
      const body = JSON.parse(text)
      if (body.error) msg = body.error
    } catch { /* not JSON */ }
    throw new Error(msg)
  }
  return res.json()
}

export async function listMedia(params?: {
  cursor?: string
  limit?: number
  media_type?: 'photo' | 'video'
}): Promise<ListMediaResponse> {
  const searchParams = new URLSearchParams()
  if (params?.cursor) searchParams.set('cursor', params.cursor)
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.media_type) searchParams.set('media_type', params.media_type)
  const qs = searchParams.toString()
  return fetchJson(`${API_BASE}/media${qs ? `?${qs}` : ''}`)
}

export async function getMediaDetail(id: string): Promise<MediaDetail> {
  return fetchJson(`${API_BASE}/media/${id}`)
}

export async function getDownloadUrl(id: string): Promise<DownloadResponse> {
  return fetchJson(`${API_BASE}/media/${id}/download`)
}
