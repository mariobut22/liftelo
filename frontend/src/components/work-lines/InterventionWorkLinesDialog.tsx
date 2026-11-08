import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import WorkLinesTable from './WorkLinesTable'
import { getInterventionById } from '../../services/api'

interface Props {
  target: { id: number; name?: string | null } | null
  onClose: () => void
}

/** Read-only table of the work / material rows of a saved intervention (rows are locked when the technician signs). */
function InterventionWorkLinesDialog({ target, onClose }: Props) {
  const { t } = useTranslation('workLines')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['intervention-work-lines', target?.id],
    queryFn: () => getInterventionById(target?.id as number),
    enabled: target !== null,
  })

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl p-0" data-testid="intervention-work-lines-dialog">
        <div className="shrink-0 border-b border-zinc-200 px-5 py-4">
          <DialogTitle>{t('view.title')}</DialogTitle>
          <DialogDescription>{target?.name ?? ''}</DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? <p className="text-sm text-zinc-500">…</p> : null}
          {isError ? <p className="text-sm text-rose-600">{t('view.loadFailed')}</p> : null}
          {data ? <WorkLinesTable lines={data.work_lines ?? []} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default InterventionWorkLinesDialog
