import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CheckCircle2, Clock, FileText, ShieldCheck, XCircle } from 'lucide-react'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import ClientSignatureBlock, { type ClientSignatureBlockHandle } from './ClientSignatureBlock'
import SignatureStateBadge from './SignatureStateBadge'
import useAuthStore from '../../store/authStore'
import { API_BASE_URL } from '../../services/api'
import { getLocale } from '../../i18n'
import { pdfUrl } from '../../lib/pdf'
import {
  attachClientScan,
  collectClientSignature,
  daysSince,
  declineClient,
  getReportSignature,
  reportSignatureKey,
  userCanWrite,
  verifyReport,
  type ReportType,
  type TimelineEvent,
  type VerifyResult,
} from '../../lib/reportSignatures'

type Props = { type: ReportType; id: number | string }
type Mode = null | 'collect' | 'attach' | 'decline'

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '—'

/**
 * Signature state, timeline and actions of ONE report (RMS visit or intervention): collect the client's signature now,
 * attach a scan of the signed paper copy, mark as closed without client signature, verify the document (admin). Viewer = read-only.
 */
function ReportSignaturePanel({ type, id }: Props) {
  const { t, i18n } = useTranslation('signature')
  const { t: tCommon } = useTranslation('common')
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const canWrite = useAuthStore(() => userCanWrite())
  const [mode, setMode] = useState<Mode>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [scanNote, setScanNote] = useState('')
  const [reason, setReason] = useState('')
  const [scanFile, setScanFile] = useState<File | null>(null)
  const blockRef = useRef<ClientSignatureBlockHandle | null>(null)

  const query = useQuery({ queryKey: reportSignatureKey(type, id), queryFn: () => getReportSignature(type, id) })
  const info = query.data

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: reportSignatureKey(type, id) })
    await queryClient.invalidateQueries({ queryKey: ['awaiting-client'] })
    setMode(null)
    setVerifyResult(null)
  }
  const onError = (error: unknown) => toast.error(error instanceof Error ? error.message : tCommon('states.error'))

  const collect = useMutation({
    mutationFn: () => {
      const value = blockRef.current?.read()
      if (!value?.signature) throw new Error(t('errors.clientSignatureRequired'))
      if (!value.name || !value.role) throw new Error(t('errors.signerRequired'))
      return collectClientSignature({ type, id: Number(id), signature: value.signature, name: value.name, role: value.role, language: i18n.language })
    },
    onSuccess: async () => { toast.success(t('panel.collect.saved')); await refresh() },
    onError,
  })
  const attach = useMutation({
    mutationFn: () => {
      if (!scanFile) throw new Error(t('panel.attach.fileRequired'))
      return attachClientScan({ type, id: Number(id), file: scanFile, note: scanNote.trim() || undefined })
    },
    onSuccess: async () => { toast.success(t('panel.attach.saved')); setScanFile(null); setScanNote(''); await refresh() },
    onError,
  })
  const decline = useMutation({
    mutationFn: () => {
      if (reason.trim().length < 5) throw new Error(t('panel.decline.reasonRequired'))
      return declineClient({ type, id: Number(id), reason: reason.trim() })
    },
    onSuccess: async () => { toast.success(t('panel.decline.saved')); setReason(''); await refresh() },
    onError,
  })
  const verify = useMutation({
    mutationFn: () => verifyReport(type, id),
    onSuccess: (result) => setVerifyResult(result),
    onError: () => toast.error(t('panel.verify.failed')),
  })

  if (query.isLoading) return <div className="text-sm text-zinc-500">{t('panel.loading')}</div>
  if (query.error || !info || !Array.isArray(info.timeline)) return <div className="text-sm text-rose-600">{t('panel.loadFailed')}</div>

  const pdfHref = pdfUrl(type === 'rms' ? `/api/rms/${id}/pdf` : `/api/interventions/${id}/pdf`, i18n.language)
  const canComplete = canWrite && (info.state === 'awaiting_client' || info.state === 'closed_without_client')
  const canDecline = canWrite && info.state === 'awaiting_client'

  const eventLabel = (event: TimelineEvent) => {
    if (event.type === 'client_signed') return t(event.method === 'scan' ? 'panel.timeline.client_signed_scan' : 'panel.timeline.client_signed_drawn')
    return t(`panel.timeline.${event.type}`)
  }
  const eventDetail = (event: TimelineEvent) => {
    const parts: string[] = []
    if (event.name) parts.push(event.role ? t('panel.signer', { name: event.name, role: event.role }) : event.name)
    if (event.type === 'technician_signed' && event.name) return event.name
    if (event.type === 'client_declined' && event.note) parts.push(t('panel.reason', { reason: event.note }))
    else if (event.note) parts.push(event.note)
    return parts.join(' · ')
  }

  return (
    <div className="space-y-4" data-testid="signature-panel">
      <div className="flex flex-wrap items-center gap-2">
        <SignatureStateBadge state={info.state} />
        {info.state === 'awaiting_client' && info.awaiting_since ? (
          <span className="text-xs text-amber-800" data-testid="awaiting-since">
            {t('panel.awaitingSince', { date: formatDateTime(info.awaiting_since), count: daysSince(info.awaiting_since) })}
          </span>
        ) : null}
      </div>
      {info.state === 'closed_without_client' ? <p className="text-sm text-rose-700">{t('panel.closedNote')}</p> : null}
      {info.state === 'unsigned' ? <p className="text-sm text-zinc-500">{t('panel.unsignedNote')}</p> : null}

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-zinc-500">{t('panel.documentNumber')}</dt>
          <dd className="font-medium text-zinc-900" data-testid="document-number">{info.document_number}</dd>
        </div>
        {info.short_hash ? (
          <div className="flex gap-2">
            <dt className="text-zinc-500">{t('panel.hash')}</dt>
            <dd className="font-mono text-zinc-900" data-testid="document-hash">{info.short_hash}</dd>
          </div>
        ) : null}
      </dl>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t('panel.timelineTitle')}</div>
        <ol className="mt-2 space-y-2" data-testid="signature-timeline">
          {info.timeline.map((event, index) => (
            <li key={`${event.type}-${event.completion_id ?? index}`} className="flex gap-3 text-sm">
              <span className="mt-0.5 shrink-0">
                {event.type === 'client_declined' ? (
                  <XCircle className="h-4 w-4 text-rose-500" />
                ) : event.type === 'created' ? (
                  <Clock className="h-4 w-4 text-zinc-400" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-zinc-900">{eventLabel(event)}</span>
                <span className="block text-xs text-zinc-500">
                  {formatDateTime(event.at)}
                  {eventDetail(event) ? ` · ${eventDetail(event)}` : ''}
                  {event.by_name && event.type !== 'technician_signed' ? ` · ${t('panel.by', { name: event.by_name })}` : ''}
                </span>
                {event.scan_path ? (
                  <a className="text-xs font-semibold text-blue-600 hover:text-blue-700" href={`${API_BASE_URL}${event.scan_path}`} target="_blank" rel="noreferrer">
                    {t('panel.scanLink')}
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        {info.locked ? (
          <a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-blue-600 hover:bg-zinc-50" href={pdfHref} target="_blank" rel="noreferrer">
            <FileText className="h-4 w-4" />
            {t('panel.issuedPdf')}
          </a>
        ) : null}
        {canComplete ? (
          <>
            <Button type="button" className="min-h-11" onClick={() => setMode(mode === 'collect' ? null : 'collect')} data-testid="action-collect">
              {t('panel.actions.collect')}
            </Button>
            <Button type="button" variant="secondary" className="min-h-11" onClick={() => setMode(mode === 'attach' ? null : 'attach')} data-testid="action-attach">
              {t('panel.actions.attach')}
            </Button>
          </>
        ) : null}
        {canDecline ? (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setMode(mode === 'decline' ? null : 'decline')} data-testid="action-decline">
            {t('panel.actions.decline')}
          </Button>
        ) : null}
        {isAdmin && info.locked ? (
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => verify.mutate()} disabled={verify.isPending} data-testid="action-verify">
            <ShieldCheck className="h-4 w-4" />
            {t('panel.actions.verify')}
          </Button>
        ) : null}
      </div>

      {verify.isPending ? <p className="text-sm text-zinc-500">{t('panel.verify.running')}</p> : null}
      {verifyResult ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${verifyResult.status === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
          data-testid="verify-result"
        >
          {t(`panel.verify.${verifyResult.status}`)}
        </p>
      ) : null}

      {mode === 'collect' ? (
        <div className="space-y-3 rounded-xl border border-zinc-200 p-3" data-testid="collect-form">
          <div className="text-sm font-semibold text-zinc-900">{t('panel.collect.title')}</div>
          <ClientSignatureBlock ref={blockRef} hideAbsent idPrefix={`late-${type}-${id}`} />
          <div className="flex gap-2">
            <Button type="button" className="min-h-11" onClick={() => collect.mutate()} disabled={collect.isPending} data-testid="collect-submit">
              {t('panel.collect.submit')}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setMode(null)}>
              {t('panel.actions.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'attach' ? (
        <div className="space-y-3 rounded-xl border border-zinc-200 p-3" data-testid="attach-form">
          <div className="text-sm font-semibold text-zinc-900">{t('panel.attach.title')}</div>
          <div className="space-y-1">
            <label htmlFor={`scan-file-${type}-${id}`} className="text-sm font-medium text-zinc-700">{t('panel.attach.file')}</label>
            <input
              id={`scan-file-${type}-${id}`}
              type="file"
              accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
              className="block w-full text-sm"
              onChange={(event) => setScanFile(event.target.files?.[0] ?? null)}
              data-testid="scan-file"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`scan-note-${type}-${id}`} className="text-sm font-medium text-zinc-700">{t('panel.attach.note')}</label>
            <Input id={`scan-note-${type}-${id}`} value={scanNote} maxLength={500} onChange={(event) => setScanNote(event.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="button" className="min-h-11" onClick={() => attach.mutate()} disabled={attach.isPending} data-testid="attach-submit">
              {t('panel.attach.submit')}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setMode(null)}>
              {t('panel.actions.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'decline' ? (
        <div className="space-y-3 rounded-xl border border-zinc-200 p-3" data-testid="decline-form">
          <div className="text-sm font-semibold text-zinc-900">{t('panel.decline.title')}</div>
          <p className="text-xs text-zinc-500">{t('panel.decline.hint')}</p>
          <div className="space-y-1">
            <label htmlFor={`decline-reason-${type}-${id}`} className="text-sm font-medium text-zinc-700">{t('panel.decline.reason')}</label>
            <textarea
              id={`decline-reason-${type}-${id}`}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" className="min-h-11" onClick={() => decline.mutate()} disabled={decline.isPending} data-testid="decline-submit">
              {t('panel.decline.submit')}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setMode(null)}>
              {t('panel.actions.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ReportSignaturePanel
