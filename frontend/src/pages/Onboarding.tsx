import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { createCompany } from '../services/api'
import useAuthStore from '../store/authStore'
import { useTranslation } from 'react-i18next'

function Onboarding() {
  const { t } = useTranslation()

  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fetchSession = useAuthStore((state) => state.fetchSession)
  const fetchCompanies = useAuthStore((state) => state.fetchCompanies)

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <Card className="w-full max-w-xl rounded-2xl border border-zinc-200 p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">{t('auth:onboarding.welcomeLiftelo')}</h1>
            <p className="text-sm text-zinc-500">{t('auth:onboarding.getStartedCreateFirstWorkspace')}</p>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            const trimmed = name.trim()
            if (!trimmed || submitting) return

            setSubmitting(true)
            try {
              await createCompany({ name: trimmed })
              await Promise.all([fetchSession(), fetchCompanies()])
              toast.success(t('auth:onboarding.workspaceCreated'))
              navigate('/dashboard/home', { replace: true })
            } catch (err) {
              toast.error(err instanceof Error ? err.message : t('auth:onboarding.failedCreateWorkspace'))
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700" htmlFor="workspace-name">
              {t('common:labels.companyName')}
            </label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('auth:onboarding.eGLifteloServisD')}
              autoFocus
            />
          </div>

          <Button type="submit" disabled={submitting || !name.trim()} className="w-full">
            {submitting ? t('auth:onboarding.creatingWorkspace') : t('auth:onboarding.createWorkspace')}
          </Button>
        </form>
      </Card>
    </div>
  )
}

export default Onboarding
