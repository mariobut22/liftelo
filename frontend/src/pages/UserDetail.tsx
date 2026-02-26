import { useMemo, useState } from 'react'
import { useParams, Navigate, useNavigate } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import useAuthStore from '../store/authStore'
import type { User } from '../types/user'
import { getUserById, getUserStats, getUserLatestInterventions, getUserLatestRms, resetUserPassword } from '../services/api'
import { useQuery } from '@tanstack/react-query'

function UserDetail() {
  const { t } = useTranslation('users')
  const { id } = useParams()
  const navigate = useNavigate()
  const isAdmin = useAuthStore((state) => state.isAdmin())

  const userId = Number(id)
  const { data: profile, isLoading, error } = useQuery<User>({
    queryKey: ['user', userId],
    queryFn: () => getUserById(userId),
    enabled: Number.isFinite(userId),
  })

  const { data: stats } = useQuery({
    queryKey: ['user', userId, 'stats'],
    queryFn: () => getUserStats(userId),
    enabled: Number.isFinite(userId),
  })

  const { data: latestRms } = useQuery({
    queryKey: ['user', userId, 'rms-latest'],
    queryFn: () => getUserLatestRms(userId),
    enabled: Number.isFinite(userId),
  })

  const { data: latestInterventions } = useQuery({
    queryKey: ['user', userId, 'interventions-latest'],
    queryFn: () => getUserLatestInterventions(userId),
    enabled: Number.isFinite(userId),
  })

  const [password, setPassword] = useState('')

  const resetPassword = async () => {
    if (!password.trim()) {
      toast.error(t('detail.resetPassword.errorTooShort'))
      return
    }
    if (password.trim().length < 6) {
      toast.error(t('detail.resetPassword.errorTooShort'))
      return
    }
    try {
      await resetUserPassword(userId, password.trim())
      toast.success(t('detail.resetPassword.success'))
      setPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detail.resetPassword.error'))
    }
  }

  const rmsItems = useMemo(() => latestRms ?? [], [latestRms])
  const interventionItems = useMemo(() => latestInterventions ?? [], [latestInterventions])

  if (!isAdmin) {
    return <Navigate to="/dashboard/home" replace />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{t('detail.title')}</h1>
          <p className="text-sm text-zinc-500">{t('detail.description')}</p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/dashboard/users')}>
          {t('detail.back')}
        </Button>
      </div>

      {isLoading ? (
        <Card className="rounded-xl border border-zinc-200 p-6 text-center shadow-sm">{t('detail.loading')}</Card>
      ) : null}

      {!isLoading && error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <ClipboardList className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('detail.errorTitle')}</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error ? error.message : t('detail.errorDescription')}
          </p>
        </Card>
      ) : null}

      {!isLoading && !error && profile ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-6">
            <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">{t('detail.labels.name')}</p>
                  <p className="text-sm font-semibold text-zinc-900">{profile.username}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">{t('detail.labels.email')}</p>
                  <p className="text-sm text-zinc-700">{profile.username}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">{t('detail.labels.role')}</p>
                  <p className="text-sm text-zinc-700">{profile.role}</p>
                </div>
              </div>
            </Card>

            <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900">{t('detail.statsTitle')}</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-xs text-zinc-500">{t('detail.stats.rms7')}</p>
                  <p className="text-lg font-semibold text-zinc-900">{stats?.rms_last_7_days ?? 0}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-xs text-zinc-500">{t('detail.stats.rms30')}</p>
                  <p className="text-lg font-semibold text-zinc-900">{stats?.rms_last_30_days ?? 0}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-xs text-zinc-500">{t('detail.stats.interventions7')}</p>
                  <p className="text-lg font-semibold text-zinc-900">{stats?.interventions_last_7_days ?? 0}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-xs text-zinc-500">{t('detail.stats.interventions30')}</p>
                  <p className="text-lg font-semibold text-zinc-900">{stats?.interventions_last_30_days ?? 0}</p>
                </div>
              </div>
            </Card>

            <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900">{t('detail.latestRms.title')}</h3>
              <ul className="mt-3 space-y-2 text-sm text-zinc-600">
                {rmsItems.length === 0 ? (
                  <li className="text-zinc-500">{t('detail.latestRms.empty')}</li>
                ) : (
                  rmsItems.map((item) => (
                    <li key={item.id}>
                      {t('detail.latestRms.item', {
                        id: item.id,
                        liftId: item.lift_id,
                        date: new Date(item.created_at).toLocaleDateString('hr-HR'),
                      })}
                    </li>
                  ))
                )}
              </ul>
            </Card>

            <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900">{t('detail.latestInterventions.title')}</h3>
              <ul className="mt-3 space-y-2 text-sm text-zinc-600">
                {interventionItems.length === 0 ? (
                  <li className="text-zinc-500">{t('detail.latestInterventions.empty')}</li>
                ) : (
                  interventionItems.map((item) => (
                    <li key={item.id}>
                      {t('detail.latestInterventions.item', {
                        id: item.id,
                        locationId: item.location_id,
                        date: new Date(item.created_at).toLocaleDateString('hr-HR'),
                      })}
                    </li>
                  ))
                )}
              </ul>
            </Card>
          </div>

          <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-900">{t('detail.resetPassword.title')}</h3>
            <p className="mt-1 text-xs text-zinc-500">{t('detail.resetPassword.description')}</p>
            <div className="mt-4 space-y-3">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                placeholder={t('detail.resetPassword.placeholder')}
              />
              <Button onClick={resetPassword}>{t('detail.resetPassword.save')}</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

export default UserDetail
