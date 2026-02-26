import { Calendar, ClipboardList, Download, MapPin } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import useRmsVisit from '../hooks/queries/useRmsVisit'

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('hr-HR') : '—'

function RmsDetailPage() {
  const { id } = useParams()
  const { data, isLoading: loading, error } = useRmsVisit(id)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-64 animate-pulse rounded-md bg-zinc-200/70" />
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={`rms-detail-skeleton-${index}`} className="p-6 shadow-sm">
              <div className="h-4 w-32 animate-pulse rounded-md bg-zinc-200/70" />
              <div className="mt-4 h-4 w-40 animate-pulse rounded-md bg-zinc-200/70" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <ClipboardList className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900">Greška</h2>
        <p className="mt-2 text-sm text-zinc-500">
          {error instanceof Error ? error.message : 'Ne možemo učitati RMS zapis trenutno.'}
        </p>
      </Card>
    )
  }

  if (!data) {
    return <div className="p-6 text-sm text-zinc-500">Nema podataka.</div>
  }

  const pdfUrl = `http://localhost:3000/api/rms/${data.id}/pdf`

  return (
    <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-zinc-900">RMS zapis</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500">
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4 text-zinc-400" />
              <span>Lokacija ID: {data.location_id}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <span>Posjet: {formatDate(data.visit_date)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <span>Kreirano: {formatDate(data.created_at)}</span>
            </div>
            {data.rms_month ? <Badge variant="secondary">RMS mjesec: {data.rms_month}</Badge> : null}
            {data.signature_status === 'signed' ? (
              <Badge className="bg-emerald-100 text-emerald-700">✓ Potpisano</Badge>
            ) : null}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
        >
          <Download className="h-4 w-4" />
          Preuzmi PDF
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-900">Stavke po dizalu</h2>
          <div className="mt-4 divide-y divide-zinc-100">
            {data.items?.length ? (
              data.items.map((item) => (
                <div key={item.id} className="flex flex-col gap-1 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900">{item.elevator_label}</span>
                    <Badge variant="secondary">{item.status}</Badge>
                  </div>
                  {item.comment ? <p className="text-zinc-500">{item.comment}</p> : null}
                </div>
              ))
            ) : (
              <div className="py-3 text-sm text-zinc-500">Nema stavki za ovaj RMS zapis.</div>
            )}
          </div>
        </Card>
        <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Opći komentar</h2>
          <p className="mt-4 text-sm text-zinc-500">{data.notes_general || '—'}</p>
        </Card>
        <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Potpisi</h2>
          <div className="mt-4 space-y-4 text-sm text-zinc-600">
            <div>
              <div className="text-xs font-semibold text-zinc-500">Potpis tehničara</div>
              {data.technician_signature_path ? (
                <img
                  src={`http://localhost:3000${data.technician_signature_path}`}
                  alt="Potpis tehničara"
                  className="mt-2 h-20 w-auto rounded border border-zinc-200 bg-white"
                />
              ) : (
                <div className="mt-2 text-zinc-400">—</div>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-500">Potpis klijenta</div>
              {data.client_signature_path ? (
                <img
                  src={`http://localhost:3000${data.client_signature_path}`}
                  alt="Potpis klijenta"
                  className="mt-2 h-20 w-auto rounded border border-zinc-200 bg-white"
                />
              ) : (
                <div className="mt-2 text-zinc-400">—</div>
              )}
            </div>
            <div className="text-xs text-zinc-500">Datum potpisa: {formatDate(data.signed_at)}</div>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default RmsDetailPage
