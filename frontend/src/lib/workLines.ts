/*
 * "Work / material" table rows (name, quantity, unit, hours) shared by interventions and work orders.
 * ONE validation + serialisation helper: the backend (utils/workLines.js) enforces the same rules.
 * The unit is a stable short code (WORK_UNIT_CODES, translated in workLines:units.*) or free text.
 */
import type { TFunction } from 'i18next'

export const WORK_LINE_MAX_ROWS = 30
export const WORK_LINE_NAME_MAX = 200
export const WORK_LINE_UNIT_MAX = 20
export const WORK_LINE_QTY_MAX = 1_000_000
export const WORK_LINE_HOURS_MAX = 10_000
export const WORK_UNIT_CODES = ['pcs', 'm', 'h', 'l', 'kg', 'set', 'lump'] as const

/** What the user is typing (all strings, comma or dot accepted) */
export interface WorkLineDraft {
  key: string
  name: string
  quantity: string
  unit: string
  hours: string
}

/** What the API takes and returns */
export interface WorkLinePayload {
  name: string
  quantity: number | null
  unit: string | null
  hours: number | null
}

export interface WorkLine extends WorkLinePayload {
  id?: number
  position?: number
}

export type WorkLineProblemKind = 'nameRequired' | 'invalidNumber' | 'nameTooLong' | 'unitTooLong' | 'tooMany'
export interface WorkLineProblem {
  /** index of the row in the drafts (-1 = the whole list) */
  row: number
  kind: WorkLineProblemKind
  field?: 'name' | 'quantity' | 'unit' | 'hours'
}

let counter = 0
const nextKey = () => {
  counter += 1
  return `wl-${Date.now().toString(36)}-${counter}`
}

export const emptyWorkLine = (): WorkLineDraft => ({ key: nextKey(), name: '', quantity: '', unit: '', hours: '' })

/** "1,5" / "1.5" -> 1.5 (2 decimals); '' -> null; anything else (letters, negative, too large) -> undefined */
export function parseDecimalInput(text: string, max: number): number | null | undefined {
  const value = String(text ?? '').trim().replace(/\s/g, '')
  if (value === '') return null
  if (!/^\d+([.,]\d+)?$|^[.,]\d+$/.test(value)) return undefined
  const number = Number(value.replace(',', '.'))
  if (!Number.isFinite(number) || number < 0 || number > max) return undefined
  return Math.round(number * 100) / 100
}

export const isEmptyDraft = (row: WorkLineDraft) =>
  !row.name.trim() && !row.quantity.trim() && !row.unit.trim() && !row.hours.trim()

/** First problem of the list, or null. Completely empty rows are ignored (like on the server). */
export function validateWorkLines(rows: WorkLineDraft[]): WorkLineProblem | null {
  const used = rows.map((row, index) => ({ row, index })).filter(({ row }) => !isEmptyDraft(row))
  if (used.length > WORK_LINE_MAX_ROWS) return { row: -1, kind: 'tooMany' }
  for (const { row, index } of used) {
    if (!row.name.trim()) return { row: index, kind: 'nameRequired', field: 'name' }
    if (row.name.trim().length > WORK_LINE_NAME_MAX) return { row: index, kind: 'nameTooLong', field: 'name' }
    if (row.unit.trim().length > WORK_LINE_UNIT_MAX) return { row: index, kind: 'unitTooLong', field: 'unit' }
    if (parseDecimalInput(row.quantity, WORK_LINE_QTY_MAX) === undefined) return { row: index, kind: 'invalidNumber', field: 'quantity' }
    if (parseDecimalInput(row.hours, WORK_LINE_HOURS_MAX) === undefined) return { row: index, kind: 'invalidNumber', field: 'hours' }
  }
  return null
}

/** Rows for the request (empty rows dropped). Call only after validateWorkLines returned null. */
export function toWorkLinePayload(rows: WorkLineDraft[]): WorkLinePayload[] {
  return rows
    .filter((row) => !isEmptyDraft(row))
    .map((row) => ({
      name: row.name.trim(),
      quantity: parseDecimalInput(row.quantity, WORK_LINE_QTY_MAX) ?? null,
      unit: row.unit.trim() || null,
      hours: parseDecimalInput(row.hours, WORK_LINE_HOURS_MAX) ?? null,
    }))
}

const numberText = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value).replace('.', ','))

export function draftsFromWorkLines(lines: WorkLine[] | undefined | null): WorkLineDraft[] {
  return (lines ?? []).map((line) => ({
    key: nextKey(),
    name: line.name,
    quantity: numberText(line.quantity),
    unit: line.unit ?? '',
    hours: numberText(line.hours),
  }))
}

export const draftsFromPayload = draftsFromWorkLines

export function totalWorkHours(rows: Array<{ hours: string } | { hours: number | null }>): number {
  const sum = rows.reduce((acc, row) => {
    const value = typeof row.hours === 'string' ? parseDecimalInput(row.hours, WORK_LINE_HOURS_MAX) : row.hours
    return acc + (typeof value === 'number' ? value : 0)
  }, 0)
  return Math.round(sum * 100) / 100
}

export const countFilledRows = (rows: WorkLineDraft[]) => rows.filter((row) => !isEmptyDraft(row)).length

export const isKnownUnit = (unit: string) => (WORK_UNIT_CODES as readonly string[]).includes(unit)

/** Translated label of a unit code, or the free text as typed */
export const workUnitLabel = (t: TFunction, unit: string | null | undefined) =>
  !unit ? '' : isKnownUnit(unit) ? t(`workLines:units.${unit}`) : unit

/** A work order that is closed or cancelled keeps its table read-only (the server answers 409 work_order_closed) */
export const isWorkOrderTableLocked = (status: string | undefined) => status === 'completed' || status === 'cancelled'
