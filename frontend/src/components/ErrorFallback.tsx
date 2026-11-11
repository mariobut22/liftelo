import { useState } from 'react'
import type { FallbackProps } from 'react-error-boundary'

import { Button } from './ui/button'
import { Card } from './ui/card'
import { useTranslation } from 'react-i18next'

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation()

  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const safeError = error instanceof Error ? error : new Error(t('common:states.unknownError'))
    const details = `${safeError.name}: ${safeError.message}\n${safeError.stack ?? ''}`

    try {
      await navigator.clipboard.writeText(details)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <Card className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="space-y-3">
          <h1 className="text-xl font-semibold text-zinc-900">{t('common:errorFallback.somethingWentWrong')}</h1>
          <p className="text-sm text-zinc-500">
            {t('common:errorFallback.unexpectedErrorOccurredTryAgain')}
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={resetErrorBoundary}>{t('common:errorFallback.tryAgain')}</Button>
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? t('common:errorFallback.detailsCopied') : t('common:errorFallback.reportProblem')}
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            {t('common:errorFallback.reloadPage')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default ErrorFallback
