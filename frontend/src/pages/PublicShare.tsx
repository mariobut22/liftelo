import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { LogoMarkDark } from '../components/Logo'
import { getLocale, normalizeLanguage, type AppLanguage } from '../i18n'
import { applyLanguage } from '../lib/language'
import { ApiError, getPublicShare, type PublicShareStatusCode } from '../services/api'

const dateOf = (value?: string | null) => {
  if (!value) return ''
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(getLocale())
}
const monthOf = (value?: string | null) => {
  if (!value) return ''
  const [y, m] = value.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })
}

const OUTCOME_STYLE: Record<PublicShareStatusCode, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  repair_in_service: 'bg-amber-100 text-amber-700',
  repair_out_of_service: 'bg-red-100 text-red-700',
  other: 'bg-zinc-100 text-zinc-700',
}
const OUTCOME_KEY: Record<PublicShareStatusCode, string> = {
  ok: 'common:rmsStatus.ok',
  repair_in_service: 'common:rmsStatus.repairInService',
  repair_out_of_service: 'common:rmsStatus.repairOutOfService',
  other: 'share:outcome.other',
}
const SEVERITY_STYLE: Record<string, string> = {
  out_of_service: 'bg-red-100 text-red-700',
  in_service: 'bg-amber-100 text-amber-700',
  recommendation: 'bg-sky-100 text-sky-700',
}

/** Language switch for the public page: changes the UI only (no account, no cookie). */
function PublicLanguageSwitch() {
  const { t, i18n } = useTranslation()
  const active = normalizeLanguage(i18n.language)
  const options: Array<{ code: AppLanguage; short: string }> = [
    { code: 'en', short: 'EN' },
    { code: 'hr', short: 'HR' },
  ]
  return (
    <div role="group" aria-label={t('share:page.language')} className="inline-flex rounded-full border border-zinc-200 bg-white p-0.5 text-xs font-semibold shadow-sm">
      {options.map((option) => (
        <button
          key={option.code}
          type="button"
          lang={option.code}
          aria-pressed={active === option.code}
          onClick={() => applyLanguage(option.code)}
          className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3 ${active === option.code ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}
        >
          {option.short}
        </button>
      ))}
    </div>
  )
}

function Outcome({ code }: { code: PublicShareStatusCode | null }) {
  const { t } = useTranslation()
  if (!code) return null
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLE[code]}`}>{t(OUTCOME_KEY[code])}</span>
}

/**
 * PUBLIC read-only page of one location (/s/:token). No login, own minimal layout, not indexed.
 * Shows only what GET /api/public/share/:token returns (see docs/infrastructure.md "Share links").
 */
function PublicShare() {
  const { t } = useTranslation()
  const { token = '' } = useParams()

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow, noarchive'
    document.head.appendChild(meta)
    const ref = document.createElement('meta')
    ref.name = 'referrer'
    ref.content = 'no-referrer'
    document.head.appendChild(ref)
    return () => {
      meta.remove()
      ref.remove()
    }
  }, [])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['public-share', token],
    queryFn: () => getPublicShare(token),
    retry: false,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (data?.location.name) document.title = `${data.location.name} - Liftelo`
  }, [data?.location.name])

  const notFound = error instanceof ApiError && error.status === 404

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <LogoMarkDark className="h-7 w-7" />
          <span>{t('share:page.title')}</span>
        </div>
        <PublicLanguageSwitch />
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4">
        {isLoading ? <p className="text-sm text-zinc-500">{t('share:page.loading')}</p> : null}

        {error ? (
          <Card className="space-y-3 rounded-xl border border-zinc-200 p-6 text-center shadow-sm" data-testid="share-error">
            <h1 className="text-lg font-semibold">{notFound ? t('share:page.notFoundTitle') : t('common:apiErrors.generic')}</h1>
            <p className="text-sm text-zinc-600">{(error as Error).message}</p>
            {!notFound ? (
              <Button variant="outline" className="h-11" onClick={() => void refetch()}>
                {t('share:page.retry')}
              </Button>
            ) : null}
          </Card>
        ) : null}

        {data ? (
          <>
            <Card className="rounded-xl border border-zinc-200 p-5 shadow-sm">
              <h1 className="text-xl font-semibold" data-testid="share-location">{data.location.name}</h1>
              {data.location.address ? <p className="mt-1 text-sm text-zinc-600">{data.location.address}</p> : null}
              {data.company.name ? <p className="mt-2 text-xs text-zinc-500">{t('share:page.preparedBy', { company: data.company.name })}</p> : null}
              <p className="text-xs text-zinc-500">{t('share:page.updated', { date: new Date(data.generated_at).toLocaleDateString(getLocale()) })}</p>
            </Card>

            <section className="space-y-2" aria-labelledby="share-elevators">
              <h2 id="share-elevators" className="text-sm font-semibold text-zinc-800">{t('share:page.elevators')}</h2>
              {data.elevators.length === 0 ? <p className="text-sm text-zinc-500">{t('share:page.noElevators')}</p> : null}
              {data.elevators.map((el) => (
                <Card key={el.label} className="rounded-xl border border-zinc-200 p-4 shadow-sm" data-testid="share-elevator">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{el.label}</p>
                    {el.open_faults > 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{t('share:page.openFaultsCount', { count: el.open_faults })}</span>
                    ) : (
                      <span className="text-xs text-zinc-500">{t('share:page.noFaultsForElevator')}</span>
                    )}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-zinc-500">{t('share:page.lastRms')}</dt>
                      <dd>{el.last_rms_date ? dateOf(el.last_rms_date) : t('share:page.never')}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">{t('share:page.nextRms')}</dt>
                      <dd>{el.next_rms_month ? monthOf(el.next_rms_month) : '—'}</dd>
                    </div>
                  </dl>
                </Card>
              ))}
            </section>

            <section className="space-y-2" aria-labelledby="share-faults">
              <h2 id="share-faults" className="text-sm font-semibold text-zinc-800">{t('share:page.openFaults')}</h2>
              {data.open_faults.length === 0 ? <p className="text-sm text-zinc-500">{t('share:page.noOpenFaults')}</p> : null}
              {data.open_faults.map((fault, index) => (
                <Card key={`${fault.elevator}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 p-4 shadow-sm" data-testid="share-fault">
                  <div>
                    <p className="font-semibold">{fault.elevator}</p>
                    <p className="text-xs text-zinc-500">{t('share:page.reportedOn', { date: dateOf(fault.date) })}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[fault.severity] ?? 'bg-zinc-100 text-zinc-700'}`}>{t(`findings:severity.${fault.severity}`)}</span>
                </Card>
              ))}
            </section>

            <section className="space-y-2" aria-labelledby="share-rms">
              <h2 id="share-rms" className="text-sm font-semibold text-zinc-800">{t('share:page.rmsVisits')}</h2>
              {data.rms_visits.length === 0 ? <p className="text-sm text-zinc-500">{t('share:page.noRms')}</p> : null}
              {data.rms_visits.map((visit, index) => (
                <Card key={`${visit.date}-${index}`} className="rounded-xl border border-zinc-200 p-4 shadow-sm" data-testid="share-rms-visit">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{dateOf(visit.date)}</p>
                    <Outcome code={visit.outcome} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {visit.technician ? `${t('share:page.technician')}: ${visit.technician} · ` : ''}
                    {t('share:page.elevatorsChecked', { count: visit.elevator_count })}
                  </p>
                </Card>
              ))}
            </section>

            <section className="space-y-2" aria-labelledby="share-interventions">
              <h2 id="share-interventions" className="text-sm font-semibold text-zinc-800">{t('share:page.interventions')}</h2>
              {data.interventions.length === 0 ? <p className="text-sm text-zinc-500">{t('share:page.noInterventions')}</p> : null}
              {data.interventions.map((item, index) => (
                <Card key={`${item.date}-${index}`} className="rounded-xl border border-zinc-200 p-4 shadow-sm" data-testid="share-intervention">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{dateOf(item.date)}</p>
                    <Outcome code={item.outcome} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.technician ? `${t('share:page.technician')}: ${item.technician}` : ''}
                    {item.elevators.length > 0 ? ` · ${item.elevators.join(', ')}` : ''}
                  </p>
                </Card>
              ))}
            </section>

            <p className="text-xs text-zinc-500" data-testid="share-pdf-note">{t('share:page.pdfNote')}</p>
          </>
        ) : null}
      </main>

      <footer className="mx-auto w-full max-w-3xl space-y-1 px-4 pb-8 pt-2 text-center text-xs text-zinc-400">
        <p>{t('share:page.privacyNote')}</p>
        <p>{t('share:page.poweredBy')}</p>
      </footer>
    </div>
  )
}

export default PublicShare
