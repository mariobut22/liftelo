import type { PropsWithChildren } from 'react'
import { useTranslation } from 'react-i18next'

interface FormLabelProps {
  htmlFor?: string
  optional?: boolean
}

function FormLabel({ htmlFor, optional, children }: PropsWithChildren<FormLabelProps>) {
  const { t } = useTranslation()

  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-700">
      {children}
      {optional ? <span className="ml-2 text-xs text-zinc-400">{t('common:labels.optional')}</span> : null}
    </label>
  )
}

export default FormLabel
