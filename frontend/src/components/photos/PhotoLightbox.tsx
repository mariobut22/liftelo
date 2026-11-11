import { useCallback, useEffect, useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { getLocale } from '../../i18n'
import type { GalleryPhoto } from './PhotoGallery'

type PhotoLightboxProps = {
  photos: GalleryPhoto[]
  index: number | null
  onIndexChange: (index: number | null) => void
  title: string
}

const SWIPE_PX = 50

/** Full-screen viewer: arrow keys / buttons / swipe to move, Esc or X to close, caption and before/after tag underneath. */
function PhotoLightbox({ photos, index, onIndexChange, title }: PhotoLightboxProps) {
  const { t } = useTranslation()
  const open = index !== null
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const count = photos.length

  const go = useCallback(
    (step: number) => {
      if (index === null || count === 0) return
      onIndexChange((index + step + count) % count)
    },
    [count, index, onIndexChange]
  )

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, go])

  // load the neighbours in the background so swiping feels instant
  useEffect(() => {
    if (index === null || count < 2) return
    ;[(index + 1) % count, (index - 1 + count) % count].forEach((i) => {
      const img = new Image()
      img.src = photos[i].src
    })
  }, [index, count, photos])

  const photo = index !== null ? photos[index] : null
  const takenAt = photo?.takenAt ? new Date(photo.takenAt).toLocaleString(getLocale()) : null

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onIndexChange(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/90" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[60] flex flex-col outline-none"
          data-testid="photo-lightbox"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-sm tabular-nums" data-testid="photo-counter">
              {index !== null ? t('interventions:photos.lightbox.counter', { current: index + 1, total: count }) : ''}
            </span>
            <DialogPrimitive.Close
              aria-label={t('interventions:photos.lightbox.close')}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-2"
            style={{ touchAction: 'pan-y' }}
            onPointerDown={(event) => { touchStart.current = { x: event.clientX, y: event.clientY } }}
            onPointerUp={(event) => {
              const start = touchStart.current
              touchStart.current = null
              if (!start) return
              const dx = event.clientX - start.x
              const dy = event.clientY - start.y
              if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
            }}
            onPointerCancel={() => { touchStart.current = null }}
          >
            {count > 1 ? (
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={t('interventions:photos.lightbox.previous')}
                className="absolute left-2 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:flex"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            ) : null}
            {photo ? (
              <img
                key={photo.src}
                src={photo.src}
                alt={photo.caption || title}
                draggable={false}
                className="max-h-full max-w-full select-none object-contain"
                data-testid="photo-lightbox-image"
              />
            ) : null}
            {count > 1 ? (
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={t('interventions:photos.lightbox.next')}
                className="absolute right-2 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:flex"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            ) : null}
          </div>

          <div className="min-h-[4.5rem] space-y-1 px-4 py-3 text-center text-white" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {photo && photo.kind !== 'other' ? (
              <span className="inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
                {t(`interventions:photos.kind.${photo.kind}`)}
              </span>
            ) : null}
            {photo?.caption ? <p className="text-sm" data-testid="photo-caption">{photo.caption}</p> : null}
            {takenAt ? <p className="text-xs text-white/60">{takenAt}</p> : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export default PhotoLightbox
