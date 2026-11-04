import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import type { PaymentRequiredKind } from '../../services/billingEvents'
import { useTranslation } from 'react-i18next'

type AccessDialogProps = {
  open: boolean
  kind: PaymentRequiredKind
  isAdmin: boolean
  reason?: 'trial_expired' | 'subscription_inactive' | null
  onClose: () => void
  onChoosePlan: () => void
}

function AccessDialog({ open, kind, isAdmin, reason, onClose, onChoosePlan }: AccessDialogProps) {
  const { t } = useTranslation()

  const showPlans = kind === 'subscription_locked' && isAdmin

  let title = t('nav:accessDialog.serviceCurrentlyDisabled')
  let description = t('nav:accessDialog.serviceCurrentlyDisabledContactCompany')

  if (kind === 'viewer_read_only') {
    title = t('common:labels.viewOnly')
    description = t('nav:accessDialog.roleViewerCanOnlyView')
  } else if (showPlans) {
    title = reason === 'trial_expired' ? t('nav:accessDialog.trialPeriodHasEnded') : t('nav:accessDialog.subscriptionNotActive')
    description =
      t('nav:accessDialog.canOnlyViewApplicationEnter')
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-md p-6">
        <DialogTitle className="text-lg font-semibold text-zinc-900">{title}</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-zinc-600">{description}</DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {showPlans ? t('common:actions.later') : t('common:actions.ok')}
          </Button>
          {showPlans ? <Button onClick={onChoosePlan}>{t('nav:accessDialog.choosePlan')}</Button> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default AccessDialog
