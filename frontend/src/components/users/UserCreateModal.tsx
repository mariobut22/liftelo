import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import FormActions from '../form/FormActions'
import FormGrid from '../form/FormGrid'
import FormLabel from '../form/FormLabel'
import FormSection from '../form/FormSection'
import useAuthStore from '../../store/authStore'
import useCreateUser from '../../hooks/mutations/useCreateUser'

type UserFormValues = {
  email: string
  password: string
  role: string
}

interface UserCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function UserCreateModal({ open, onOpenChange }: UserCreateModalProps) {
  const { t } = useTranslation('users')
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const createUser = useCreateUser()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormValues>({
    defaultValues: {
      email: '',
      password: '',
      role: 'technician',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    if (!isAdmin) return
    if (values.password.length < 6) {
      toast.error(t('modal.toast.passwordTooShort'))
      return
    }
    try {
      await createUser.mutateAsync({
        username: values.email.trim(),
        password: values.password,
        role: values.role,
      })
      toast.success(t('modal.toast.createSuccess'))
      reset()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('modal.toast.createError'))
    }
  })

  if (!isAdmin) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <form onSubmit={onSubmit} className="flex max-h-[90vh] flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-6 py-4">
            <DialogTitle>{t('modal.title')}</DialogTitle>
            <DialogDescription>{t('modal.description')}</DialogDescription>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <FormSection title={t('modal.sectionTitle')}>
              <FormGrid columns={2}>
                <div className="space-y-2">
                  <FormLabel htmlFor="user-email">{t('modal.labels.email')}</FormLabel>
                  <Input id="user-email" type="email" {...register('email', { required: true })} />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="user-password">{t('modal.labels.password')}</FormLabel>
                  <Input id="user-password" type="password" {...register('password', { required: true })} />
                  {errors.password ? <p className="text-xs text-rose-600">{t('modal.errors.passwordRequired')}</p> : null}
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="user-role">{t('modal.labels.role')}</FormLabel>
                  <select
                    id="user-role"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                    {...register('role')}
                  >
                    <option value="admin">{t('modal.roleOptions.admin')}</option>
                    <option value="technician">{t('modal.roleOptions.technician')}</option>
                  </select>
                </div>
              </FormGrid>
            </FormSection>
          </div>

          <FormActions>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('modal.actions.cancel')}
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {t('modal.actions.save')}
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default UserCreateModal
