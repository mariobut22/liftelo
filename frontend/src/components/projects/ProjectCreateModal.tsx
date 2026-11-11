import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { createProject } from '../../services/api'
import { useTranslation } from 'react-i18next'

interface ProjectCreateModalProps {
  open: boolean
  onClose: () => void
}

function ProjectCreateModal({ open, onClose }: ProjectCreateModalProps) {
  const { t } = useTranslation()

  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      onClose()
    },
  })

  if (!open) return null

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) return
    createProjectMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      due_date: dueDate || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">{t('projects:projectCreateModal.newProject')}</h2>
        <p className="mt-1 text-sm text-zinc-500">{t('projects:projectCreateModal.enterBasicProjectDetails')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700" htmlFor="project-name">
              {t('common:labels.projectName')}
            </label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('projects:projectCreateModal.enterName')}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700" htmlFor="project-description">
              {t('projects:projectCreateModal.descriptionOptional')}
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('projects:projectCreateModal.shortProjectDescription')}
              rows={3}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700" htmlFor="project-due-date">
              {t('projects:projectCreateModal.dueDateOptional')}
            </label>
            <Input
              id="project-due-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={createProjectMutation.isPending}>
              {createProjectMutation.isPending ? t('common:states.saving') : t('projects:projectCreateModal.saveProject')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProjectCreateModal
