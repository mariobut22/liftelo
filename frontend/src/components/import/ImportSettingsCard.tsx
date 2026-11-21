import { FileSpreadsheet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '../ui/button'
import { Card } from '../ui/card'

/** Settings card (admin only: Settings is an admin page): entry to the Excel/CSV import of buildings and elevators. */
function ImportSettingsCard() {
  const { t } = useTranslation('import')
  const navigate = useNavigate()

  return (
    <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm" id="data-import" data-testid="import-settings-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-zinc-900">{t('entry.settingsTitle')}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t('entry.settingsDescription')}</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/dashboard/import')} className="w-full shrink-0 sm:w-auto">
          <FileSpreadsheet className="h-4 w-4" />
          {t('entry.settingsAction')}
        </Button>
      </div>
    </Card>
  )
}

export default ImportSettingsCard
