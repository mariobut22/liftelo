import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'

import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import useCompany from '../hooks/queries/useCompany'
import useAuthStore from '../store/authStore'
import useUploadCompanyLogo from '../hooks/mutations/useUploadCompanyLogo'
import CompanyEditModal from '../components/company/CompanyEditModal'

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('hr-HR') : '—')

function Company() {
  const { data: company, isLoading, error } = useCompany()
  const uploadLogo = useUploadCompanyLogo()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const [editOpen, setEditOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)
  const [logoVersion, setLogoVersion] = useState(0)
  const [uploadedLogoPath, setUploadedLogoPath] = useState<string | null>(null)

  const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
  const resolveImageUrl = (path?: string | null) => {
    if (!path) return null
    if (path.startsWith('http')) return path
    if (path.startsWith('/uploads')) return `${apiBaseUrl}${path}`
    return path
  }

  const logoUrl = useMemo(() => {
    const path = uploadedLogoPath ?? company?.logo ?? company?.logo_path
    if (!path) return null
    return `${resolveImageUrl(path)}?v=${logoVersion}`
  }, [company?.logo, company?.logo_path, logoVersion, uploadedLogoPath, apiBaseUrl])

  useEffect(() => {
    console.log('Company API response:', company)
  }, [company])

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
      }
    }
  }, [])

  const handleLogoChange = (file?: File | null) => {
    if (!file) {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
        previewRef.current = null
      }
      setPreviewUrl(null)
      setSelectedFile(null)
      return
    }
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
    }
    const url = URL.createObjectURL(file)
    previewRef.current = url
    setPreviewUrl(url)
    setSelectedFile(file)
  }

  const handleLogoUpload = async () => {
    if (!selectedFile || !isAdmin) return
    try {
      const response = await uploadLogo.mutateAsync(selectedFile)
      toast.success('Logo je uspješno spremljen.')
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
        previewRef.current = null
      }
      setPreviewUrl(null)
      setSelectedFile(null)
      setUploadedLogoPath(response.path)
      setLogoVersion((prev) => prev + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Greška pri uploadu logotipa.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Tvrtka</h1>
          <p className="text-sm text-zinc-500">Pregled informacija o tvrtki.</p>
        </div>
        {isAdmin ? (
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            Uredi
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <Card className="rounded-xl border border-zinc-200 p-6 text-center shadow-sm">Učitavanje...</Card>
      ) : null}

      {!isLoading && error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <Building2 className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">Greška</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error ? error.message : 'Ne možemo učitati tvrtku trenutno.'}
          </p>
        </Card>
      ) : null}

      {!isLoading && !error && company ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">Naziv</p>
                  <p className="text-sm font-semibold text-zinc-900">{company.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">ID</p>
                  <p className="text-sm font-semibold text-zinc-900">{company.id ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">Kreirano</p>
                  <p className="text-sm font-semibold text-zinc-900">{formatDate(company.created_at)}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">Adresa</p>
                  <p className="text-sm text-zinc-700">{company.address || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">Kontakt osoba</p>
                  <p className="text-sm text-zinc-700">{company.contact_person || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">Kontakt telefon</p>
                  <p className="text-sm text-zinc-700">{company.contact_phone || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">OIB</p>
                  <p className="text-sm text-zinc-700">{company.oib || '—'}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">Napomene</p>
                <p className="text-sm text-zinc-700">{company.notes || '—'}</p>
              </div>
            </div>
          </Card>

          <Card className="flex flex-col items-center gap-4 rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-50">
              {previewUrl ? (
                <img src={previewUrl} alt="Logo preview" className="h-full w-full object-contain" />
              ) : logoUrl ? (
                <img src={logoUrl} alt="Logo tvrtke" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-zinc-400">Logo nije postavljen</span>
              )}
            </div>
            {isAdmin ? (
              <div className="space-y-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-blue-600">
                  <ImagePlus className="h-4 w-4" />
                  Odaberi logo
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(event) => handleLogoChange(event.target.files?.[0])}
                  />
                </label>
                <div className="flex items-center justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={handleLogoUpload} disabled={uploadLogo.isPending || !selectedFile}>
                    Upload logo
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">PNG ili JPG, max 1MB</p>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      <CompanyEditModal open={editOpen} company={company ?? null} onOpenChange={setEditOpen} />
    </div>
  )
}

export default Company
