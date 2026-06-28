import { type Media, thumbnailUrl } from '@/api/client'
import { cn } from '@/lib/utils'

interface MediaCardProps {
  media: Media
  onClick: (id: string) => void
}

export function MediaCard({ media, onClick }: MediaCardProps) {
  return (
    <button
      onClick={() => onClick(media.id)}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-lg border border-neutral-200',
        'dark:border-neutral-700',
        'transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400',
      )}
    >
      <img
        src={thumbnailUrl(media.id)}
        alt={media.filename}
        className="h-full w-full object-cover transition-transform group-hover:scale-105"
        loading="lazy"
      />
      {/* Overlay with file info */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="truncate text-left text-xs text-white">{media.filename}</p>
        <div className="flex gap-2 text-[10px] text-neutral-300">
          <span>{formatSize(media.file_size)}</span>
          {media.media_type === 'video' && <span>🎬</span>}
        </div>
      </div>
    </button>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
