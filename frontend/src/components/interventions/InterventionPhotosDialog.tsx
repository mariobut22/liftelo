import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import PhotoGallery, { type GalleryPhoto } from '../photos/PhotoGallery'
import { API_BASE_URL, getInterventionPhotos } from '../../services/api'

type InterventionPhotosDialogProps = {
  interventionId: number | null
  locationName?: string | null
  onClose: () => void
}

/** Read-only photo viewer for one intervention (also for viewers). Opens the lightbox on tap. */
function InterventionPhotosDialog({ interventionId, locationName, onClose }: InterventionPhotosDialogProps) {
  const { t } = useTranslation()
  const { data, isLoading, error } = useQuery({
    queryKey: ['intervention-photos', interventionId],
    queryFn: () => getInterventionPhotos(interventionId as number),
    enabled: interventionId !== null,
  })

  const photos = useMemo<GalleryPhoto[]>(
    () =>
      (data?.photos ?? []).map((photo) => ({
        src: `${API_BASE_URL}${photo.file_path}`,
        kind: photo.kind,
        caption: photo.caption,
        takenAt: photo.taken_at,
      })),
    [data]
  )

  const title = t('interventions:photos.dialogTitle')

  return (
    <Dialog open={interventionId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <div className="shrink-0 border-b border-zinc-200 px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{locationName || t('interventions:photos.dialogDescription')}</DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <p className="text-sm text-zinc-500">{t('common:states.loading')}</p>
          ) : error ? (
            <p className="text-sm text-rose-600">{error instanceof Error ? error.message : t('common:apiErrors.generic')}</p>
          ) : photos.length === 0 ? (
            <p className="text-sm text-zinc-500" data-testid="photos-empty">{t('interventions:photos.none')}</p>
          ) : (
            <PhotoGallery photos={photos} title={title} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default InterventionPhotosDialog
