import { useState } from 'react'
import type { FallbackProps } from 'react-error-boundary'

import { Button } from './ui/button'
import { Card } from './ui/card'

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const safeError = error instanceof Error ? error : new Error('Unknown error')
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
          <h1 className="text-xl font-semibold text-zinc-900">Nešto je pošlo po krivu</h1>
          <p className="text-sm text-zinc-500">
            Dogodila se neočekivana greška. Pokušajte ponovo ili prijavite problem.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={resetErrorBoundary}>Pokušaj ponovo</Button>
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? 'Detalji kopirani' : 'Prijavi problem'}
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default ErrorFallback
