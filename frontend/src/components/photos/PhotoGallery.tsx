import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import PhotoLightbox from './PhotoLightbox'
import type { PhotoKind } from '../../types/intervention'

export type GalleryPhoto = {
  src: string
  kind: PhotoKind
  caption: string | null
  takenAt: string | null
}

type PhotoGalleryProps = {
  photos: GalleryPhoto[]
  title: string
}

/** Thumbnail grid (3 columns on a phone); tapping a photo opens the lightbox on it. */
function PhotoGallery({ photos, title }: PhotoGalleryProps) {
  const { t } = useTranslation()
  const [index, setIndex] = useState<number | null>(null)

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="photo-gallery">
        {photos.map((photo, i) => (
          <li key={photo.src} className="min-w-0">
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              aria-label={photo.caption || t('interventions:photos.openPhoto', { number: i + 1 })}
            >
              <img src={photo.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:opacity-90" />
              {photo.kind !== 'other' ? (
                <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {t(`interventions:photos.kind.${photo.kind}`)}
                </span>
              ) : null}
            </button>
            {photo.caption ? <p className="mt-1 truncate text-xs text-zinc-500">{photo.caption}</p> : null}
          </li>
        ))}
      </ul>
      <PhotoLightbox photos={photos} index={index} onIndexChange={setIndex} title={title} />
    </>
  )
}

export default PhotoGallery
