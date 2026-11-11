import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import {
  WORK_LINE_MAX_ROWS,
  WORK_LINE_NAME_MAX,
  WORK_LINE_UNIT_MAX,
  WORK_UNIT_CODES,
  emptyWorkLine,
  isEmptyDraft,
  isKnownUnit,
  totalWorkHours,
  validateWorkLines,
  type WorkLineDraft,
  type WorkLineProblem,
} from '../../lib/workLines'

const OTHER = '__other'

interface WorkLinesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** current rows (copied into the dialog each time it opens) */
  value: WorkLineDraft[]
  /** called with the validated rows; may be async (the dialog shows `busy` until it settles and closes only on success) */
  onApply: (rows: WorkLineDraft[]) => void | Promise<void>
  /** button text: "Done" (rows stay in the parent form) or "Save" (saves straight away) */
  applyLabel?: 'apply' | 'save'
  busy?: boolean
  idPrefix?: string
}

/**
 * The popup where rows of work / material are entered: name, quantity, unit (select with common units or free text), hours.
 * Add / remove rows; completely empty rows are ignored. Shared by interventions and work orders.
 */
function WorkLinesDialog({ open, onOpenChange, value, onApply, applyLabel = 'apply', busy = false, idPrefix = 'wl' }: WorkLinesDialogProps) {
  const { t } = useTranslation('workLines')
  const [rows, setRows] = useState<WorkLineDraft[]>([])
  const [problem, setProblem] = useState<WorkLineProblem | null>(null)
  // rows whose unit select is on "Other..." (free text); derived from the value when the dialog opens
  const [otherUnit, setOtherUnit] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    const start = value.length > 0 ? value.map((row) => ({ ...row })) : [emptyWorkLine()]
    setRows(start)
    setProblem(null)
    setOtherUnit(new Set(start.filter((row) => row.unit && !isKnownUnit(row.unit)).map((row) => row.key)))
    // only when the dialog is (re)opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const patch = (key: string, change: Partial<WorkLineDraft>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)))
    setProblem(null)
  }

  const removeRow = (key: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.key !== key)
      return next.length > 0 ? next : [emptyWorkLine()]
    })
    setProblem(null)
  }

  const apply = async () => {
    const found = validateWorkLines(rows)
    if (found) {
      setProblem(found)
      return
    }
    try {
      await onApply(rows.filter((row) => !isEmptyDraft(row)))
      onOpenChange(false)
    } catch {
      // the caller shows its own error and the dialog stays open with the typed rows
    }
  }

  const problemText = (found: WorkLineProblem) =>
    t(`errors.${found.kind}`, { n: found.row + 1, max: found.kind === 'unitTooLong' ? WORK_LINE_UNIT_MAX : found.kind === 'tooMany' ? WORK_LINE_MAX_ROWS : WORK_LINE_NAME_MAX })

  const fieldClass = (index: number, field: 'name' | 'quantity' | 'unit' | 'hours') =>
    problem && problem.row === index && problem.field === field ? 'border-rose-400 ring-1 ring-rose-300' : ''

  const selectClass = 'h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-700'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0" data-testid="work-lines-dialog">
        <div className="flex max-h-[90vh] flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-5 py-4">
            <DialogTitle>{t('dialog.title')}</DialogTitle>
            <DialogDescription>{t('dialog.description')}</DialogDescription>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {rows.map((row, index) => {
              const selectValue = !row.unit && !otherUnit.has(row.key) ? '' : otherUnit.has(row.key) || !isKnownUnit(row.unit) ? OTHER : row.unit
              return (
                <div key={row.key} className="space-y-2 rounded-xl border border-zinc-200 p-3" data-testid="work-line-row">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-500">{t('dialog.rowTitle', { n: index + 1 })}</span>
                    <button
                      type="button"
                      aria-label={t('dialog.removeNamed', { n: index + 1 })}
                      title={t('dialog.remove')}
                      onClick={() => removeRow(row.key)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-rose-600"
                      data-testid="work-line-remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div>
                    <label htmlFor={`${idPrefix}-name-${index}`} className="text-xs font-semibold text-zinc-600">
                      {t('columns.name')}
                    </label>
                    <Input
                      id={`${idPrefix}-name-${index}`}
                      value={row.name}
                      maxLength={WORK_LINE_NAME_MAX + 50}
                      placeholder={t('placeholders.name')}
                      onChange={(event) => patch(row.key, { name: event.target.value })}
                      className={fieldClass(index, 'name')}
                      data-testid="work-line-name"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label htmlFor={`${idPrefix}-qty-${index}`} className="text-xs font-semibold text-zinc-600">
                        {t('columns.quantity')}
                      </label>
                      <Input
                        id={`${idPrefix}-qty-${index}`}
                        inputMode="decimal"
                        value={row.quantity}
                        placeholder={t('placeholders.quantity')}
                        onChange={(event) => patch(row.key, { quantity: event.target.value })}
                        className={fieldClass(index, 'quantity')}
                        data-testid="work-line-quantity"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${idPrefix}-unit-${index}`} className="text-xs font-semibold text-zinc-600">
                        {t('columns.unit')}
                      </label>
                      <select
                        id={`${idPrefix}-unit-${index}`}
                        value={selectValue}
                        onChange={(event) => {
                          const next = event.target.value
                          if (next === OTHER) {
                            setOtherUnit((current) => new Set(current).add(row.key))
                            patch(row.key, { unit: isKnownUnit(row.unit) ? '' : row.unit })
                          } else {
                            setOtherUnit((current) => {
                              const copy = new Set(current)
                              copy.delete(row.key)
                              return copy
                            })
                            patch(row.key, { unit: next })
                          }
                        }}
                        className={`${selectClass} ${fieldClass(index, 'unit')}`}
                        data-testid="work-line-unit"
                      >
                        <option value="">{t('units.none')}</option>
                        {WORK_UNIT_CODES.map((code) => (
                          <option key={code} value={code}>
                            {t(`units.${code}`)}
                          </option>
                        ))}
                        <option value={OTHER}>{t('units.other')}</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`${idPrefix}-hours-${index}`} className="text-xs font-semibold text-zinc-600">
                        {t('columns.hours')}
                      </label>
                      <Input
                        id={`${idPrefix}-hours-${index}`}
                        inputMode="decimal"
                        value={row.hours}
                        placeholder={t('placeholders.hours')}
                        onChange={(event) => patch(row.key, { hours: event.target.value })}
                        className={fieldClass(index, 'hours')}
                        data-testid="work-line-hours"
                      />
                    </div>
                  </div>
                  {selectValue === OTHER ? (
                    <Input
                      aria-label={t('columns.unit')}
                      value={row.unit}
                      maxLength={WORK_LINE_UNIT_MAX + 5}
                      placeholder={t('placeholders.unitOther')}
                      onChange={(event) => patch(row.key, { unit: event.target.value })}
                      className={fieldClass(index, 'unit')}
                      data-testid="work-line-unit-other"
                    />
                  ) : null}
                </div>
              )
            })}

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={rows.length >= WORK_LINE_MAX_ROWS}
              onClick={() => setRows((current) => [...current, emptyWorkLine()])}
              data-testid="work-line-add"
            >
              <Plus className="h-4 w-4" />
              {t('dialog.add')}
            </Button>
          </div>

          {problem ? (
            <p role="alert" className="mx-5 mb-3 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="work-lines-error">
              {problemText(problem)}
            </p>
          ) : null}

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-white px-5 py-3">
            <span className="text-sm font-semibold text-zinc-700" data-testid="work-lines-total">
              {t('dialog.total', { n: totalWorkHours(rows).toLocaleString(undefined, { maximumFractionDigits: 2 }) })}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                {t('dialog.cancel')}
              </Button>
              <Button type="button" onClick={apply} disabled={busy} data-testid="work-lines-apply">
                {busy ? t('dialog.saving') : applyLabel === 'save' ? t('dialog.save') : t('dialog.apply')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default WorkLinesDialog
