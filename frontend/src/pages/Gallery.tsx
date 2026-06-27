import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Media, ListMediaResponse } from '@/api/client'
import { listMedia } from '@/api/client'
import { MediaCard } from '@/components/MediaCard'
import { Skeleton } from '@/components/ui/skeleton'

const PAGE_SIZE = 50

export function Gallery() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Media[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(async (pageCursor?: string) => {
    try {
      setLoading(true)
      setError(null)
      const data: ListMediaResponse = await listMedia({
        cursor: pageCursor,
        limit: PAGE_SIZE,
      })
      if (pageCursor) {
        setItems((prev) => [...prev, ...data.items])
      } else {
        setItems(data.items)
      }
      setCursor(data.next_cursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load media')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPage()
  }, [fetchPage])

  const handleCardClick = (id: string) => {
    navigate(`/media/${id}`)
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-500">{error}</p>
          <button
            onClick={() => fetchPage()}
            className="mt-4 text-sm text-neutral-500 underline hover:text-neutral-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">pic</h1>
        <p className="mt-1 text-neutral-500">Personal Image Cloud</p>
      </header>

      {items.length === 0 && !loading && (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-neutral-400">No media yet. Upload with `pic upload` from CLI.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {items.map((media) => (
          <MediaCard key={media.id} media={media} onClick={handleCardClick} />
        ))}
        {loading &&
          Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={`skeleton-${i}`} className="aspect-square rounded-lg" />
          ))}
      </div>

      {cursor && !loading && (
        <div className="mt-8 text-center">
          <button
            onClick={() => fetchPage(cursor)}
            className="rounded-md border border-neutral-200 px-6 py-2 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  )
}
