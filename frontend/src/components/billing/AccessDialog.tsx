import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import type { PaymentRequiredKind } from '../../services/billingEvents'

type AccessDialogProps = {
  open: boolean
  kind: PaymentRequiredKind
  isAdmin: boolean
  reason?: 'trial_expired' | 'subscription_inactive' | null
  onClose: () => void
  onChoosePlan: () => void
}

function AccessDialog({ open, kind, isAdmin, reason, onClose, onChoosePlan }: AccessDialogProps) {
  const showPlans = kind === 'subscription_locked' && isAdmin

  let title = 'Usluga je trenutno onemogućena'
  let description = 'Usluga je trenutno onemogućena. Obratite se administratoru tvrtke.'

  if (kind === 'viewer_read_only') {
    title = 'Samo pregled'
    description = 'Vaša uloga (viewer) ima pravo samo pregledavati podatke. Unos i izmjene nisu dostupni.'
  } else if (showPlans) {
    title = reason === 'trial_expired' ? 'Probni period je istekao' : 'Pretplata nije aktivna'
    description =
      'Aplikaciju možete samo pregledavati. Za unos novih podataka (lokacije, nalozi, vozila, korisnici...) odaberite ili obnovite jedan od paketa.'
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-md p-6">
        <DialogTitle className="text-lg font-semibold text-zinc-900">{title}</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-zinc-600">{description}</DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {showPlans ? 'Kasnije' : 'U redu'}
          </Button>
          {showPlans ? <Button onClick={onChoosePlan}>Odaberi paket</Button> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default AccessDialog
