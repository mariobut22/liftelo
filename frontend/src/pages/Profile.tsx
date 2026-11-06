import { useState } from 'react'
import { toast } from 'sonner'

import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import useAuthStore from '../store/authStore'
import { changePassword, downloadMyData } from '../services/api'
import { legalUrl } from '../config/legal'
import { useTranslation } from 'react-i18next'
import { roleLabel } from '../lib/statusLabels'

function Profile() {
  const { t } = useTranslation()

  const { i18n } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const [downloading, setDownloading] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (newPassword.length < 8 || confirmPassword.length < 8) {
      toast.error(t('settings:profile.newPasswordMustAtLeast'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('settings:profile.newPasswordsDoNotMatch'))
      return
    }
    try {
      await changePassword(currentPassword.trim(), newPassword.trim())
      toast.success(t('settings:profile.passwordChangedSuccessfully'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings:profile.failedChangePassword'))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{t('settings:profile.myProfile')}</h1>
        <p className="text-sm text-zinc-500">{t('settings:profile.overviewAccountDetails')}</p>
      </div>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-400">{t('common:labels.email')}</p>
            <p className="text-sm text-zinc-700">{user?.username ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-400">{t('common:labels.firstName')}</p>
            <p className="text-sm text-zinc-700">{user?.username ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-400">{t('common:labels.role')}</p>
            <p className="text-sm text-zinc-700">{user?.role ? roleLabel(t, user.role) : '—'}</p>
          </div>
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm" id="my-data">
        <h2 className="text-sm font-semibold text-zinc-900">{t('settings:profile.myData')}</h2>
        <p className="mt-1 text-sm text-zinc-500">{t('settings:profile.myDataDescription')}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true)
              try {
                await downloadMyData()
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t('settings:profile.myDataFailed'))
              } finally {
                setDownloading(false)
              }
            }}
          >
            {t('settings:profile.downloadMyData')}
          </Button>
          <span className="text-xs text-zinc-500">{t('settings:profile.myDataHint')}</span>
        </div>
        <p className="mt-4 text-sm text-zinc-600">
          <a className="font-medium text-zinc-900 underline underline-offset-2" href={legalUrl('terms', i18n.language)} target="_blank" rel="noopener noreferrer">
            {t('settings:profile.termsLink')}
          </a>
          {' · '}
          <a className="font-medium text-zinc-900 underline underline-offset-2" href={legalUrl('privacy', i18n.language)} target="_blank" rel="noopener noreferrer">
            {t('settings:profile.privacyLink')}
          </a>
        </p>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">{t('settings:profile.changePassword')}</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="current-password">
              {t('settings:profile.currentPassword')}
            </label>
            <input
              id="current-password"
              type="password"
              placeholder={t('settings:profile.enterCurrentPassword')}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="new-password">
              {t('settings:profile.newPassword')}
            </label>
            <input
              id="new-password"
              type="password"
              placeholder={t('settings:profile.atLeast8Characters')}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="confirm-password">
              {t('settings:profile.confirmNewPassword')}
            </label>
            <input
              id="confirm-password"
              type="password"
              placeholder={t('settings:profile.reEnterPassword')}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit">{t('settings:profile.changePassword2')}</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default Profile
