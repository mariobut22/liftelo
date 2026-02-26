import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import useAuthStore from '../store/authStore'
import { getCompanyUsers, inviteCompanyUser, removeCompanyUser } from '../services/api'
import HorizontalScroll from '../components/layout/HorizontalScroll'

type CompanyUserRow = {
  id: number
  email: string
  role: string
  is_active: number
}

function Users() {
  const { t } = useTranslation('users')
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const activeCompanyId = useAuthStore((state) => state.user?.company_id)
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'technician' | 'viewer'>('technician')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [users, setUsers] = useState<CompanyUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const roleBadgeClass = (role: CompanyUserRow['role']) => {
    switch (role) {
      case 'admin':
        return 'border border-purple-200 bg-purple-100 text-purple-700'
      case 'technician':
        return 'border border-blue-200 bg-blue-100 text-blue-700'
      case 'viewer':
      default:
        return 'border border-zinc-200 bg-zinc-100 text-zinc-600'
    }
  }

  useEffect(() => {
    const fetchUsers = async () => {
      if (!activeCompanyId) return
      setLoading(true)
      setError(null)
      try {
        const rows = await getCompanyUsers(activeCompanyId)
        setUsers(rows)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.load'))
      } finally {
        setLoading(false)
      }
    }
    void fetchUsers()
  }, [activeCompanyId])


  if (!isAdmin) {
    return <Navigate to="/dashboard/home" replace />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{t('title')}</h1>
        <p className="text-sm text-zinc-500">{t('description')}</p>
      </div>

      <Card className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">{t('invite.title')}</h2>
          <p className="text-sm text-zinc-500">{t('invite.description')}</p>
        </div>
        <form
          className="grid gap-4 md:grid-cols-[1fr_180px_160px]"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!activeCompanyId) return
            setInviteLoading(true)
            try {
              await inviteCompanyUser(activeCompanyId, { email: inviteEmail, role: inviteRole })
              toast.success(t('toast.inviteSuccess'))
              setInviteEmail('')
              setInviteRole('technician')
            } catch (err) {
              toast.error(err instanceof Error ? err.message : t('toast.inviteError'))
            } finally {
              setInviteLoading(false)
            }
          }}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700" htmlFor="invite-email">
              {t('invite.emailLabel')}
            </label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700" htmlFor="invite-role">
              {t('invite.roleLabel')}
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as 'admin' | 'technician' | 'viewer')}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
            >
              <option value="admin">{t('invite.roleOptions.admin')}</option>
              <option value="technician">{t('invite.roleOptions.technician')}</option>
              <option value="viewer">{t('invite.roleOptions.viewer')}</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={inviteLoading}>
              {inviteLoading ? t('invite.submitting') : t('invite.submit')}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">{t('company.title')}</h2>
          <p className="text-sm text-zinc-500">{t('company.description')}</p>
        </div>
        {loading ? (
          <div className="py-12 text-center text-sm text-zinc-500">{t('table.loading')}</div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-500">{t('table.empty')}</div>
        ) : (
          <HorizontalScroll>
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-3 pr-4">{t('table.email')}</th>
                  <th className="py-3 pr-4">{t('table.role')}</th>
                  <th className="py-3 pr-4">{t('table.status')}</th>
                  <th className="py-3 text-right">{t('table.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {users.map((user) => {
                  const isSelf = user.id === currentUserId
                  const canRemove = isAdmin && !isSelf
                  return (
                    <tr key={user.id}>
                      <td className="py-3 pr-4 font-medium text-zinc-900">{user.email}</td>
                      <td className="py-3 pr-4">
                        <Badge className={roleBadgeClass(user.role)}>{user.role}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          className={
                            user.is_active
                              ? 'border border-emerald-200 bg-emerald-100 text-emerald-700'
                              : 'border border-amber-200 bg-amber-100 text-amber-700'
                          }
                        >
                          {user.is_active ? t('table.statusValues.active') : t('table.statusValues.inactive')}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canRemove}
                          onClick={async () => {
                            if (!activeCompanyId) return
                            if (!canRemove) return
                            const confirmed = window.confirm(t('table.confirmRemove'))
                            if (!confirmed) return
                            try {
                              await removeCompanyUser(activeCompanyId, user.id)
                              setUsers((prev) => prev.filter((row) => row.id !== user.id))
                              toast.success(t('toast.removeSuccess'))
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : t('toast.removeError'))
                            }
                          }}
                        >
                          {t('table.remove')}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </HorizontalScroll>
        )}
      </Card>
    </div>
  )
}

export default Users
