import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getMediaDetail, getDownloadUrl } from '@/api/client'
import type { MediaDetail } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function PhotoDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [media, setMedia] = useState<MediaDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)

    Promise.all([
      getMediaDetail(id),
      getDownloadUrl(id),
    ])
      .then(([detail, dl]) => {
        setMedia(detail)
        setDownloadUrl(dl.signed_url)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load media')
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="mb-4 h-8 w-32" />
        <Skeleton className="aspect-[4/3] w-full rounded-lg" />
      </div>
    )
  }

  if (error || !media) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-500">{error || 'Media not found'}</p>
          <Button variant="ghost" onClick={() => navigate('/')} className="mt-4">
            Back to gallery
          </Button>
        </div>
      </div>
    )
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Button variant="ghost" onClick={() => navigate('/')} className="mb-4">
        ← Back
      </Button>

      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
        {media.media_type === 'video' ? (
          <video
            src={media.signed_thumbnail_url}
            controls
            className="w-full"
            poster={media.signed_thumbnail_url}
          />
        ) : (
          <img
            src={media.signed_thumbnail_url}
            alt={media.filename}
            className="w-full"
          />
        )}
      </div>

      <div className="mt-6 space-y-2">
        <h2 className="text-xl font-semibold">{media.filename}</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-neutral-500">Type</dt>
          <dd>{media.media_type === 'photo' ? 'Photo' : 'Video'}</dd>
          <dt className="text-neutral-500">Size</dt>
          <dd>{formatSize(media.file_size)}</dd>
          {media.width && media.height && (
            <>
              <dt className="text-neutral-500">Dimensions</dt>
              <dd>{media.width} × {media.height}</dd>
            </>
          )}
          <dt className="text-neutral-500">Taken</dt>
          <dd>{new Date(media.taken_at).toLocaleDateString('ja-JP')}</dd>
          <dt className="text-neutral-500">Uploaded</dt>
          <dd>{new Date(media.uploaded_at).toLocaleDateString('ja-JP')}</dd>
        </dl>
      </div>

      {downloadUrl && (
        <div className="mt-6">
          <a
            href={downloadUrl}
            download={media.filename}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Download original
          </a>
        </div>
      )}
    </div>
  )
}
