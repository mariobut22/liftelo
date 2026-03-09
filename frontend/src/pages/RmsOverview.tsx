import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import useAuthStore from '../store/authStore'
import { apiFetch, deleteRmsOverviewDate } from '../services/api'

const DialogHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="border-b border-zinc-200 px-6 py-4">{children}</div>
)

type InvoiceStatus = 'invoiced' | 'not_invoiced'

type RmsOverviewCell = {
  service_date?: string | null
  invoice_status?: InvoiceStatus | null
}

type RmsOverviewRow = {
  location_id: number
  location_name: string
  months?: Record<string, RmsOverviewCell>
}

type EditCellState = {
  location_id: number
  location_name: string
  month: number
  service_date?: string | null
  invoice_status?: InvoiceStatus | null
}

const formatDay = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return String(date.getDate()).padStart(2, '0')
}

function RmsOverview() {
  const { t } = useTranslation('rms')
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [editCell, setEditCell] = useState<EditCellState | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editInvoiceStatus, setEditInvoiceStatus] = useState<InvoiceStatus>('not_invoiced')

  const { data, isLoading, error } = useQuery({
    queryKey: ['rms-overview', year],
    queryFn: () => apiFetch<RmsOverviewRow[]>(`/api/rms-overview?year=${year}`),
  })

  const { data: kpiData } = useQuery({
    queryKey: ['rms-overview-kpi', year],
    queryFn: () => apiFetch<{ total_rms: number; invoiced: number; not_invoiced: number }>(`/api/rms-overview/kpi?year=${year}`),
    enabled: isAdmin,
  })

  const rows = data ?? []

  const filteredRows = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => row.location_name.toLowerCase().includes(term))
  }, [rows, debouncedSearch])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchTerm])

  const updateMutation = useMutation({
    mutationFn: (payload: { location_id: number; year: number; month: number; service_date: string | null }) =>
      apiFetch('/api/rms-overview', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rms-overview', year] })
      queryClient.invalidateQueries({ queryKey: ['rms-overview-kpi', year] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (payload: { location_id: number; year: number; month: number; invoice_status: InvoiceStatus }) =>
      apiFetch('/api/rms-overview/invoice', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rms-overview', year] })
      queryClient.invalidateQueries({ queryKey: ['rms-overview-kpi', year] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (payload: { location_id: number; year: number; month: number }) =>
      deleteRmsOverviewDate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rms-overview', year] })
      queryClient.invalidateQueries({ queryKey: ['rms-overview-kpi', year] })
    },
  })

  const years = useMemo(() => {
    const startYear = 2024
    const endYear = currentYear + 3
    return Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
  }, [currentYear])

  const monthLabels = useMemo(
    () => t('overview.table.monthLabels', { returnObjects: true }) as string[],
    [t]
  )
  const monthNames = useMemo(
    () => t('overview.table.monthNames', { returnObjects: true }) as string[],
    [t]
  )

  const formatTooltip = (value?: string | null, status?: InvoiceStatus | null) => {
    if (!value) return t('overview.tooltip.empty')
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return t('overview.tooltip.empty')
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const yearValue = date.getFullYear()
    const label =
      status === 'invoiced'
        ? t('overview.tooltip.invoiced')
        : t('overview.tooltip.notInvoiced')
    return `${day}.${month}.${yearValue} – ${label}`
  }

  const getCell = (row: RmsOverviewRow, month: number): RmsOverviewCell => {
    if (!row.months) return { service_date: null, invoice_status: 'not_invoiced' }
    return row.months[String(month)] ?? { service_date: null, invoice_status: 'not_invoiced' }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{t('overview.title')}</h1>
          <p className="text-sm text-zinc-500">{t('overview.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && kpiData ? (
            <Card className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-zinc-400">{t('overview.kpi.notInvoiced')}</div>
                <div className="text-lg font-semibold text-zinc-900">{kpiData.not_invoiced}</div>
              </div>
              <div className="min-w-[140px]">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>{kpiData.invoiced}/{kpiData.total_rms}</span>
                  <span>{kpiData.total_rms > 0 ? Math.round((kpiData.invoiced / kpiData.total_rms) * 100) : 0}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-green-100">
                  <div
                    className="h-full bg-green-500 transition-all duration-500"
                    style={{
                      width: `${kpiData.total_rms > 0 ? Math.round((kpiData.invoiced / kpiData.total_rms) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </Card>
          ) : null}
          {isAdmin ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = `http://localhost:3000/api/rms-overview/export?year=${year}`
              }}
            >
              {t('actions.exportExcel')}
            </Button>
          ) : null}
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-500">{t('overview.filters.year')}</label>
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder={t('overview.filters.searchPlaceholder')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full max-w-sm rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>

      {isLoading ? (
        <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">{t('overview.loading')}</Card>
      ) : error ? (
        <Card className="rounded-xl border border-zinc-200 p-6 text-sm text-red-600 shadow-sm">
          {t('overview.error')}
        </Card>
      ) : filteredRows.length === 0 ? (
        <Card className="rounded-xl border border-zinc-200 p-8 text-center shadow-sm">
          <div className="text-sm text-zinc-500">
            {rows.length === 0 ? t('overview.empty.noRecords') : t('overview.empty.noResults')}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="divide-x divide-zinc-200">
                  <th className="sticky left-0 z-20 border-b border-zinc-200 bg-white px-4 py-2 text-left text-xs font-semibold text-zinc-500" style={{ width: 220 }}>
                    {t('overview.table.location')}
                  </th>
                  {monthLabels.map((label) => (
                    <th
                      key={label}
                      className="border-b border-zinc-200 px-3 py-2 text-center text-xs font-semibold text-zinc-500"
                      style={{ width: 56 }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredRows.map((row) => (
                  <tr key={row.location_id} className={`divide-x divide-zinc-100 ${isAdmin ? 'hover:bg-zinc-50' : ''}`}>
                    <td
                      className="sticky left-0 z-10 bg-white px-4 py-1 font-medium text-zinc-900"
                      style={{ width: 220, height: 40 }}
                    >
                      {row.location_name}
                    </td>
                    {monthLabels.map((_, index) => {
                      const month = index + 1
                      const cell = getCell(row, month)
                      const isInvoiced = cell.invoice_status === 'invoiced'
                      const cellClasses = isInvoiced
                        ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                        : 'bg-white text-zinc-800'
                      const isEmpty = !cell.service_date
                      return (
                        <td
                          key={`${row.location_id}-${month}`}
                          className="px-3 py-1 text-center"
                          style={{ width: 56 }}
                        >
                          <div
                            title={formatTooltip(cell.service_date, cell.invoice_status)}
                            className={`group relative mx-auto flex h-10 w-10 items-center justify-center rounded-lg font-medium transition-all duration-200 ${cellClasses} ${isAdmin ? 'cursor-pointer hover:bg-zinc-50' : ''}`}
                            onClick={() => {
                              setEditCell({
                                location_id: row.location_id,
                                location_name: row.location_name,
                                month,
                                service_date: cell.service_date ?? null,
                                invoice_status: cell.invoice_status ?? 'not_invoiced',
                              })
                              setEditDate(cell.service_date ? cell.service_date.slice(0, 10) : '')
                              setEditInvoiceStatus(cell.invoice_status ?? 'not_invoiced')
                            }}
                          >
                            <span className={isEmpty ? 'text-zinc-300' : 'text-zinc-900'}>{formatDay(cell.service_date)}</span>
                            {isInvoiced ? (
                              <span className="absolute right-1 top-1 text-green-600">
                                <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                                  <path
                                    fillRule="evenodd"
                                    d="M16.704 5.29a1 1 0 0 1 .006 1.415l-7.2 7.25a1 1 0 0 1-1.422.008L3.29 9.165a1 1 0 1 1 1.42-1.41l3.08 3.09 6.49-6.53a1 1 0 0 1 1.424-.025Z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </span>
                            ) : null}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={Boolean(editCell)} onOpenChange={() => setEditCell(null)}>
        <DialogContent className="max-w-md w-full p-8">
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">{editCell?.location_name}</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-zinc-500">
                {editCell ? `${monthNames[editCell.month - 1]} ${year}` : t('overview.dialog.recordFallback')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">{t('overview.dialog.visitDate')}</label>
              <Input
                type="date"
                value={editDate}
                onChange={(event) => setEditDate(event.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div className="border-t border-zinc-200 pt-4 mt-2" />
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-zinc-700">{t('overview.dialog.invoiceStatus')}</div>
                  <div className="text-xs text-zinc-500">
                    {editInvoiceStatus === 'invoiced'
                      ? t('overview.dialog.invoiceStatusValue.invoiced')
                      : t('overview.dialog.invoiceStatusValue.notInvoiced')}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={async () => {
                    if (!editCell) return
                    const nextStatus = editInvoiceStatus === 'invoiced' ? 'not_invoiced' : 'invoiced'
                    await toggleMutation.mutateAsync({
                      location_id: editCell.location_id,
                      year,
                      month: editCell.month,
                      invoice_status: nextStatus,
                    })
                    setEditInvoiceStatus(nextStatus)
                  }}
                  className={`relative inline-flex h-6 w-12 items-center rounded-full transition ${editInvoiceStatus === 'invoiced' ? 'bg-green-500' : 'bg-zinc-300'} ${!isAdmin ? 'opacity-60' : ''}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${editInvoiceStatus === 'invoiced' ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-6 mt-2">
              {isAdmin && editCell?.service_date ? (
                <Button
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    if (!editCell) return
                    await deleteMutation.mutateAsync({
                      location_id: editCell.location_id,
                      year,
                      month: editCell.month,
                    })
                    setEditCell(null)
                  }}
                >
                  {t('overview.dialog.removeDate')}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditCell(null)}>
                  {t('overview.dialog.close')}
                </Button>
                {isAdmin ? (
                  <Button
                    onClick={async () => {
                      if (!editCell) return
                      const formattedDate = editDate ? editDate.split('T')[0] : null
                      const payload = {
                        location_id: editCell.location_id,
                        year,
                        month: editCell.month,
                        service_date: formattedDate,
                      }
                      await updateMutation.mutateAsync(payload)
                      setEditCell(null)
                    }}
                  >
                    {t('overview.dialog.save')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RmsOverview
