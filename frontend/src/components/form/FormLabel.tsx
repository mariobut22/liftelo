import type { PropsWithChildren } from 'react'

interface FormLabelProps {
  htmlFor?: string
  optional?: boolean
}

function FormLabel({ htmlFor, optional, children }: PropsWithChildren<FormLabelProps>) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-700">
      {children}
      {optional ? <span className="ml-2 text-xs text-zinc-400">Optional</span> : null}
    </label>
  )
}

export default FormLabel
