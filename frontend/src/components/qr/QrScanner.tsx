import { useCallback, useEffect, useRef, useState } from 'react'
import { Flashlight, FlashlightOff, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../ui/button'
import { createQrDecoder } from '../../lib/qrScan'

type CameraError = 'denied' | 'noCamera' | 'insecure' | 'unsupported' | 'inUse' | 'generic'

type QrScannerProps = {
  /** Raw decoded text. Validation (our own URLs only) is done by the caller. */
  onCode: (raw: string) => void
  onClose: () => void
  /** True while the caller is looking a code up: the camera keeps running but nothing is decoded. */
  paused: boolean
  /** Message for the last rejected/failed scan, shown over the preview. */
  notice: string | null
}

const SCAN_INTERVAL_MS = 150

const classifyError = (error: unknown): CameraError => {
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'noCamera'
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'inUse'
  return 'generic'
}

/**
 * Full-screen camera scanner. The camera stream is stopped on unmount (close, route change, hidden tab), so the
 * camera light never stays on. Loaded lazily (see QrScanFlow) so it does not enlarge the main bundle.
 */
function QrScanner({ onCode, onClose, paused, notice }: QrScannerProps) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const pausedRef = useRef(paused)
  const onCodeRef = useRef(onCode)
  const [error, setError] = useState<CameraError | null>(null)
  const [starting, setStarting] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  useEffect(() => {
    pausedRef.current = paused
    onCodeRef.current = onCode
  })

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    let timer: number | undefined

    const stop = () => {
      window.clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      trackRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }

    const fail = (kind: CameraError) => {
      setError(kind)
      setStarting(false)
    }

    const start = async () => {
      if (!window.isSecureContext) {
        fail('insecure')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        fail('unsupported')
        return
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop()) // closed while the permission prompt was open
          return
        }
        stream = media
        const track = media.getVideoTracks()[0] as MediaStreamTrack | undefined
        trackRef.current = track ?? null
        setTorchSupported(Boolean((track?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch))
        const video = videoRef.current
        if (!video) return
        video.srcObject = media
        await video.play().catch(() => undefined)
        const decode = await createQrDecoder()
        if (cancelled) return
        setStarting(false)
        let busy = false
        const tick = async () => {
          if (cancelled) return
          if (!busy && !pausedRef.current && video.readyState >= 2) {
            busy = true
            try {
              const text = await decode(video)
              if (text && !cancelled && !pausedRef.current) onCodeRef.current(text)
            } catch {
              // a single failed frame is not an error
            }
            busy = false
          }
          timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS)
        }
        void tick()
      } catch (err) {
        if (cancelled) return
        stop()
        setError(classifyError(err))
        setStarting(false)
      }
    }

    void start()
    return () => {
      cancelled = true
      stop()
    }
  }, [attempt])

  const retry = () => {
    setError(null)
    setStarting(true)
    setTorchSupported(false)
    setTorchOn(false)
    setAttempt((n) => n + 1)
  }

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch {
      setTorchSupported(false)
    }
  }, [torchOn])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('locations:qr.scan.title')}
      data-testid="qr-scanner"
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 className="text-base font-semibold">{t('locations:qr.scan.title')}</h2>
        <div className="flex items-center gap-1">
          {torchSupported ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-11 p-0 text-white hover:bg-white/15 hover:text-white"
              aria-pressed={torchOn}
              aria-label={t(torchOn ? 'locations:qr.scan.torchOff' : 'locations:qr.scan.torchOn')}
              onClick={() => void toggleTorch()}
            >
              {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 p-0 text-white hover:bg-white/15 hover:text-white"
            aria-label={t('locations:qr.scan.close')}
            onClick={onClose}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />

        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-center" role="alert">
            <p className="text-lg font-semibold">{t(`locations:qr.scan.errors.${error}.title`)}</p>
            <p className="max-w-sm text-sm text-zinc-300">{t(`locations:qr.scan.errors.${error}.text`)}</p>
            <p className="max-w-sm rounded-lg bg-white/10 p-3 text-sm text-zinc-100">{t('locations:qr.scan.fallbackHint')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {error !== 'insecure' && error !== 'unsupported' ? (
                <Button type="button" variant="secondary" className="h-11" onClick={retry}>
                  {t('locations:qr.scan.retry')}
                </Button>
              ) : null}
              <Button type="button" variant="outline" className="h-11 text-zinc-900" onClick={onClose}>
                {t('locations:qr.scan.close')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <div className="relative aspect-square w-[68%] max-w-[22rem] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
                <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-white" />
                <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-white" />
                <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-white" />
                <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-white" />
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
              {notice ? (
                <p role="alert" className="mx-auto max-w-sm rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white">
                  {notice}
                </p>
              ) : null}
              <p className="flex items-center justify-center gap-2 text-sm text-zinc-100">
                {starting || paused ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {starting
                  ? t('locations:qr.scan.starting')
                  : paused
                    ? t('locations:qr.scan.lookingUp')
                    : t('locations:qr.scan.hint')}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default QrScanner
