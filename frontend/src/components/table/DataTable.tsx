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
import { ChevronDown, ChevronUp, Search } from 'lucide-react'

import { Button } from '../ui/button'
import HorizontalScroll from '../layout/HorizontalScroll'
import { Card } from '../ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'

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
}

const rowSkeletons = Array.from({ length: 6 })

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
}: DataTableProps<TData>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const [internalFilter, setInternalFilter] = useState('')
  const [internalColumnFilters, setInternalColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [showColumns, setShowColumns] = useState(false)

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sorting ?? internalSorting,
      globalFilter: searchValue ?? internalFilter,
      columnFilters: columnFilters ?? internalColumnFilters,
      columnVisibility,
    },
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

  const totalRows = table.getFilteredRowModel().rows.length
  const pageRows = table.getRowModel().rows

  const visibleRows = useMemo(() => pageRows, [pageRows])

  return (
    <Card className="rounded-xl border border-zinc-200 shadow-sm">
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-zinc-700">
          Showing {Math.min(pageRows.length, totalRows)} of {totalRows}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {filterRight}
          {columnVisibilityKey ? (
            <div className="relative">
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                onClick={() => setShowColumns((prev) => !prev)}
              >
                Columns
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
              placeholder="Pretraži..."
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
                    {header.isPlaceholder ? null : (
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
              rowSkeletons.map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`} className="animate-fade-in">
                  {columns.map((_, cellIndex) => (
                    <TableCell key={`skeleton-${rowIndex}-${cellIndex}`}>
                      <div className="h-4 w-full animate-pulse rounded-md bg-zinc-200/70" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : totalRows === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-zinc-500">
                  Nema rezultata.
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row, index) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
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
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default DataTable
