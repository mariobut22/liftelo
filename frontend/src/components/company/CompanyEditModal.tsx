import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import FormActions from '../form/FormActions'
import FormGrid from '../form/FormGrid'
import FormLabel from '../form/FormLabel'
import FormSection from '../form/FormSection'
import type { Company } from '../../types/company'
import useAuthStore from '../../store/authStore'
import { updateCompany } from '../../services/api'
import { useTranslation } from 'react-i18next'

type CompanyFormValues = {
  name: string
  address: string
  contact_person: string
  contact_phone: string
  oib: string
  notes: string
}

interface CompanyEditModalProps {
  open: boolean
  company: Company | null
  onOpenChange: (open: boolean) => void
}

function CompanyEditModal({ open, company, onOpenChange }: CompanyEditModalProps) {
  const { t } = useTranslation()

  const isAdmin = useAuthStore((state) => state.isAdmin())
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    reset,
  } = useForm<CompanyFormValues>({
    defaultValues: {
      name: company?.name ?? '',
      address: company?.address ?? '',
      contact_person: company?.contact_person ?? '',
      contact_phone: company?.contact_phone ?? '',
      oib: company?.oib ?? '',
      notes: company?.notes ?? '',
    },
  })

  useEffect(() => {
    if (!open || !company) return
    reset({
      name: company.name ?? '',
      address: company.address ?? '',
      contact_person: company.contact_person ?? '',
      contact_phone: company.contact_phone ?? '',
      oib: company.oib ?? '',
      notes: company.notes ?? '',
    })
  }, [company, open, reset])

  const onSubmit = handleSubmit(async (values) => {
    if (!isAdmin) return

    if (!values.name.trim()) {
      toast.error(t('settings:companyEditModal.companyNameRequired'))
      return
    }

    try {
      await updateCompany({
        name: values.name.trim(),
        address: values.address.trim() || null,
        contact_person: values.contact_person.trim() || null,
        contact_phone: values.contact_phone.trim() || null,
        oib: values.oib.trim() || null,
        notes: values.notes.trim() || null,
      })
      await queryClient.invalidateQueries({ queryKey: ['company'] })
      toast.success(t('settings:companyEditModal.companyDetailsSaved'))
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings:companyEditModal.failedSaveCompany'))
    }
  })

  if (!isAdmin || !company) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <form onSubmit={onSubmit} className="flex max-h-[90vh] flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-6 py-4">
            <DialogTitle>{t('settings:companyEditModal.editCompany')}</DialogTitle>
            <DialogDescription>{t('settings:companyEditModal.updateCompanyDetails')}</DialogDescription>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <FormSection title={t('settings:companyEditModal.basicDetails')}>
              <FormGrid columns={2}>
                <div className="space-y-2">
                  <FormLabel htmlFor="company-name">{t('common:labels.name')}</FormLabel>
                  <Input id="company-name" {...register('name')} />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="company-oib">{t('settings:companyEditModal.companyIdOib')}</FormLabel>
                  <Input id="company-oib" {...register('oib')} />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="company-address">{t('common:labels.address')}</FormLabel>
                  <Input id="company-address" {...register('address')} />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="company-contact">{t('settings:companyEditModal.contactPerson')}</FormLabel>
                  <Input id="company-contact" {...register('contact_person')} />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="company-phone">{t('settings:companyEditModal.contactPhone')}</FormLabel>
                  <Input id="company-phone" {...register('contact_phone')} />
                </div>
              </FormGrid>
            </FormSection>

            <FormSection title={t('common:labels.notes')}>
              <FormLabel htmlFor="company-notes">{t('common:labels.notes')}</FormLabel>
              <textarea
                id="company-notes"
                rows={4}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                {...register('notes')}
              />
            </FormSection>
          </div>

          <div className="px-6 pb-5">
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit">
                {t('common:actions.save')}
              </Button>
            </FormActions>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default CompanyEditModal
