import { useMemo, useState, useEffect } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ChevronDown, ChevronUp, SearchX, Search } from 'lucide-react'

import { Button } from '../ui/button'
import HorizontalScroll from '../layout/HorizontalScroll'
import { Card } from '../ui/card'
import EmptyState from '../ui/empty-state'
import ResetFiltersButton from '../ui/reset-filters-button'
import { TableSkeletonRows } from '../ui/skeletons'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { useTranslation } from 'react-i18next'

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[]
  data: TData[]
  isLoading?: boolean
  filterRight?: React.ReactNode
  searchValue?: string
  onSearchChange?: (value: string) => void
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  columnFilters?: ColumnFiltersState
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>
  columnVisibilityKey?: string
  onRowClick?: (row: TData) => void
  /** Remembered page size (rows per page); with onPageSizeChange the page can persist it. */
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  /** Shows a "Reset filters" button while true; also turns the empty table into a "no results for these filters" state. */
  filtersActive?: boolean
  onResetFilters?: () => void
  /** Shown instead of the table rows when there is no data at all and no filter is active (role-aware, built by the page). */
  emptyState?: React.ReactNode
}

const PAGE_SIZES = [10, 25, 50, 100]

function DataTable<TData>({
  columns,
  data,
  isLoading,
  filterRight,
  searchValue,
  onSearchChange,
  sorting,
  onSortingChange,
  columnFilters,
  onColumnFiltersChange,
  columnVisibilityKey,
  onRowClick,
  pageSize,
  onPageSizeChange,
  filtersActive,
  onResetFilters,
  emptyState,
}: DataTableProps<TData>) {
  const { t } = useTranslation()

  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const [internalFilter, setInternalFilter] = useState('')
  const [internalColumnFilters, setInternalColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [showColumns, setShowColumns] = useState(false)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: pageSize ?? 10 })

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sorting ?? internalSorting,
      globalFilter: searchValue ?? internalFilter,
      columnFilters: columnFilters ?? internalColumnFilters,
      columnVisibility,
      pagination,
    },
    onPaginationChange: setPagination,
    onSortingChange: onSortingChange ?? setInternalSorting,
    onGlobalFilterChange: onSearchChange ?? setInternalFilter,
    onColumnFiltersChange: onColumnFiltersChange ?? setInternalColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  useEffect(() => {
    if (!columnVisibilityKey || typeof window === 'undefined') return
    const saved = window.localStorage.getItem(columnVisibilityKey)
    if (saved) {
      setColumnVisibility(JSON.parse(saved) as VisibilityState)
    }
  }, [columnVisibilityKey])

  useEffect(() => {
    if (!columnVisibilityKey || typeof window === 'undefined') return
    window.localStorage.setItem(columnVisibilityKey, JSON.stringify(columnVisibility))
  }, [columnVisibility, columnVisibilityKey])

  const columnsForToggle = useMemo(
    () =>
      table
        .getAllLeafColumns()
        .filter((column) => !(column.columnDef.meta as { hideFromColumns?: boolean })?.hideFromColumns),
    [table]
  )

  const changePageSize = (size: number) => {
    setPagination({ pageIndex: 0, pageSize: size })
    onPageSizeChange?.(size)
  }

  const totalRows = table.getFilteredRowModel().rows.length
  const pageRows = table.getRowModel().rows

  const visibleRows = useMemo(() => pageRows, [pageRows])

  return (
    <Card className="rounded-xl border border-zinc-200 shadow-sm" aria-busy={isLoading ? 'true' : 'false'}>
      {isLoading ? (
        <span role="status" className="sr-only">
          {t('common:states.loading')}
        </span>
      ) : null}
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-zinc-700">
          {t('common:table.showing', { shown: Math.min(pageRows.length, totalRows), total: totalRows })}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {filterRight}
          <ResetFiltersButton active={Boolean(filtersActive && onResetFilters)} onReset={() => onResetFilters?.()} />
          {columnVisibilityKey ? (
            <div className="relative">
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                onClick={() => setShowColumns((prev) => !prev)}
              >
                {t('common:table.columns')}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              {showColumns ? (
                <div className="absolute right-0 top-10 z-20 w-48 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg">
                  {columnsForToggle.map((column) => (
                    <button
                      type="button"
                      key={column.id}
                      onClick={() => column.toggleVisibility()}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
                    >
                      <span>
                        {typeof column.columnDef.header === 'string'
                          ? column.columnDef.header
                          : column.id}
                      </span>
                      <span>{column.getIsVisible() ? '✓' : ''}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex w-full max-w-sm items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 sm:w-auto">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              value={(searchValue ?? internalFilter) ?? ''}
              onChange={(event) => (onSearchChange ?? setInternalFilter)(event.target.value)}
              placeholder={t('common:states.searchPlaceholder')}
              className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <HorizontalScroll>
        <Table>
          <TableHeader className="sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-zinc-50">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="bg-zinc-50">
                    {header.isPlaceholder ? null : !header.column.getCanSort() ? (
                      flexRender(header.column.columnDef.header, header.getContext())
                    ) : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-2"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? (
                          <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />
                        ) : null}
                        {header.column.getIsSorted() === 'desc' ? (
                          <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                        ) : null}
                      </button>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeletonRows rows={6} columns={Math.max(columns.length, 1)} />
            ) : totalRows === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  {filtersActive && onResetFilters ? (
                    <EmptyState
                      compact
                      testId="empty-filtered"
                      icon={SearchX}
                      title={t('common:states.noResults')}
                      description={t('common:states.noResultsFiltered')}
                      action={<ResetFiltersButton active onReset={onResetFilters} />}
                    />
                  ) : (
                    emptyState ?? (
                      <div className="py-10 text-center text-sm text-zinc-500">{t('common:states.noResults')}</div>
                    )
                  )}
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row, index) => (
                <TableRow
                  key={row.id}
                  onClick={
                    onRowClick
                      ? (event) => {
                          // clicks on buttons, links and form controls inside the row keep their own action (no row navigation)
                          if ((event.target as HTMLElement).closest('a, button, select, input, textarea, label, [role="button"]')) return
                          onRowClick(row.original)
                        }
                      : undefined
                  }
                  className={`transition-colors duration-150 ${
                    index % 2 === 1 ? 'bg-zinc-50/40' : 'bg-white'
                  } ${onRowClick ? 'cursor-pointer hover:bg-zinc-50' : 'hover:bg-zinc-50'}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="animate-fade-in">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </HorizontalScroll>

      <div className="flex flex-col gap-3 border-t border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-zinc-500">
          {t('common:table.pageOf', { page: table.getState().pagination.pageIndex + 1, pages: table.getPageCount() })}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="hidden sm:inline">{t('common:table.rowsPerPage')}</span>
            <select
              aria-label={t('common:table.rowsPerPage')}
              data-testid="page-size"
              value={pagination.pageSize}
              onChange={(event) => changePageSize(Number(event.target.value))}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-700"
            >
              {(PAGE_SIZES.includes(pagination.pageSize) ? PAGE_SIZES : [...PAGE_SIZES, pagination.pageSize].sort((a, b) => a - b)).map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {t('common:actions.previous')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {t('common:actions.next')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default DataTable
