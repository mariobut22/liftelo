import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from './button'

/** "Reset filters" button; renders nothing while no filter is active. */
function ResetFiltersButton({ active, onReset, className }: { active: boolean; onReset: () => void; className?: string }) {
  const { t } = useTranslation()
  if (!active) return null
  return (
    <Button type="button" size="sm" variant="secondary" className={className ?? 'min-h-9 gap-2'} onClick={onReset} data-testid="reset-filters">
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      {t('common:actions.resetFilters')}
    </Button>
  )
}

export default ResetFiltersButton
