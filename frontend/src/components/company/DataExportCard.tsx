import { useState } from 'react'
import { Download } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { companyExportUrl, getCompanyExportCheck } from '../../services/api'
import { getLocale } from '../../i18n'

const formatMegabytes = (bytes: number) =>
  new Intl.NumberFormat(getLocale(), { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))

/** Settings card (admin only): downloads all company data as a ZIP (JSON + CSV + uploaded files). Also works when the workspace is locked. */
function DataExportCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)

  const checkQuery = useQuery({
    queryKey: ['company-export-check'],
    queryFn: getCompanyExportCheck,
    staleTime: 15 * 1000,
    retry: false,
  })
  const check = checkQuery.data

  const startDownload = () => {
    setStarting(true)
    // a plain browser download (streams straight to disk, no memory blow-up); the session cookie goes along
    const link = document.createElement('a')
    link.href = companyExportUrl()
    link.download = ''
    document.body.appendChild(link)
    link.click()
    link.remove()
    toast.success(t('settings:dataExport.started'))
    window.setTimeout(() => {
      setStarting(false)
      void queryClient.invalidateQueries({ queryKey: ['company-export-check'] })
    }, 4000)
  }

  const retryMinutes = check ? Math.max(1, Math.ceil(check.retry_after_seconds / 60)) : 0

  return (
    <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm" id="data-export">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{t('settings:dataExport.title')}</h2>
        <p className="mt-1 text-sm text-zinc-500">{t('settings:dataExport.description')}</p>
      </div>

      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-zinc-600">
        <li>{t('settings:dataExport.includesTables')}</li>
        <li>{t('settings:dataExport.excludesSecrets')}</li>
        <li>{t('settings:dataExport.worksWhenLocked')}</li>
        <li>{t('settings:dataExport.limit')}</li>
      </ul>

      {check ? (
        <p className="mt-4 text-sm text-zinc-700" data-testid="export-files-info">
          {check.files.included
            ? t('settings:dataExport.filesIncluded', { count: check.files.count, size: formatMegabytes(check.files.bytes) })
            : t('settings:dataExport.filesListedOnly', { count: check.files.count, size: formatMegabytes(check.files.bytes) })}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button onClick={startDownload} disabled={checkQuery.isLoading || starting || (check ? !check.allowed : false)} className="w-full sm:w-auto">
          <Download className="mr-2 h-4 w-4" />
          {t('settings:dataExport.download')}
        </Button>
        {check && !check.allowed ? (
          <span className="text-sm text-zinc-500" data-testid="export-cooldown">
            {check.in_progress
              ? t('settings:dataExport.inProgress')
              : t('settings:dataExport.availableAgain', { count: retryMinutes })}
          </span>
        ) : null}
        {checkQuery.isError ? <span className="text-sm text-rose-600">{t('settings:dataExport.checkFailed')}</span> : null}
      </div>
    </Card>
  )
}

export default DataExportCard
