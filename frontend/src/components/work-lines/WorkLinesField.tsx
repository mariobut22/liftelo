import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Wrench } from 'lucide-react'

import { Button } from '../ui/button'
import FormSection from '../form/FormSection'
import WorkLinesDialog from './WorkLinesDialog'
import { countFilledRows, totalWorkHours, type WorkLineDraft } from '../../lib/workLines'
import { getLocale } from '../../i18n'

interface WorkLinesFieldProps {
  rows: WorkLineDraft[]
  onChange: (rows: WorkLineDraft[]) => void
  disabled?: boolean
  idPrefix?: string
}

/** Form section with a button that opens the work / material popup + a one-line summary of what was entered. */
function WorkLinesField({ rows, onChange, disabled = false, idPrefix = 'wl' }: WorkLinesFieldProps) {
  const { t } = useTranslation('workLines')
  const [open, setOpen] = useState(false)
  const count = countFilledRows(rows)
  const hours = totalWorkHours(rows)

  return (
    <FormSection title={t('field.title')} description={t('field.description')}>
      <div className="flex flex-wrap items-center gap-3" data-testid="work-lines-field">
        <Button type="button" variant="outline" className="h-11" disabled={disabled} onClick={() => setOpen(true)} data-testid="work-lines-open">
          <Wrench className="h-4 w-4" />
          {count > 0 ? t('field.edit') : t('field.open')}
        </Button>
        {count === 0 ? (
          <span className="text-sm text-zinc-500" data-testid="work-lines-summary">{t('field.empty')}</span>
        ) : (
          <span className="text-sm font-semibold text-zinc-700" data-testid="work-lines-summary">
            {t('field.rows', { n: count })}
            {hours > 0 ? ` · ${t('field.hours', { n: hours.toLocaleString(getLocale(), { maximumFractionDigits: 2 }) })}` : ''}
          </span>
        )}
      </div>
      <WorkLinesDialog open={open} onOpenChange={setOpen} value={rows} onApply={onChange} idPrefix={idPrefix} />
    </FormSection>
  )
}

export default WorkLinesField
