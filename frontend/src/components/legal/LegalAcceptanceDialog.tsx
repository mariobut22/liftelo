import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { acceptLegal, getLegalStatus } from '../../services/api'
import useAuthStore from '../../store/authStore'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import LegalConsent from './LegalConsent'

/**
 * Blocking dialog for signed-in users who have not yet accepted the CURRENT version of the Terms / Privacy Policy
 * (never accepted, or the version changed). It cannot be dismissed; the alternative is to sign out.
 * Enforcement is in the UI; the server only records the acceptance (docs/infrastructure.md "Pravni zahtjevi").
 */
function LegalAcceptanceDialog() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [checked, setChecked] = useState(false)

  const statusQuery = useQuery({
    queryKey: ['legal-status', user?.id],
    queryFn: getLegalStatus,
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const acceptMutation = useMutation({
    mutationFn: acceptLegal,
    onSuccess: (status) => {
      queryClient.setQueryData(['legal-status', user?.id], status)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('auth:legal.acceptFailed'))
    },
  })

  if (!user || statusQuery.data?.enabled === false || !statusQuery.data?.needs_acceptance) return null

  return (
    <Dialog open>
      <DialogContent
        className="max-w-md p-6"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogTitle className="text-lg font-semibold text-zinc-900">{t('auth:legal.dialogTitle')}</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-zinc-600">{t('auth:legal.dialogDescription')}</DialogDescription>
        <div className="mt-4">
          <LegalConsent id="legal-dialog-accept" checked={checked} onChange={setChecked} />
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => logout()}>
            {t('common:actions.signOut')}
          </Button>
          <Button disabled={!checked || acceptMutation.isPending} onClick={() => acceptMutation.mutate()}>
            {t('auth:legal.accept')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default LegalAcceptanceDialog
