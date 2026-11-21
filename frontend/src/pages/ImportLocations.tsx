import { useCallback, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import ImportPreviewTable from '../components/import/ImportPreviewTable'
import { cn } from '../lib/utils'
import {
  applyLocationImport,
  checkImportFile,
  downloadImportTemplate,
  newClientRequestId,
  previewLocationImport,
} from '../lib/locationImport'
import type { ImportPreview, ImportResult } from '../lib/locationImport'
import useAuthStore from '../store/authStore'

type Step = 'upload' | 'check' | 'confirm' | 'done'
const STEPS: Array<'upload' | 'check' | 'confirm'> = ['upload', 'check', 'confirm']

function Stepper({ step }: { step: Step }) {
  const { t } = useTranslation('import')
  const current = step === 'done' ? STEPS.length : STEPS.indexOf(step) + 1
  return (
    <div className="space-y-2" data-testid="import-stepper">
      <p className="text-xs font-medium text-zinc-500">{t('steps.label', { current, total: STEPS.length })}</p>
      <ol className="flex items-center gap-2">
        {STEPS.map((name, index) => {
          const number = index + 1
          const active = number === current
          const done = number < current || step === 'done'
          return (
            <li
              key={name}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-2 py-2 text-xs font-medium sm:px-3 sm:text-sm',
                active ? 'border-zinc-900 bg-zinc-900 text-white' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-white text-zinc-500'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]',
                  active ? 'bg-white text-zinc-900' : done ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-500'
                )}
              >
                {number}
              </span>
              <span className="truncate">{t(`steps.${name}`)}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function ImportLocations() {
  const { t, i18n } = useTranslation('import')
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [includeWarnings, setIncludeWarnings] = useState(false)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const requestId = useRef(newClientRequestId())

  const reset = useCallback(() => {
    setStep('upload')
    setFile(null)
    setPreview(null)
    setProblem(null)
    setIncludeWarnings(false)
    setOnlyProblems(false)
    setResult(null)
    requestId.current = newClientRequestId()
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const handleFile = useCallback(
    async (picked: File | null | undefined) => {
      if (!picked) return
      setProblem(null)
      const issue = checkImportFile(picked)
      if (issue) {
        setProblem(t(`upload.problems.${issue}`))
        return
      }
      setChecking(true)
      try {
        const report = await previewLocationImport(picked)
        setFile(picked)
        setPreview(report)
        setIncludeWarnings(false)
        setOnlyProblems(report.summary.error + report.summary.warning > 0 && report.summary.rows > 20)
        requestId.current = newClientRequestId() // a new file = a new import
        setStep('check')
      } catch (err) {
        setProblem(err instanceof Error ? err.message : t('upload.problems.empty'))
      } finally {
        setChecking(false)
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [t]
  )

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    void handleFile(event.dataTransfer.files?.[0])
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0])
  }

  const download = async (kind: 'xlsx' | 'csv') => {
    try {
      await downloadImportTemplate(kind, i18n.language)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '')
    }
  }

  const plan = useMemo(() => {
    if (!preview) return null
    return includeWarnings ? preview.summary.will_create_with_warnings : preview.summary.will_create
  }, [preview, includeWarnings])

  const startImport = async () => {
    if (!file) return
    setApplying(true)
    setProblem(null)
    try {
      const outcome = await applyLocationImport(file, { clientRequestId: requestId.current, includeWarnings })
      setResult(outcome)
      setStep('done')
      for (const key of ['locations', 'locations-with-activity', 'homeSummary']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    } catch (err) {
      // the same request id is kept, so pressing the button again after a lost connection can never create anything twice
      setProblem(err instanceof Error ? err.message : '')
    } finally {
      setApplying(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <Card className="mx-auto w-full max-w-lg rounded-xl p-6 text-center shadow-sm" data-testid="import-forbidden">
          <p className="text-sm text-zinc-600">{t('page.adminOnly')}</p>
          <Link to="/dashboard/home" className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-zinc-900 underline">
            {t('page.back')}
          </Link>
        </Card>
      </div>
    )
  }

  const problemBox = problem ? (
    <div role="alert" data-testid="import-problem" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{problem}</span>
    </div>
  ) : null

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6" data-testid="import-page">
      <div className="space-y-2">
        <Link
          to="/dashboard/locations"
          className="inline-flex min-h-9 items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('page.back')}
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900">{t('page.title')}</h1>
        <p className="text-sm text-zinc-500">{t('page.subtitle')}</p>
      </div>

      <Stepper step={step} />

      {step === 'upload' ? (
        <Card className="space-y-5 rounded-xl p-4 shadow-sm sm:p-6" data-testid="import-step-upload">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t('upload.title')}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t('upload.templateHint')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => void download('xlsx')} data-testid="import-template-xlsx" className="w-full sm:w-auto">
              <Download className="h-4 w-4" />
              {t('upload.downloadXlsx')}
            </Button>
            <Button variant="outline" onClick={() => void download('csv')} data-testid="import-template-csv" className="w-full sm:w-auto">
              <Download className="h-4 w-4" />
              {t('upload.downloadCsv')}
            </Button>
          </div>

          <div
            data-testid="import-dropzone"
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors sm:p-10',
              dragging ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-300 bg-white'
            )}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
              {checking ? <FileSpreadsheet className="h-5 w-5 animate-pulse" /> : <Upload className="h-5 w-5" />}
            </span>
            <p className="text-sm font-medium text-zinc-900">
              {checking ? t('upload.checking') : dragging ? t('upload.dropActive') : t('upload.dropTitle')}
            </p>
            {!checking ? (
              <>
                <p className="text-xs text-zinc-500">{t('upload.dropOr')}</p>
                <Button onClick={() => inputRef.current?.click()} data-testid="import-choose-file">
                  {t('upload.choose')}
                </Button>
              </>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              className="sr-only"
              data-testid="import-file-input"
              aria-label={t('upload.choose')}
              onChange={onPick}
              disabled={checking}
            />
          </div>
          <p className="text-xs text-zinc-500">{t('upload.limits')}</p>
          {problemBox}
        </Card>
      ) : null}

      {step === 'check' && preview && plan ? (
        <Card className="space-y-4 rounded-xl p-4 shadow-sm sm:p-6" data-testid="import-step-check">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t('preview.title')}</h2>
            <p className="mt-1 break-all text-sm text-zinc-500">{file?.name}</p>
          </div>

          <div className="grid grid-cols-3 gap-2" data-testid="import-counts">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">{t('preview.counts.ok')}</p>
              <p className="text-2xl font-semibold text-emerald-800" data-testid="count-ok">{preview.summary.ok}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">{t('preview.counts.warning')}</p>
              <p className="text-2xl font-semibold text-amber-800" data-testid="count-warning">{preview.summary.warning}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs text-rose-700">{t('preview.counts.error')}</p>
              <p className="text-2xl font-semibold text-rose-800" data-testid="count-error">{preview.summary.error}</p>
            </div>
          </div>

          <p className="text-sm font-medium text-zinc-900" data-testid="import-will-create">
            {t('preview.willCreate', { locations: plan.locations, elevators: plan.elevators })}
          </p>
          {plan.skipped > 0 ? <p className="text-sm text-zinc-500">{t('preview.skippedRows', { number: plan.skipped })}</p> : null}
          {preview.columns.some((c) => !c.field) ? (
            <p className="break-words text-xs text-zinc-500">
              {t('preview.ignoredColumns', { list: preview.columns.filter((c) => !c.field).map((c) => c.header).join(', ') })}
            </p>
          ) : null}
          {preview.summary.error > 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('preview.errorsHint')}</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                data-testid="import-only-problems"
                checked={onlyProblems}
                onChange={(event) => setOnlyProblems(event.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              {t('preview.onlyProblems')}
            </label>
            {preview.summary.warning > 0 ? (
              <label className="flex min-h-10 cursor-pointer items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  data-testid="import-include-warnings"
                  checked={includeWarnings}
                  onChange={(event) => setIncludeWarnings(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                />
                {t('preview.includeWarnings')}
              </label>
            ) : null}
          </div>

          <ImportPreviewTable rows={preview.rows} onlyProblems={onlyProblems} />

          {plan.locations === 0 ? <p className="text-sm text-rose-600" data-testid="import-nothing">{t('preview.nothingToImport')}</p> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={reset} data-testid="import-choose-other">
              {t('preview.chooseOther')}
            </Button>
            <Button onClick={() => setStep('confirm')} disabled={plan.locations === 0} data-testid="import-continue">
              {t('preview.continue')}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'confirm' && preview && plan ? (
        <Card className="space-y-4 rounded-xl p-4 shadow-sm sm:p-6" data-testid="import-step-confirm">
          <h2 className="text-lg font-semibold text-zinc-900">{t('confirm.title')}</h2>
          <p className="text-base text-zinc-900" data-testid="import-confirm-summary">
            {t('confirm.summary', { locations: plan.locations, elevators: plan.elevators })}
          </p>
          {plan.skipped > 0 ? <p className="text-sm text-zinc-500">{t('confirm.skipped', { number: plan.skipped })}</p> : null}
          <p className="text-sm text-zinc-500">{t('confirm.mapNote')}</p>
          {problemBox}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => { setProblem(null); setStep('check') }} disabled={applying}>
              {t('confirm.back')}
            </Button>
            <Button onClick={() => void startImport()} disabled={applying} data-testid="import-start">
              {applying ? t('confirm.importing') : t('confirm.start')}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'done' && result ? (
        <Card className="space-y-4 rounded-xl p-4 shadow-sm sm:p-6" data-testid="import-step-done">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h2 className="text-lg font-semibold text-zinc-900">{t('result.title')}</h2>
              <p className="text-sm text-zinc-700" data-testid="import-result-created">
                {t('result.created', { locations: result.locations_created, elevators: result.elevators_created })}
              </p>
              {result.skipped > 0 ? <p className="text-sm text-zinc-500">{t('result.skipped', { number: result.skipped })}</p> : null}
              {result.duplicate ? <p className="text-sm text-zinc-500">{t('result.replay')}</p> : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to="/dashboard/locations"
              data-testid="import-go-locations"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              {t('result.goToLocations')}
            </Link>
            {result.elevators_created > 0 ? (
              <Link
                to="/dashboard/qr-labels"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                {t('result.qrLabels')}
              </Link>
            ) : null}
            <Button variant="outline" onClick={reset}>
              {t('result.another')}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

export default ImportLocations
