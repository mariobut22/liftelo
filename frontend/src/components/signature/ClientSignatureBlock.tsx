import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '../ui/input'
import SignaturePad, { type SignaturePadHandle } from '../SignaturePad'

export type ClientSignatureValue = {
  /** true = "Client not present - sign later": no client signature, the report is only signed by the technician */
  absent: boolean
  signature: string | null
  name: string
  role: string
}

export type ClientSignatureBlockHandle = {
  read: () => ClientSignatureValue
  clear: () => void
}

type Props = {
  disabled?: boolean
  /** hide the "client not present" choice (used when collecting a late signature) */
  hideAbsent?: boolean
  idPrefix?: string
}

/**
 * Client part of the signing step: drawn signature + the signer's name and role (required), or "client not present - sign later".
 * Kept as one small component so the RMS / intervention dialogs only need to render it and call read().
 */
const ClientSignatureBlock = forwardRef<ClientSignatureBlockHandle, Props>(({ disabled, hideAbsent, idPrefix = 'client' }, ref) => {
  const { t } = useTranslation('signature')
  const { t: tCommon } = useTranslation('common')
  const padRef = useRef<SignaturePadHandle | null>(null)
  const [absent, setAbsent] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')

  useImperativeHandle(ref, () => ({
    read: () => ({
      absent,
      signature: absent ? null : padRef.current?.getPngDataUrl() || null,
      name: name.trim(),
      role: role.trim(),
    }),
    clear: () => {
      padRef.current?.clear()
      setAbsent(false)
      setName('')
      setRole('')
    },
  }))

  return (
    <div className="space-y-3" data-testid="client-signature-block">
      <div className="text-sm font-medium text-zinc-700">{t('block.clientTitle')}</div>
      {hideAbsent ? null : (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={absent}
            disabled={disabled}
            onChange={(event) => setAbsent(event.target.checked)}
            data-testid="client-absent"
          />
          <span>
            <span className="font-medium">{t('block.absent')}</span>
            {absent ? <span className="mt-1 block text-xs text-zinc-500">{t('block.absentHint')}</span> : null}
          </span>
        </label>
      )}
      <div className={absent ? 'hidden' : 'space-y-3'}>
        <SignaturePad ref={padRef} clearLabel={tCommon('actions.clear')} disabled={disabled} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-signer-name`} className="text-sm font-medium text-zinc-700">
              {t('block.nameLabel')}
            </label>
            <Input
              id={`${idPrefix}-signer-name`}
              value={name}
              maxLength={150}
              autoComplete="off"
              placeholder={t('block.namePlaceholder')}
              disabled={disabled}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-signer-role`} className="text-sm font-medium text-zinc-700">
              {t('block.roleLabel')}
            </label>
            <Input
              id={`${idPrefix}-signer-role`}
              value={role}
              maxLength={100}
              autoComplete="off"
              placeholder={t('block.rolePlaceholder')}
              disabled={disabled}
              onChange={(event) => setRole(event.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  )
})

ClientSignatureBlock.displayName = 'ClientSignatureBlock'

export default ClientSignatureBlock
