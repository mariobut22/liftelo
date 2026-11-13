import { useTranslation } from 'react-i18next'

import { Input } from '../ui/input'
import { cn } from '../../lib/utils'
import { FINDING_CATEGORIES, type FindingDraft } from '../../lib/findings'
import { RMS_STATUS } from '../../lib/rmsStatus'
import type { Finding } from '../../services/api'

interface FindingFieldsProps {
  /** Unique per elevator row (used for ids and test hooks) */
  idPrefix: string
  elevatorLabel: string
  status: string
  values: FindingDraft
  onChange: (patch: Partial<FindingDraft>) => void
  /** Shown under the description when the user tried to submit without one */
  showError: boolean
  /** Faults already open on this elevator (the new one must not silently duplicate them) */
  openFaults?: Finding[]
}

/** Inline "What is wrong?" mini-form for ONE elevator whose item has a repair status. */
function FindingFields({ idPrefix, elevatorLabel, status, values, onChange, showError, openFaults = [] }: FindingFieldsProps) {
  const { t } = useTranslation('findings')
  const urgent = status === RMS_STATUS.repairOutOfService
  const missing = showError && !values.finding_skip && !values.finding_description.trim()
  const sameCategory = openFaults.find((fault) => fault.category === values.finding_category)

  return (
    <div
      data-testid="finding-fields"
      className={cn(
        'w-full basis-full space-y-3 rounded-lg border p-3',
        urgent ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'
      )}
    >
      <div>
        <p className="text-sm font-semibold text-zinc-900">{t('form.title')}</p>
        <p className="text-xs text-zinc-500">{t('form.hint', { elevator: elevatorLabel })}</p>
      </div>
      {openFaults.length > 0 ? (
        <div className="space-y-2">
          {sameCategory && !values.finding_skip ? (
            <p
              role="alert"
              data-testid="finding-duplicate-warning"
              className="rounded-md border border-amber-300 bg-amber-100/70 px-2 py-1.5 text-xs font-medium text-amber-800"
            >
              {t('form.duplicateWarning', {
                elevator: elevatorLabel,
                category: t(`category.${sameCategory.category}`),
                description: sameCategory.description,
              })}
            </p>
          ) : null}
          <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              data-testid="finding-skip-new"
              checked={values.finding_skip}
              onChange={(event) => onChange({ finding_skip: event.target.checked })}
              className="h-5 w-5 rounded border-zinc-300"
            />
            {t('form.skipNew')}
          </label>
        </div>
      ) : null}
      {values.finding_skip ? null : (
      <>
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-desc`} className="text-xs font-semibold text-zinc-600">
          {t('form.description')} *
        </label>
        <textarea
          id={`${idPrefix}-desc`}
          rows={2}
          value={values.finding_description}
          onChange={(event) => onChange({ finding_description: event.target.value })}
          placeholder={t('form.descriptionPlaceholder')}
          aria-invalid={missing}
          className={cn(
            'w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-700',
            missing ? 'border-rose-400' : 'border-zinc-200'
          )}
        />
        {missing ? (
          <p role="alert" className="text-xs font-medium text-rose-600">
            {t('form.descriptionRequired', { elevator: elevatorLabel })}
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-cat`} className="text-xs font-semibold text-zinc-600">
            {t('form.category')}
          </label>
          <select
            id={`${idPrefix}-cat`}
            value={values.finding_category}
            onChange={(event) => onChange({ finding_category: event.target.value })}
            className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
          >
            {FINDING_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`category.${category}`)}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={values.finding_needs_part}
            onChange={(event) => onChange({ finding_needs_part: event.target.checked })}
            className="h-5 w-5 rounded border-zinc-300"
          />
          {t('form.needsPart')}
        </label>
      </div>
      {values.finding_needs_part ? (
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-part`} className="text-xs font-semibold text-zinc-600">
            {t('form.partNote')}
          </label>
          <Input
            id={`${idPrefix}-part`}
            value={values.finding_part_note}
            maxLength={255}
            onChange={(event) => onChange({ finding_part_note: event.target.value })}
            placeholder={t('form.partNotePlaceholder')}
          />
        </div>
      ) : null}
      </>
      )}
    </div>
  )
}

export default FindingFields
