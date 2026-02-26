import { useState } from 'react'
import { toast } from 'sonner'

import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import useAuthStore from '../store/authStore'
import { changePassword } from '../services/api'

function Profile() {
  const user = useAuthStore((state) => state.user)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (newPassword.length < 8 || confirmPassword.length < 8) {
      toast.error('Nova lozinka mora imati najmanje 8 znakova.')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Nove lozinke se ne podudaraju.')
      return
    }
    try {
      await changePassword(currentPassword.trim(), newPassword.trim())
      toast.success('Lozinka je uspješno promijenjena.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Greška pri promjeni lozinke.')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Moj profil</h1>
        <p className="text-sm text-zinc-500">Pregled korisničkih podataka.</p>
      </div>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-400">Email</p>
            <p className="text-sm text-zinc-700">{user?.username ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-400">Ime</p>
            <p className="text-sm text-zinc-700">{user?.username ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-400">Uloga</p>
            <p className="text-sm text-zinc-700">{user?.role ?? '—'}</p>
          </div>
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Promjena lozinke</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="current-password">
              Trenutna lozinka
            </label>
            <input
              id="current-password"
              type="password"
              placeholder="Unesite trenutnu lozinku"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="new-password">
              Nova lozinka
            </label>
            <input
              id="new-password"
              type="password"
              placeholder="Najmanje 8 znakova"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="confirm-password">
              Potvrdi novu lozinku
            </label>
            <input
              id="confirm-password"
              type="password"
              placeholder="Ponovno unesite lozinku"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit">Promijeni lozinku</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default Profile
