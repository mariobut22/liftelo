import { useState } from 'react'
import { toast } from 'sonner'

import { createSuperadminCompany } from '../../services/api'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import FormField from '../form/FormField'
import FormLabel from '../form/FormLabel'
import FormError from '../form/FormError'
import FormActions from '../form/FormActions'
import { useTranslation } from 'react-i18next'

interface CreateCompanyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

function CreateCompanyModal({ open, onOpenChange, onCreated }: CreateCompanyModalProps) {
  const { t } = useTranslation()

  const [companyName, setCompanyName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setCompanyName('')
    setAdminEmail('')
    setAdminPassword('')
    setError(null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await createSuperadminCompany({
        name: companyName,
        admin_email: adminEmail,
        admin_password: adminPassword,
      })
      toast.success(t('superadmin:createCompanyModal.companyCreated'))
      resetForm()
      onCreated()
      onOpenChange(false)
    } catch (err) {
      console.error('Create company failed', err)
      setError(t('superadmin:createCompanyModal.unableCreateCompany'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="space-y-2 border-b border-zinc-200 px-6 py-4">
          <DialogTitle>{t('superadmin:createCompany')}</DialogTitle>
          <DialogDescription>{t('superadmin:createCompanyModal.manageCompanyCreationSaasConfiguration')}</DialogDescription>
        </div>
        <form className="space-y-4 px-6 py-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <FormLabel htmlFor="company-name">{t('superadmin:createCompanyModal.companyName')}</FormLabel>
            <FormField>
              <Input
                id="company-name"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder={t('superadmin:createCompanyModal.companyName')}
                required
              />
            </FormField>
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="admin-email">{t('superadmin:createCompanyModal.adminEmail')}</FormLabel>
            <FormField>
              <Input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="admin@example.com"
                required
              />
            </FormField>
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="admin-password">{t('superadmin:createCompanyModal.adminPassword')}</FormLabel>
            <FormField>
              <Input
                id="admin-password"
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
            </FormField>
          </div>
          {error ? <FormError>{error}</FormError> : null}
          <FormActions>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
            >
              {t('common:actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? t('superadmin:createCompanyModal.creating') : t('superadmin:createCompany')}
            </button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateCompanyModal
