import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import type { Control, UseFormRegister } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import FormActions from '../form/FormActions'
import FormError from '../form/FormError'
import FormGrid from '../form/FormGrid'
import FormLabel from '../form/FormLabel'
import FormSection from '../form/FormSection'
import useUsers from '../../hooks/queries/useUsers'
import { updateProject } from '../../services/api'
import type { ProjectDetail } from '../../types/project-detail'

interface ProjectEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectDetail
}

interface ProjectEditValues {
  name: string
  description: string
  dueDate: string
  ownerUserId: string
  assignedUserIds: string[]
  sections: Array<{
    sectionId?: number
    title: string
    tasks: Array<{ taskId?: number; title: string; isCompleted?: boolean }>
  }>
}

const defaultTask = { title: '' }
const defaultSection = { title: '', tasks: [defaultTask] }

interface SectionEditorProps {
  control: Control<ProjectEditValues>
  register: UseFormRegister<ProjectEditValues>
  sectionIndex: number
  onRemoveSection: (index: number) => void
}

function SectionEditor({ control, register, sectionIndex, onRemoveSection }: SectionEditorProps) {
  const taskFieldName = `sections.${sectionIndex}.tasks` as const
  const { fields: taskFields, append, remove } = useFieldArray({
    control,
    name: taskFieldName,
  })

  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Naziv sekcije"
          {...register(`sections.${sectionIndex}.title` as const)}
          className="flex-1"
        />
        <Button type="button" variant="secondary" onClick={() => onRemoveSection(sectionIndex)}>
          Ukloni sekciju
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {taskFields.map((task, taskIndex) => (
          <div key={task.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="checkbox"
              checked={!!task.isCompleted}
              readOnly
              className="h-4 w-4 rounded border-zinc-300"
            />
            <Input
              placeholder="Naziv zadatka"
              {...register(`sections.${sectionIndex}.tasks.${taskIndex}.title` as const)}
              className={task.isCompleted ? 'line-through text-zinc-400' : undefined}
            />
            <Button type="button" variant="secondary" onClick={() => remove(taskIndex)}>
              Ukloni
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={() => append(defaultTask)}>
          Dodaj zadatak
        </Button>
      </div>
    </div>
  )
}

function ProjectEditModal({ open, onOpenChange, project }: ProjectEditModalProps) {
  const queryClient = useQueryClient()
  const { data: users } = useUsers()

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      description: string | null
      due_date: string | null
      owner_user_id?: number
      assigned_user_ids: number[]
      sections?: Array<{
        id?: number
        title: string
        tasks: Array<{ id?: number; title: string; is_completed?: boolean }>
      }>
    }) => updateProject(project.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Projekt je ažuriran.')
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Neuspješno spremanje projekta.')
    },
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ProjectEditValues>({
    defaultValues: {
      name: '',
      description: '',
      dueDate: '',
      ownerUserId: '',
      assignedUserIds: [],
      sections: [defaultSection],
    },
  })

  const { fields: sectionFields, append: appendSection, remove: removeSection } = useFieldArray({
    control,
    name: 'sections',
  })

  useEffect(() => {
    if (!open) return
    reset({
      name: project.name ?? '',
      description: project.description ?? '',
      dueDate: project.due_date?.slice(0, 10) ?? '',
      ownerUserId: project.owner?.id ? String(project.owner.id) : '',
      assignedUserIds: (project.assigned_users ?? []).map((user) => String(user.id)),
      sections:
        (project.sections ?? []).map((section) => ({
          sectionId: section.id,
          title: section.title,
          tasks: (section.tasks ?? []).map((task) => ({
            taskId: task.id,
            title: task.title,
            isCompleted: task.is_completed,
          })),
        })) || [defaultSection],
    })
  }, [open, project, reset])

  const onSubmit = handleSubmit(async (values) => {
    if (!values.name.trim()) {
      setError('name', { message: 'Naziv je obavezan.' })
      return
    }

    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      due_date: values.dueDate || null,
      owner_user_id: values.ownerUserId ? Number(values.ownerUserId) : undefined,
      assigned_user_ids: values.assignedUserIds.map(Number),
    }

    await updateMutation.mutateAsync(payload)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0">
        <form onSubmit={onSubmit} className="flex max-h-[90vh] flex-col">
          <div className="border-b border-zinc-200 px-6 py-4">
            <DialogTitle>Uredi projekt</DialogTitle>
            <DialogDescription>Izmijenite detalje projekta.</DialogDescription>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <FormSection title="Osnovno" description="Naziv, opis i rok projekta.">
              <FormGrid columns={2}>
                <div className="space-y-2 md:col-span-2">
                  <FormLabel htmlFor="project-edit-name">Naziv projekta</FormLabel>
                  <Input id="project-edit-name" {...register('name')} />
                  <FormError>{errors.name?.message}</FormError>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <FormLabel htmlFor="project-edit-description" optional>
                    Opis
                  </FormLabel>
                  <textarea
                    id="project-edit-description"
                    rows={3}
                    {...register('description')}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="project-edit-due" optional>
                    Rok
                  </FormLabel>
                  <Input id="project-edit-due" type="date" {...register('dueDate')} />
                </div>
              </FormGrid>
            </FormSection>

            <FormSection title="Odgovorna osoba" description="Odaberite vlasnika projekta.">
              <div className="space-y-2">
                <FormLabel htmlFor="project-edit-owner" optional>
                  Vlasnik
                </FormLabel>
                <select
                  id="project-edit-owner"
                  {...register('ownerUserId')}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                >
                  <option value="">Bez vlasnika</option>
                  {(users ?? []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username}
                    </option>
                  ))}
                </select>
              </div>
            </FormSection>

            <FormSection title="Dodijeljeni korisnici" description="Odaberite korisnike.">
              <div className="space-y-2">
                {(users ?? []).length === 0 ? (
                  <div className="text-sm text-zinc-500">Nema korisnika.</div>
                ) : (
                  <div className="grid gap-2">
                    {(users ?? []).map((user) => (
                      <label key={user.id} className="flex items-center gap-2 text-sm text-zinc-700">
                        <input type="checkbox" value={String(user.id)} {...register('assignedUserIds')} />
                        <span>{user.username}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </FormSection>

            <FormSection title="Sekcije i zadaci" description="Uredite sekcije i zadatke.">
              <div className="space-y-4">
                {sectionFields.map((section, sectionIndex) => (
                  <SectionEditor
                    key={section.id}
                    control={control}
                    register={register}
                    sectionIndex={sectionIndex}
                    onRemoveSection={removeSection}
                  />
                ))}

                <FormError>{errors.sections?.message}</FormError>
                <Button type="button" variant="secondary" onClick={() => appendSection(defaultSection)}>
                  Dodaj sekciju
                </Button>
              </div>
            </FormSection>
          </div>

          <div className="border-t border-zinc-200 bg-white px-6 py-4">
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Odustani
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Spremanje...' : 'Spremi promjene'}
              </Button>
            </FormActions>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default ProjectEditModal
