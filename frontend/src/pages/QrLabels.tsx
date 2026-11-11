import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, Printer, RefreshCw } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { QrLabel, QrSheet } from '../components/locations/QrLabel'
import { QR_SHEET_LAYOUTS, SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from '../lib/qrLayout'
import type { QrSheetLayout } from '../lib/qrLayout'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { createQrLabels, regenerateElevatorQr } from '../services/api'
import type { QrLabelData } from '../services/api'
import { downloadHref, downloadSvg, fileSafeName, qrPngDataUrl, qrSvgString, qrUrl } from '../lib/qr'
import useAuthStore from '../store/authStore'

const asId = (value: string | null) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** Admin-only print view: /dashboard/qr-labels[?location=ID][&elevator=ID]  (no filter = all elevators of the company). */
function QrLabels() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const [searchParams] = useSearchParams()
  const locationId = asId(searchParams.get('location'))
  const elevatorId = asId(searchParams.get('elevator'))
  const [layout, setLayout] = useState<QrSheetLayout>('3x8')

  const queryKey = ['qr-labels', locationId ?? null, elevatorId ?? null]
  const { data: labels, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => createQrLabels({ location_id: locationId, elevator_id: elevatorId }),
    enabled: isAdmin,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })

  const regenerate = useMutation({
    mutationFn: (id: number) => regenerateElevatorQr(id),
    onSuccess: (fresh) => {
      queryClient.setQueryData<QrLabelData[]>(queryKey, (current) =>
        (current ?? []).map((row) => (row.id === fresh.id ? fresh : row))
      )
      toast.success(t('locations:qr.labels.regenerated'))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // The print copy lives directly under <body>; while this page is open only that copy is printed (see qr-labels.css).
  const [printRoot] = useState(() => {
    const root = document.createElement('div')
    root.className = 'qr-print-root'
    return root
  })
  useEffect(() => {
    document.body.appendChild(printRoot)
    document.body.classList.add('qr-printing')
    return () => {
      document.body.classList.remove('qr-printing')
      printRoot.remove()
    }
  }, [printRoot])

  const list = labels ?? []
  const { cols, rows } = QR_SHEET_LAYOUTS[layout]
  const aspect = (SHEET_WIDTH_MM / cols) / (SHEET_HEIGHT_MM / rows)
  const first = list[0]
  const backTo = locationId ? `/dashboard/locations/${locationId}` : '/dashboard/locations'
  const subtitle = elevatorId && first
    ? t('locations:qr.labels.forElevator', { name: `${first.location_name} / ${first.label}` })
    : locationId && first
      ? t('locations:qr.labels.forLocation', { name: first.location_name })
      : t('locations:qr.labels.forAll')

  const downloadPng = async (row: QrLabelData) => {
    downloadHref(await qrPngDataUrl(qrUrl(row.qr_token)), `${fileSafeName('qr', row.location_name, row.label)}.png`)
  }
  const downloadSvgFile = (row: QrLabelData) => {
    downloadSvg(qrSvgString(qrUrl(row.qr_token)), `${fileSafeName('qr', row.location_name, row.label)}.svg`)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" />
          {t('locations:qr.labels.back')}
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900">{t('locations:qr.labels.title')}</h1>
        {isAdmin ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
      </div>

      {!isAdmin ? (
        <Card className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-600 shadow-sm">
          {t('locations:qr.labels.adminOnly')}
        </Card>
      ) : isLoading ? (
        <div className="text-sm text-zinc-500">{t('locations:qr.labels.loading')}</div>
      ) : error ? (
        <Card className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
          {(error as Error).message}
        </Card>
      ) : list.length === 0 ? (
        <Card className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-600 shadow-sm">
          {t('locations:qr.labels.empty')}
        </Card>
      ) : (
        <>
          <Card className="space-y-4 rounded-xl border border-zinc-200 p-4 shadow-sm sm:p-6">
            <p className="text-sm text-zinc-600">{t('locations:qr.labels.intro')}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <label className="block space-y-1 text-sm font-medium text-zinc-700">
                <span>{t('locations:qr.labels.layout')}</span>
                <select
                  className="block h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm sm:w-72"
                  value={layout}
                  onChange={(event) => setLayout(event.target.value as QrSheetLayout)}
                >
                  <option value="3x8">{t('locations:qr.labels.layout3x8')}</option>
                  <option value="2x5">{t('locations:qr.labels.layout2x5')}</option>
                </select>
              </label>
              <Button className="h-11 w-full sm:w-auto" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                {t('locations:qr.labels.print')} ({t('locations:qr.labels.count', { count: list.length })})
              </Button>
            </div>
            <p className="text-xs text-zinc-500">{t('locations:qr.labels.printHint')}</p>
          </Card>

          <h2 className="text-sm font-semibold text-zinc-700">{t('locations:qr.labels.preview')}</h2>
          <div className="qr-preview" style={{ ['--qr-aspect' as string]: String(aspect) }}>
            {list.map((row) => (
              <div key={row.id} className="space-y-2">
                <QrLabel data={row} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void downloadPng(row)}>
                    <Download className="h-4 w-4" />
                    {t('locations:qr.labels.downloadPng')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadSvgFile(row)}>
                    <Download className="h-4 w-4" />
                    {t('locations:qr.labels.downloadSvg')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={regenerate.isPending}
                    onClick={() => {
                      if (!window.confirm(t('locations:qr.labels.regenerateConfirm'))) return
                      regenerate.mutate(row.id)
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t('locations:qr.labels.regenerate')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {isAdmin && list.length > 0 ? createPortal(<QrSheet labels={list} layout={layout} />, printRoot) : null}
    </div>
  )
}

export default QrLabels
