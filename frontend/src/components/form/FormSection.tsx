import type { PropsWithChildren } from 'react'

interface FormSectionProps {
  title: string
  description?: string
  action?: React.ReactNode
}

function FormSection({ title, description, action, children }: PropsWithChildren<FormSectionProps>) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

export default FormSection
