import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ImageProcessError, processImage } from '../lib/imagePipeline'
import { newClientRequestId, uploadInterventionPhoto } from '../lib/photoUpload'
import type { PhotoKind } from '../types/intervention'

export const MAX_PHOTOS_PER_FORM = 20

export type PhotoStatus = 'processing' | 'ready' | 'uploading' | 'uploaded' | 'error'

export type PhotoItem = {
  id: string
  previewUrl: string | null
  status: PhotoStatus
  progress: number
  error: string | null
  kind: PhotoKind
  caption: string
  blob: Blob | null
  takenAt: string | null
  clientRequestId: string
  originalBytes: number
  finalBytes: number
}

const makeId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/**
 * Photos picked in a form: each one is compressed on the phone (status processing -> ready), shown as a thumbnail,
 * can be removed, tagged and captioned, and is then uploaded one by one with progress and per-photo retry.
 */
export function usePhotoQueue() {
  const { t } = useTranslation()
  const [items, setItems] = useState<PhotoItem[]>([])
  // itemsRef is the source of truth (updated synchronously, so async upload loops read current statuses);
  // `items` state only drives rendering
  const itemsRef = useRef<PhotoItem[]>([])
  const removedRef = useRef(new Set<string>())
  const uploadingRef = useRef(false)

  const commit = useCallback((next: PhotoItem[]) => {
    itemsRef.current = next
    setItems(next)
  }, [])

  const patch = useCallback((id: string, changes: Partial<PhotoItem>) => {
    commit(itemsRef.current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
  }, [commit])

  // free object URLs when the form goes away
  useEffect(() => () => {
    itemsRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl))
  }, [])

  const addFiles = useCallback(
    async (files: File[]): Promise<{ rejected: number }> => {
      const room = Math.max(0, MAX_PHOTOS_PER_FORM - itemsRef.current.length)
      const accepted = files.slice(0, room)
      const placeholders: PhotoItem[] = accepted.map((file) => ({
        id: makeId(),
        previewUrl: null,
        status: 'processing',
        progress: 0,
        error: null,
        kind: 'other',
        caption: '',
        blob: null,
        takenAt: null,
        clientRequestId: newClientRequestId(),
        originalBytes: file.size,
        finalBytes: 0,
      }))
      commit([...itemsRef.current, ...placeholders])

      // one at a time so a burst of 10 camera photos does not freeze the phone
      for (let index = 0; index < accepted.length; index += 1) {
        const { id } = placeholders[index]
        try {
          const result = await processImage(accepted[index])
          if (removedRef.current.has(id)) continue
          patch(id, {
            status: 'ready',
            blob: result.blob,
            takenAt: result.takenAt,
            finalBytes: result.blob.size,
            previewUrl: URL.createObjectURL(result.blob),
          })
        } catch (error) {
          if (removedRef.current.has(id)) continue
          const code = error instanceof ImageProcessError ? error.code : 'decode_failed'
          patch(id, { status: 'error', error: t(`interventions:photos.errors.${code}`) })
        }
      }
      return { rejected: files.length - accepted.length }
    },
    [commit, patch, t]
  )

  const remove = useCallback((id: string) => {
    removedRef.current.add(id)
    const target = itemsRef.current.find((item) => item.id === id)
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    commit(itemsRef.current.filter((item) => item.id !== id))
  }, [commit])

  const setKind = useCallback((id: string, kind: PhotoKind) => patch(id, { kind }), [patch])
  const setCaption = useCallback((id: string, caption: string) => patch(id, { caption }), [patch])

  /** Uploads every photo that is ready or failed. Resolves with how many are still not uploaded. */
  const uploadAll = useCallback(
    async (interventionId: number): Promise<{ failed: number; pending: number }> => {
      if (uploadingRef.current) return { failed: 0, pending: itemsRef.current.length }
      uploadingRef.current = true
      try {
        for (const item of itemsRef.current) {
          if (item.status === 'uploaded' || !item.blob) continue
          if (item.status !== 'ready' && item.status !== 'error') continue
          patch(item.id, { status: 'uploading', progress: 0, error: null })
          try {
            await uploadInterventionPhoto(
              interventionId,
              item.blob,
              { clientRequestId: item.clientRequestId, kind: item.kind, caption: item.caption, takenAt: item.takenAt },
              { onProgress: (progress) => patch(item.id, { progress }) }
            )
            patch(item.id, { status: 'uploaded', progress: 100 })
          } catch (error) {
            patch(item.id, { status: 'error', error: error instanceof Error ? error.message : t('common:apiErrors.generic') })
          }
        }
      } finally {
        uploadingRef.current = false
      }
      const left = itemsRef.current.filter((item) => item.status !== 'uploaded')
      return { failed: left.filter((item) => item.status === 'error').length, pending: left.length }
    },
    [patch, t]
  )

  const reset = useCallback(() => {
    itemsRef.current.forEach((item) => {
      removedRef.current.add(item.id)
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    })
    commit([])
  }, [commit])

  const busy = items.some((item) => item.status === 'processing' || item.status === 'uploading')
  return { items, addFiles, remove, setKind, setCaption, uploadAll, reset, busy }
}
