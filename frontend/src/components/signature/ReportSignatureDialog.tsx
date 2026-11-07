import { useTranslation } from 'react-i18next'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import ReportSignaturePanel from './ReportSignaturePanel'
import type { ReportType } from '../../lib/reportSignatures'

type Props = {
  target: { type: ReportType; id: number; name?: string | null } | null
  onClose: () => void
}

/** The signature panel in a dialog (used from the intervention / RMS lists, where there is no detail page). */
function ReportSignatureDialog({ target, onClose }: Props) {
  const { t } = useTranslation('signature')
  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl p-0">
        <div className="shrink-0 border-b border-zinc-200 px-6 py-4">
          <DialogTitle>{t('dialog.title')}</DialogTitle>
          <DialogDescription>{target?.name ?? ''}</DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {target ? <ReportSignaturePanel type={target.type} id={target.id} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ReportSignatureDialog
