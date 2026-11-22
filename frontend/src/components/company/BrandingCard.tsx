import { useEffect, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Card } from '../ui/card'
import useCompany from '../../hooks/queries/useCompany'
import { API_BASE_URL, removeCompanyLogo, updateCompanyBranding, uploadCompanyLogo } from '../../services/api'

const HEX = /^#[0-9a-fA-F]{6}$/
const LOGO_MAX_BYTES = 1024 * 1024
const LOGO_TYPES = ['image/png', 'image/jpeg']
const PRESETS = ['#1D4ED8', '#0F766E', '#15803D', '#B45309', '#B91C1C', '#7E22CE']
// the PDF headings default to this dark grey when no accent is set
const DEFAULT_HEADING = '#111827'

const logoSrc = (path: string, version: number) => {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL.replace(/\/$/, '')}${normalized}?v=${version}`
}

/**
 * Settings -> Branding (admin): company logo (PNG/JPEG, max 1 MB) and accent colour for generated PDFs
 * (RMS, intervention, work order). Presentation only; already signed documents keep their frozen look.
 */
function BrandingCard() {
  const { t } = useTranslation('branding')
  const queryClient = useQueryClient()
  const { data: company } = useCompany()
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)
  const [logoVersion, setLogoVersion] = useState(0)
  const [busy, setBusy] = useState<'upload' | 'remove' | 'colour' | null>(null)
  const savedAccent = company?.brand_accent_color ?? ''
  const [accent, setAccent] = useState('')
  const [accentTouched, setAccentTouched] = useState(false)

  useEffect(() => {
    if (!accentTouched) setAccent(savedAccent)
  }, [savedAccent, accentTouched])

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  const clearPreview = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = null
    setPreviewUrl(null)
    setFile(null)
  }

  const handleFile = (picked?: File | null) => {
    clearPreview()
    if (!picked) return
    if (!LOGO_TYPES.includes(picked.type)) {
      toast.error(t('errors.type'))
      return
    }
    if (picked.size > LOGO_MAX_BYTES) {
      toast.error(t('errors.size'))
      return
    }
    const url = URL.createObjectURL(picked)
    previewRef.current = url
    setPreviewUrl(url)
    setFile(picked)
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['company'] })

  const upload = async () => {
    if (!file) return
    setBusy('upload')
    try {
      await uploadCompanyLogo(file)
      toast.success(t('logo.saved'))
      clearPreview()
      setLogoVersion((v) => v + 1)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('logo.failed'))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('remove')
    try {
      await removeCompanyLogo()
      toast.success(t('logo.removed'))
      clearPreview()
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('logo.failed'))
    } finally {
      setBusy(null)
    }
  }

  const accentValid = accent === '' || HEX.test(accent)
  const accentDirty = accent.toUpperCase() !== savedAccent.toUpperCase()
  const effectiveAccent = HEX.test(accent) ? accent : DEFAULT_HEADING

  const saveAccent = async (value: string | null) => {
    setBusy('colour')
    try {
      await updateCompanyBranding(value)
      toast.success(t('accent.saved'))
      setAccentTouched(false)
      if (value === null) setAccent('')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('accent.failed'))
    } finally {
      setBusy(null)
    }
  }

  const currentLogo = previewUrl ?? (company?.logo_path ? logoSrc(company.logo_path, logoVersion) : null)

  return (
    <Card id="branding" data-testid="branding-card" className="rounded-xl border border-zinc-200 p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900">{t('title')}</h2>
        <p className="text-sm text-zinc-500">{t('description')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3" data-testid="branding-logo">
          <p className="text-xs font-semibold uppercase text-zinc-400">{t('logo.label')}</p>
          <div className="flex h-24 w-full max-w-xs items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
            {currentLogo ? (
              <img src={currentLogo} alt={t('logo.alt')} className="h-full w-full object-contain" data-testid="branding-logo-img" />
            ) : (
              <span className="text-xs text-zinc-400">{t('logo.none')}</span>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-blue-600">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {t('logo.choose')}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              data-testid="branding-logo-input"
              onChange={(event) => {
                handleFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={upload} disabled={!file || busy !== null} data-testid="branding-logo-upload">
              {t('logo.upload')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={remove}
              disabled={!company?.logo_path || busy !== null}
              data-testid="branding-logo-remove"
            >
              {t('logo.remove')}
            </Button>
          </div>
          <p className="text-xs text-zinc-500">{t('logo.hint')}</p>
        </div>

        <div className="space-y-3" data-testid="branding-accent">
          <p className="text-xs font-semibold uppercase text-zinc-400">{t('accent.label')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              aria-label={t('accent.pick')}
              value={HEX.test(accent) ? accent : DEFAULT_HEADING}
              onChange={(event) => {
                setAccentTouched(true)
                setAccent(event.target.value.toUpperCase())
              }}
              className="h-10 w-12 cursor-pointer rounded border border-zinc-200 bg-white p-1"
              data-testid="branding-accent-picker"
            />
            <input
              type="text"
              inputMode="text"
              maxLength={7}
              value={accent}
              placeholder={PRESETS[0]}
              aria-label={t('accent.hex')}
              aria-invalid={!accentValid}
              onChange={(event) => {
                setAccentTouched(true)
                setAccent(event.target.value.trim())
              }}
              className="w-28 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
              data-testid="branding-accent-hex"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('accent.presets')}>
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={preset}
                onClick={() => {
                  setAccentTouched(true)
                  setAccent(preset)
                }}
                className="h-8 w-8 rounded-full border border-zinc-200"
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
          {!accentValid ? (
            <p className="text-xs text-red-600" data-testid="branding-accent-error">
              {t('accent.invalid')}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => saveAccent(accent === '' ? null : accent.toUpperCase())}
              disabled={!accentValid || !accentDirty || busy !== null}
              data-testid="branding-accent-save"
            >
              {t('accent.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveAccent(null)}
              disabled={(!savedAccent && accent === '') || busy !== null}
              data-testid="branding-accent-reset"
            >
              {t('accent.reset')}
            </Button>
          </div>
        </div>
      </div>

      <div className="theme-light mt-6 rounded-lg border border-zinc-200 bg-white p-4" data-testid="branding-preview" aria-label={t('preview.label')}>
        <p className="mb-2 text-xs font-semibold uppercase text-zinc-400">{t('preview.label')}</p>
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-bold" style={{ color: effectiveAccent }} data-testid="branding-preview-title">
            {t('preview.title')}
          </p>
          {currentLogo ? <img src={currentLogo} alt="" className="h-10 max-w-[120px] object-contain" /> : null}
        </div>
        <p className="mt-3 border-b pb-1 text-xs font-bold" style={{ color: effectiveAccent, borderColor: effectiveAccent }}>
          {t('preview.section')}
        </p>
        <p className="mt-1 text-xs text-zinc-600">{t('preview.body')}</p>
      </div>
      <p className="mt-3 text-xs text-zinc-500">{t('signedNote')}</p>
    </Card>
  )
}

export default BrandingCard
