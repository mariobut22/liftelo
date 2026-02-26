import type { PropsWithChildren } from 'react'

interface FormFieldProps {
  label?: string
  description?: string
}

function FormField({ label, description, children }: PropsWithChildren<FormFieldProps>) {
  return (
    <div className="space-y-2">
      {label ? <p className="text-sm font-medium text-zinc-700">{label}</p> : null}
      {description ? <p className="text-xs text-zinc-400">{description}</p> : null}
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm">
        {children}
      </div>
    </div>
  )
}

export default FormField
