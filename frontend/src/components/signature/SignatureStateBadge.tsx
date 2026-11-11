import { useTranslation } from 'react-i18next'

import { Badge } from '../ui/badge'
import type { SignatureState } from '../../lib/reportSignatures'

const STYLES: Record<SignatureState, string> = {
  unsigned: 'bg-zinc-100 text-zinc-600',
  awaiting_client: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-700',
  closed_without_client: 'bg-rose-100 text-rose-700',
}

type Props = { state?: SignatureState | null; className?: string }

/** Badge of a report's derived signature state ("Waiting for client signature", ...). Renders nothing without a state. */
function SignatureStateBadge({ state, className }: Props) {
  const { t } = useTranslation('signature')
  if (!state || !(state in STYLES)) return null
  return (
    <Badge className={`${STYLES[state]} ${className ?? ''}`} data-testid={`signature-badge-${state}`}>
      {t(`state.${state}`)}
    </Badge>
  )
}

export default SignatureStateBadge
