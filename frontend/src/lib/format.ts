import { useTranslation } from 'react-i18next'
import { getLocale } from '../i18n'

type DateInput = string | number | Date | null | undefined

const toDate = (value: DateInput): Date | null => {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Date/number/currency formatters bound to a locale (hr -> hr-HR, en -> en-GB). Pure: pass `getLocale()` or use `useFormat()`. */
export const createFormatters = (locale: string) => ({
  locale,
  formatDate: (value: DateInput, fallback = '—', options?: Intl.DateTimeFormatOptions) => {
    const date = toDate(value)
    return date ? date.toLocaleDateString(locale, options) : fallback
  },
  formatDateTime: (value: DateInput, fallback = '—', options?: Intl.DateTimeFormatOptions) => {
    const date = toDate(value)
    return date ? date.toLocaleString(locale, options) : fallback
  },
  formatTime: (value: DateInput, fallback = '', options?: Intl.DateTimeFormatOptions) => {
    const date = toDate(value)
    return date ? date.toLocaleTimeString(locale, options) : fallback
  },
  formatNumber: (value: number | null | undefined, options?: Intl.NumberFormatOptions, fallback = '—') =>
    typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString(locale, options) : fallback,
  formatCurrency: (value: number | null | undefined, currency = 'EUR', fallback = '—') =>
    typeof value === 'number' && Number.isFinite(value)
      ? new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)
      : fallback,
  monthName: (monthIndex: number, style: 'long' | 'short' = 'long') =>
    new Date(2024, monthIndex, 1).toLocaleString(locale, { month: style }),
})

/** Hook: formatters for the active UI language; re-renders the component when the language changes. */
export const useFormat = () => {
  const { i18n } = useTranslation()
  return createFormatters(getLocale(i18n.language))
}
