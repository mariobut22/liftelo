import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList, Eye, MapPin, QrCode, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import InterventionCreateModal from '../interventions/InterventionCreateModal'
import RmsCreateModal from '../rms/RmsCreateModal'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { parseScannedCode } from '../../lib/qrScan'
import QrOpenFaults from '../findings/QrOpenFaults'
import { ApiError, getElevatorByQr, type Finding } from '../../services/api'
import useAuthStore from '../../store/authStore'
import useQrScanStore from '../../store/qrScanStore'

// The camera + decoder code is a separate chunk: it is only downloaded when someone opens the scanner.
const QrScanner = lazy(() => import('./QrScanner'))

type Scanned = {
  token: string
  elevatorId: number
  label: string
  locationId: number
  locationName: string
  locationAddress: string | null
  openFindings: Finding[]
}

/**
 * Scan -> resolve -> choose flow, mounted once in AppLayout. Scanned text is only ever used as a token for the
 * authenticated lookup (never navigated to); the result sheet then offers New RMS / New intervention / View.
 */
type SessionProps = { onResolved: (scanned: Scanned) => void; onClose: () => void }

/** One scanner session (mounted while the scanner is open, so notice/busy state resets by itself on close). */
function ScannerSession({ onResolved, onClose }: SessionProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const busyRef = useRef(false)
  const noticeTimer = useRef<number | undefined>(undefined)
  const retryTimer = useRef<number | undefined>(undefined)
  const lastRejected = useRef<{ raw: string; at: number } | null>(null)

  useEffect(
    () => () => {
      window.clearTimeout(noticeTimer.current)
      window.clearTimeout(retryTimer.current)
    },
    []
  )

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500)
  }, [])

  const handleCode = async (raw: string) => {
    if (busyRef.current) return
    const last = lastRejected.current
    if (last && last.raw === raw && Date.now() - last.at < 2500) return // same wrong code still in view
    const token = parseScannedCode(raw)
    if (!token) {
      lastRejected.current = { raw, at: Date.now() }
      showNotice(t('locations:qr.scan.notLiftelo'))
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      lastRejected.current = { raw, at: Date.now() }
      showNotice(t('locations:qr.scan.offline'))
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      const { elevator, open_findings } = await getElevatorByQr(token)
      onResolved({
        token,
        elevatorId: elevator.id,
        label: elevator.label,
        locationId: elevator.location_id,
        locationName: elevator.location_name,
        locationAddress: elevator.location_address ?? null,
        openFindings: open_findings ?? [],
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) showNotice(t('locations:qr.scan.unknownCode'))
      else if (error instanceof ApiError && error.status === 0) showNotice(t('locations:qr.scan.offline'))
      else showNotice(error instanceof ApiError && error.message ? error.message : t('common:apiErrors.generic'))
      retryTimer.current = window.setTimeout(() => {
        busyRef.current = false
        setBusy(false)
      }, 1200) // do not re-read the same sticker in a tight loop
    }
  }

  return <QrScanner onCode={(raw) => void handleCode(raw)} onClose={onClose} paused={busy} notice={notice} />
}

function QrScanFlow() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const open = useQrScanStore((state) => state.open)
  const closeScanner = useQrScanStore((state) => state.closeScanner)
  const openScanner = useQrScanStore((state) => state.openScanner)
  const user = useAuthStore((state) => state.user)
  const companies = useAuthStore((state) => state.companies)
  const activeCompanyId = user?.company_id ?? companies[0]?.id
  const isViewer = companies.find((company) => company.id === activeCompanyId)?.role === 'viewer'

  const [scanned, setScanned] = useState<Scanned | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [rmsOpen, setRmsOpen] = useState(false)
  const [interventionOpen, setInterventionOpen] = useState(false)

  // A route change closes the scanner (the camera must never stay on in the background); so does hiding the tab
  useEffect(() => {
    closeScanner()
  }, [location.pathname, closeScanner])
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') closeScanner()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [closeScanner])

  const handleResolved = (result: Scanned) => {
    setScanned(result)
    closeScanner()
    setSheetOpen(true)
  }

  const startModal = (kind: 'rms' | 'intervention') => {
    setSheetOpen(false)
    if (kind === 'rms') setRmsOpen(true)
    else setInterventionOpen(true)
  }

  const viewElevator = () => {
    if (!scanned) return
    setSheetOpen(false)
    navigate(`/q/${encodeURIComponent(scanned.token)}`)
  }

  const scanAnother = () => {
    setSheetOpen(false)
    openScanner()
  }

  return (
    <>
      {open ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black text-sm text-white">
              {t('locations:qr.scan.starting')}
            </div>
          }
        >
          <ScannerSession onResolved={handleResolved} onClose={closeScanner} />
        </Suspense>
      ) : null}

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent
          data-testid="qr-scan-result"
          className="z-[60] max-w-md max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none"
        >
          <div className="min-h-0 space-y-4 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-zinc-100 p-2">
                <QrCode className="h-5 w-5 text-zinc-600" />
              </div>
              <div className="min-w-0">
                <DialogDescription className="text-xs uppercase tracking-wide">{t('locations:qr.scan.found')}</DialogDescription>
                <DialogTitle className="break-words text-xl">{scanned?.label}</DialogTitle>
                <p className="mt-1 flex items-start gap-1 text-sm text-zinc-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                  <span className="break-words">
                    {scanned?.locationName}
                    {scanned?.locationAddress ? ` — ${scanned.locationAddress}` : ''}
                  </span>
                </p>
              </div>
            </div>
            {scanned ? (
              <QrOpenFaults
                findings={scanned.openFindings}
                variant="sheet"
                onNavigate={() => setSheetOpen(false)}
                moreTo={`/q/${encodeURIComponent(scanned.token)}`}
              />
            ) : null}
            <div className="grid gap-2">
              {!isViewer ? (
                <>
                  <Button className="h-12 text-base" onClick={() => startModal('rms')}>
                    <ClipboardList className="h-5 w-5" />
                    {t('locations:qr.landing.newRms')}
                  </Button>
                  <Button className="h-12 text-base" variant="secondary" onClick={() => startModal('intervention')}>
                    <Wrench className="h-5 w-5" />
                    {t('locations:qr.landing.newIntervention')}
                  </Button>
                </>
              ) : null}
              <Button className="h-12 text-base" variant={isViewer ? 'default' : 'outline'} onClick={viewElevator}>
                <Eye className="h-5 w-5" />
                {t('locations:qr.scan.viewElevator')}
              </Button>
              <Button className="h-11" variant="ghost" onClick={scanAnother}>
                {t('locations:qr.scan.scanAnother')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!isViewer && scanned ? (
        <>
          <RmsCreateModal
            open={rmsOpen}
            onOpenChange={setRmsOpen}
            presetLocationId={scanned.locationId}
            presetElevatorId={scanned.elevatorId}
          />
          <InterventionCreateModal
            open={interventionOpen}
            onOpenChange={setInterventionOpen}
            presetLocationId={scanned.locationId}
            presetElevatorId={scanned.elevatorId}
          />
        </>
      ) : null}
    </>
  )
}

export default QrScanFlow
