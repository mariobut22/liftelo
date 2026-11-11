import { useRef } from 'react'
import { AlertTriangle, Camera, Image as ImageIcon, RotateCcw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { MAX_PHOTOS_PER_FORM, type PhotoItem, type usePhotoQueue } from '../../hooks/usePhotoQueue'
import type { PhotoKind } from '../../types/intervention'

type Queue = ReturnType<typeof usePhotoQueue>

type PhotoPickerProps = {
  queue: Queue
  disabled?: boolean
  /** called when the user presses "retry" on a failed photo that was already being uploaded */
  onRetry?: () => void
}

const KINDS: PhotoKind[] = ['other', 'before', 'after']
const formatKb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * Photo selection for a form: camera (phones) and gallery (multi-select) buttons, thumbnails of ALL picked photos with
 * remove, optional before/after tag and caption, and a per-photo state (preparing / ready / uploading % / uploaded / failed).
 */
function PhotoPicker({ queue, disabled = false, onRetry }: PhotoPickerProps) {
  const { t } = useTranslation()
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const galleryRef = useRef<HTMLInputElement | null>(null)
  const canUseCamera = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const full = queue.items.length >= MAX_PHOTOS_PER_FORM

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = '' // the same photo can be picked again after removing it
    if (files.length === 0) return
    const { rejected } = await queue.addFiles(files)
    if (rejected > 0) toast.error(t('interventions:photos.errors.limit', { max: MAX_PHOTOS_PER_FORM }))
  }

  const statusText = (item: PhotoItem) => {
    switch (item.status) {
      case 'processing': return t('interventions:photos.status.processing')
      case 'uploading': return t('interventions:photos.status.uploading', { percent: item.progress })
      case 'uploaded': return t('interventions:photos.status.uploaded')
      case 'error': return item.error ?? t('interventions:photos.status.failed')
      default: return t('interventions:photos.status.ready', { size: formatKb(item.finalBytes) })
    }
  }

  return (
    <div className="space-y-3" data-testid="photo-picker">
      <div className="flex flex-wrap gap-2">
        {canUseCamera ? (
          <Button type="button" variant="secondary" disabled={disabled || full} onClick={() => cameraRef.current?.click()}>
            <Camera className="h-4 w-4" />
            {t('interventions:photos.takePhoto')}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" disabled={disabled || full} onClick={() => galleryRef.current?.click()}>
          <ImageIcon className="h-4 w-4" />
          {t('interventions:photos.fromGallery')}
        </Button>
        {/* camera: opens the rear camera directly on phones; gallery: normal picker, several photos at once */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="photo-input-camera" onChange={handleFiles} />
        <input ref={galleryRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="photo-input-gallery" onChange={handleFiles} />
      </div>

      {queue.items.length > 0 ? (
        <>
          <p className="text-xs text-zinc-500">{t('interventions:photos.selected', { count: queue.items.length })}</p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="photo-list">
            {queue.items.map((item) => (
              <li key={item.id} className="flex gap-3 rounded-xl border border-zinc-200 p-2" data-status={item.status}>
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      {item.status === 'error' ? (
                        <AlertTriangle className="h-6 w-6 text-rose-500" />
                      ) : (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                      )}
                    </div>
                  )}
                  {item.status === 'uploading' ? (
                    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/20">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${item.progress}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`min-w-0 break-words text-xs ${item.status === 'error' ? 'text-rose-600' : item.status === 'uploaded' ? 'text-emerald-600' : 'text-zinc-500'}`}
                    >
                      {statusText(item)}
                    </span>
                    {item.status !== 'uploading' && item.status !== 'uploaded' ? (
                      <button
                        type="button"
                        onClick={() => queue.remove(item.id)}
                        disabled={disabled}
                        aria-label={t('interventions:photos.remove')}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  {item.status === 'ready' || item.status === 'error' ? (
                    <>
                      <select
                        value={item.kind}
                        onChange={(event) => queue.setKind(item.id, event.target.value as PhotoKind)}
                        disabled={disabled || !item.blob}
                        aria-label={t('interventions:photos.kindLabel')}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700"
                      >
                        {KINDS.map((kind) => (
                          <option key={kind} value={kind}>{t(`interventions:photos.kind.${kind}`)}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={item.caption}
                        maxLength={255}
                        onChange={(event) => queue.setCaption(item.id, event.target.value)}
                        disabled={disabled || !item.blob}
                        placeholder={t('interventions:photos.captionPlaceholder')}
                        aria-label={t('interventions:photos.captionPlaceholder')}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700"
                      />
                    </>
                  ) : null}
                  {item.status === 'error' && item.blob && onRetry ? (
                    <button
                      type="button"
                      onClick={onRetry}
                      disabled={disabled}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t('interventions:photos.retry')}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs text-zinc-500">{t('interventions:photos.hint')}</p>
      )}
    </div>
  )
}

export default PhotoPicker
