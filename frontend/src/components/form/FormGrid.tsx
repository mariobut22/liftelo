import type { PropsWithChildren } from 'react'

interface FormGridProps {
  columns?: 1 | 2 | 3
}

const columnStyles: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
}

function FormGrid({ columns = 2, children }: PropsWithChildren<FormGridProps>) {
  return <div className={`grid gap-4 ${columnStyles[columns]}`}>{children}</div>
}

export default FormGrid
