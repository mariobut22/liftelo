import { useEffect, useState } from 'react'

import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import FormActions from '../form/FormActions'
import { useTranslation } from 'react-i18next'

type CreateCompanyModalProps = {
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => Promise<void>
}

function CreateCompanyModal({ open, pending, onOpenChange, onCreate }: CreateCompanyModalProps) {
  const { t } = useTranslation()

  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) {
      setName('')
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            const trimmed = name.trim()
            if (!trimmed || pending) return
            await onCreate(trimmed)
          }}
          className="flex max-h-[85vh] flex-col"
        >
          <div className="shrink-0 border-b border-zinc-200 px-6 py-4">
            <DialogTitle>{t('settings:createCompanyModal.createCompany')}</DialogTitle>
            <DialogDescription>{t('settings:createCompanyModal.createNewCompanyStartTrial')}</DialogDescription>
          </div>

          <div className="space-y-2 px-6 py-5">
            <label className="text-sm font-medium text-zinc-700" htmlFor="new-company-name">
              {t('common:labels.companyName')}
            </label>
            <Input
              id="new-company-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('settings:createCompanyModal.eGLifteloServisD')}
              autoFocus
            />
          </div>

          <div className="px-6 pb-5">
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? t('settings:createCompanyModal.creating') : t('common:actions.create')}
              </Button>
            </FormActions>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateCompanyModal
