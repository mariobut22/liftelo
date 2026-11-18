import { AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import FindingCard from './FindingCard'
import type { Finding } from '../../services/api'

const SHEET_LIMIT = 3

interface QrOpenFaultsProps {
  findings: Finding[]
  /** page = QR landing (all faults, with title); sheet = compact list in the scan result sheet */
  variant: 'page' | 'sheet'
  /** Called before navigating (e.g. to close the scan sheet) */
  onNavigate?: () => void
  /** Sheet: where "+N more" goes (the QR landing of this elevator) */
  moreTo?: string
}

/**
 * Open faults of ONE scanned elevator. The data comes from GET /api/elevators/by-qr (login + company membership
 * required), so nothing here is ever rendered for a visitor who is not signed in.
 */
function QrOpenFaults({ findings, variant, onNavigate, moreTo }: QrOpenFaultsProps) {
  const { t } = useTranslation('findings')
  const navigate = useNavigate()
  const hasOutOfService = findings.some((finding) => finding.severity === 'out_of_service')
  const open = (id: number) => {
    onNavigate?.()
    navigate(`/dashboard/findings?id=${id}`)
  }

  if (findings.length === 0) {
    return variant === 'page' ? (
      <p data-testid="qr-open-faults-none" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {t('qr.none')}
      </p>
    ) : null
  }

  const shown = variant === 'sheet' ? findings.slice(0, SHEET_LIMIT) : findings
  return (
    <section
      data-testid="qr-open-faults"
      data-count={findings.length}
      className={
        variant === 'page'
          ? `space-y-3 rounded-xl border p-4 shadow-sm sm:p-6 ${hasOutOfService ? 'border-rose-300 bg-rose-50/40' : 'border-amber-300 bg-amber-50/40'}`
          : 'space-y-2'
      }
    >
      <h2 className={`flex items-center gap-2 font-semibold ${hasOutOfService ? 'text-rose-700' : 'text-amber-700'} ${variant === 'page' ? 'text-sm' : 'text-xs'}`}>
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {variant === 'page' ? t('qr.title') : t('qr.sheetTitle', { count: findings.length })}
      </h2>
      <div className="space-y-2">
        {shown.map((finding) => (
          <FindingCard key={finding.id} finding={finding} onOpen={open} compact={variant === 'sheet'} />
        ))}
      </div>
      {variant === 'sheet' && findings.length > SHEET_LIMIT && moreTo ? (
        <button
          type="button"
          className="text-xs font-semibold text-zinc-700 underline"
          onClick={() => {
            onNavigate?.()
            navigate(moreTo)
          }}
        >
          {t('qr.sheetMore', { count: findings.length - SHEET_LIMIT })}
        </button>
      ) : null}
    </section>
  )
}

export default QrOpenFaults
