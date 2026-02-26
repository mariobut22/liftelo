import type { PropsWithChildren } from 'react'

function FormActions({ children }: PropsWithChildren) {
  return (
    <div className="flex flex-col justify-end gap-2 border-t border-zinc-200 pt-4 sm:flex-row">
      {children}
    </div>
  )
}

export default FormActions
