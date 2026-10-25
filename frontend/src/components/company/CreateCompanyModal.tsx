import { useEffect, useState } from 'react'

import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import FormActions from '../form/FormActions'

type CreateCompanyModalProps = {
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => Promise<void>
}

function CreateCompanyModal({ open, pending, onOpenChange, onCreate }: CreateCompanyModalProps) {
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
            <DialogTitle>Create company</DialogTitle>
            <DialogDescription>Kreirajte novu tvrtku i aktivirajte trial workspace.</DialogDescription>
          </div>

          <div className="space-y-2 px-6 py-5">
            <label className="text-sm font-medium text-zinc-700" htmlFor="new-company-name">
              Naziv tvrtke
            </label>
            <Input
              id="new-company-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="npr. Liftelo Servis d.o.o."
              autoFocus
            />
          </div>

          <div className="px-6 pb-5">
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                Odustani
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? 'Kreiram...' : 'Kreiraj'}
              </Button>
            </FormActions>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateCompanyModal
