import type { PropsWithChildren } from 'react'

function FormError({ children }: PropsWithChildren) {
  if (!children) return null
  return <p className="text-xs text-rose-600">{children}</p>
}

export default FormError
