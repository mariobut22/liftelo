import { useState } from 'react'
import { toast } from 'sonner'

import { createSuperadminCompany } from '../../services/api'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import FormField from '../form/FormField'
import FormLabel from '../form/FormLabel'
import FormError from '../form/FormError'
import FormActions from '../form/FormActions'

interface CreateCompanyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

function CreateCompanyModal({ open, onOpenChange, onCreated }: CreateCompanyModalProps) {
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
      toast.success('Company created')
      resetForm()
      onCreated()
      onOpenChange(false)
    } catch (err) {
      console.error('Create company failed', err)
      setError('Unable to create company')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="space-y-2 border-b border-zinc-200 px-6 py-4">
          <DialogTitle>Create Company</DialogTitle>
          <DialogDescription>Manage company creation and SaaS configuration.</DialogDescription>
        </div>
        <form className="space-y-4 px-6 py-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <FormLabel htmlFor="company-name">Company name</FormLabel>
            <FormField>
              <Input
                id="company-name"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Company name"
                required
              />
            </FormField>
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="admin-email">Admin email</FormLabel>
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
            <FormLabel htmlFor="admin-password">Admin password</FormLabel>
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? 'Creating...' : 'Create Company'}
            </button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateCompanyModal
