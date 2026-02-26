import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ClipboardList, MessageCircle, Trash2, ChevronDown, FolderKanban, Crown } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import {
  apiFetch,
  createProjectSection,
  createProjectTask,
  createProjectTaskComment,
  deleteProjectSection,
  getProjectById,
  toggleProjectTask,
  updateProjectStatus,
} from '../services/api'
import type { ProjectDetail, ProjectDetailUser } from '../types/project-detail'
import useAuthStore from '../store/authStore'
import ProjectEditModal from '../components/projects/ProjectEditModal'
import useUsers from '../hooks/queries/useUsers'

function StatusBadge({ status }: { status: ProjectDetail['status'] | string }) {
  const map: Record<string, string> = {
    active: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    archived: 'bg-zinc-200 text-zinc-600',
  }

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${map[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {String(status).replace('_', ' ').toUpperCase()}
    </span>
  )
}

function getInitials(name?: string | null) {
  if (!name) return '?'
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

type AssignmentPopoverProps = {
  isOpen: boolean
  assigned: ProjectDetailUser[]
  users?: Array<{ id: number; username?: string | null }>
  onOpen: () => void
  onClose: () => void
  onChange: (userId: number, checked: boolean) => void
}

function AssignmentPopover({
  isOpen,
  assigned,
  users,
  onOpen,
  onClose,
  onChange,
}: AssignmentPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const assignedIds = new Set(assigned.map((user) => user.id))

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          if (isOpen) {
            onClose()
          } else {
            onOpen()
          }
        }}
        className="flex items-center -space-x-2"
      >
        {assigned.length === 0 ? (
          <span className="text-xs text-zinc-400">—</span>
        ) : (
          assigned.map((user) => {
            const name = user.full_name ?? user.name ?? user.username
            return (
              <div
                key={user.id}
                title={name}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white bg-zinc-100 text-[10px] font-semibold text-zinc-600 ring-2 ring-white"
              >
                {getInitials(name)}
              </div>
            )
          })
        )}
      </button>
      {isOpen ? (
        <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-zinc-200 bg-white p-3 text-xs shadow-lg">
          <div className="grid gap-2">
            {(users ?? []).map((user) => {
              const isChecked = assignedIds.has(user.id)
              return (
                <label key={user.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => onChange(user.id, event.target.checked)}
                  />
                  <span>{user.username ?? '-'}</span>
                </label>
              )
            })}
          </div>
          <div className="mt-2 text-[11px] text-zinc-400">Klikni avatar za spremanje.</div>
        </div>
      ) : null}
    </div>
  )
}

function ProjectDetailPage() {
  const { id } = useParams()
  const projectId = Number(id)
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const [editOpen, setEditOpen] = useState(false)
  const [openComments, setOpenComments] = useState<Set<number>>(new Set())
  const [newCommentByTask, setNewCommentByTask] = useState<Record<number, string>>({})
  const [newTaskTextBySection, setNewTaskTextBySection] = useState<Record<number, string>>({})
  const [openAssignTaskId, setOpenAssignTaskId] = useState<number | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null)
  const [editingSectionTitle, setEditingSectionTitle] = useState('')
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  const { data: users } = useUsers()

  const {
    data: project,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProjectById(Number(id ?? 0)),
    enabled: Boolean(id) && !Number.isNaN(projectId),
  })


  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-'
    const d = new Date(dateString)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}.${month}.${year}`
  }

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return '-'
    const d = new Date(dateString)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year} ${hours}:${minutes}`
  }

  const statusMutation = useMutation({
    mutationFn: async ({ projectId, status }: { projectId: number; status: string }) =>
      updateProjectStatus(projectId, status),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['project', id] })
      }
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const toggleTaskMutation = useMutation({
    mutationFn: toggleProjectTask,
    onMutate: async (taskId: number) => {
      await queryClient.cancelQueries({ queryKey: ['project', id] })

      const previous = queryClient.getQueryData<ProjectDetail | undefined>(['project', id])

      queryClient.setQueryData<ProjectDetail | undefined>(['project', id], (old) => {
        if (!old) return old
        return {
          ...old,
          sections: old.sections?.map((section) => ({
            ...section,
            tasks: section.tasks?.map((task) =>
              task.id === taskId
                ? { ...task, is_completed: !task.is_completed }
                : task
            ),
          })),
        }
      })

      return { previous }
    },
    onError: (_err, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['project', id], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
    },
  })

  const {
    data: activities,
    isLoading: activityLoading,
  } = useQuery({
    queryKey: ['projectActivity', id],
    queryFn: () =>
      apiFetch<
        Array<{
          id: number
          action: string
          created_at: string
          user?: { name?: string | null; full_name?: string | null; username?: string | null }
          user_name?: string | null
        }>
      >(`/api/projects/${id}/activity`),
    enabled: Boolean(id),
  })

  const createSectionMutation = useMutation({
    mutationFn: async ({ projectId, title }: { projectId: number; title: string }) =>
      createProjectSection(projectId, title),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['project', id] })
      }
    },
    onError: (error) => {
      console.error('[UI] create section error', error)
      window.alert(`Ne mogu dodati sekciju: ${error instanceof Error ? error.message : String(error)}`)
    },
  })

  const updateSectionMutation = useMutation({
    mutationFn: async ({ sectionId, title }: { sectionId: number; title: string }) =>
      apiFetch(`/api/projects/sections/${sectionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      }),
    onMutate: async ({ sectionId, title }) => {
      await queryClient.cancelQueries({ queryKey: ['project', id] })
      const previous = queryClient.getQueryData<ProjectDetail | undefined>(['project', id])
      queryClient.setQueryData<ProjectDetail | undefined>(['project', id], (old) => {
        if (!old) return old
        return {
          ...old,
          sections: old.sections?.map((section) =>
            section.id === sectionId ? { ...section, title } : section
          ),
        }
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['project', id], context.previous)
      }
    },
    onSettled: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['project', id] })
      }
    },
  })

  const createTaskMutation = useMutation({
    mutationFn: async ({ sectionId, description }: { sectionId: number; description: string }) =>
      createProjectTask(sectionId, description),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['project', id] })
      }
    },
    onError: (error) => {
      console.error('[UI] create task error', error)
      window.alert(`Ne mogu dodati zadatak: ${error instanceof Error ? error.message : String(error)}`)
    },
  })

  const deleteSectionMutation = useMutation({
    mutationFn: async (sectionId: number) => deleteProjectSection(sectionId),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['project', id] })
      }
    },
    onError: (error) => {
      console.error('[UI] delete section error', error)
      window.alert(`Ne mogu obrisati sekciju: ${error instanceof Error ? error.message : String(error)}`)
    },
  })

  const assignTaskMutation = useMutation({
    mutationFn: async ({ taskId, userIds }: { taskId: number; userIds: number[] }) =>
      apiFetch(`/api/projects/tasks/${taskId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ user_ids: userIds }),
      }),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['project', id] })
      }
    },
  })

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, description }: { taskId: number; description: string }) =>
      apiFetch(`/api/projects/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ description }),
      }),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['project', id] })
      }
      setEditingTaskId(null)
      setEditingText('')
    },
  })

  const commentMutation = useMutation({
    mutationFn: async ({ taskId, text }: { taskId: number; text: string }) =>
      createProjectTaskComment(taskId, text),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['project', id] })
      }
    },
    onError: (error) => {
      console.error('[UI] create comment error', error)
      window.alert('Greška pri dodavanju komentara')
    },
  })

  const activityLabels: Record<string, string> = {
    status_changed: 'Promijenjen status',
    item_toggled: 'Označen zadatak',
    edited: 'Uređen projekt',
    attachment_added: 'Dodan prilog',
  }

  const sections = useMemo(() => project?.sections ?? [], [project])
  const allTasks = useMemo(
    () => project?.sections?.flatMap((section) => section.tasks ?? []) || [],
    [project]
  )
  const totalTasks = allTasks.length
  const completedTasks = useMemo(
    () => allTasks.filter((task) => task.is_completed).length,
    [allTasks]
  )
  const progressPercent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

  const assignedUsers = useMemo(() => project?.assigned_users ?? [], [project])
  const ownerName = project?.owner?.name || project?.owner?.full_name || project?.owner?.username || '-'
  const openAssignPopover = (taskId: number) => {
    if (!isAdmin) return
    setOpenAssignTaskId(taskId)
  }
  const closeAssignPopover = () => {
    setOpenAssignTaskId(null)
  }
  const handleAssignChange = (taskId: number, assignedIds: number[], userId: number, checked: boolean) => {
    const nextIds = new Set(assignedIds)
    if (checked) {
      nextIds.add(userId)
    } else {
      nextIds.delete(userId)
    }
    const nextIdArray = Array.from(nextIds)
    const mappedUsers: ProjectDetailUser[] = (users ?? [])
      .filter((user) => nextIdArray.includes(user.id))
      .map((user) => ({
        id: user.id,
        full_name: user.full_name ?? null,
        username: user.username ?? undefined,
      }))

    queryClient.setQueryData<ProjectDetail | undefined>(['project', id], (old) => {
      if (!old) return old
      return {
        ...old,
        sections: old.sections?.map((section) => ({
          ...section,
          tasks: section.tasks?.map((task) =>
            task.id === taskId ? { ...task, assigned_users: mappedUsers } : task
          ),
        })),
      }
    })

    assignTaskMutation.mutate({ taskId, userIds: nextIdArray })
    if (id) {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
    }
  }
  const cancelEdit = () => {
    setEditingTaskId(null)
    setEditingText('')
  }
  const saveTask = (taskId: number) => {
    const description = editingText.trim()
    if (!description) return
    updateTaskMutation.mutate({ taskId, description })
  }
  const formatCommentDate = (dateString?: string | null) => {
    if (!dateString) return '-'
    const d = new Date(dateString)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year} ${hours}:${minutes}`
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-64 animate-pulse rounded-md bg-zinc-200/70" />
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={`project-detail-skeleton-${index}`} className="p-6 shadow-sm">
              <div className="h-4 w-32 animate-pulse rounded-md bg-zinc-200/70" />
              <div className="mt-4 h-4 w-40 animate-pulse rounded-md bg-zinc-200/70" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <ClipboardList className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900">Greška</h2>
        <p className="mt-2 text-sm text-zinc-500">
          {error instanceof Error ? error.message : 'Ne možemo učitati projekt trenutno.'}
        </p>
      </Card>
    )
  }

  if (!project) {
    return <div className="p-6 text-sm text-zinc-500">Učitavanje...</div>
  }


  const isOverdue = Boolean(
    project.due_date && project.status !== 'completed' && new Date(project.due_date) < new Date()
  )
  const progressColor =
    progressPercent === 0
      ? 'bg-zinc-200'
      : progressPercent < 50
        ? 'bg-blue-500'
        : progressPercent < 100
          ? 'bg-indigo-600'
          : 'bg-green-600'
  const showStripe = project.status === 'active' && progressPercent > 0 && progressPercent < 100

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Card className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">{project.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-zinc-500">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                    {getInitials(ownerName)}
                    <Crown className="absolute -right-2 -top-2 h-3 w-3 text-amber-500" />
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Odgovorna osoba</div>
                    <div className="text-sm font-semibold text-zinc-900">{ownerName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  <span className={isOverdue ? 'text-red-600 font-semibold' : undefined}>
                    Rok: {formatDate(project.due_date)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  <span className="text-xs text-zinc-400">Kreirano: {formatDate(project.created_at)}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={project.status} />
              {isAdmin ? (
                <select
                  value={project.status}
                  onChange={async (event) => {
                    const nextStatus = event.target.value
                    try {
                      await statusMutation.mutateAsync({ projectId: project.id, status: nextStatus })
                    } catch (err) {
                      console.error(err)
                    }
                  }}
                  className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-sm"
                >
                  <option value="active">ACTIVE</option>
                  <option value="completed">COMPLETED</option>
                  <option value="archived">ARCHIVED</option>
                </select>
              ) : null}
              {isAdmin ? (
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  Uredi projekt
                </Button>
              ) : null}
            </div>
          </div>
          <div className="h-px w-full bg-zinc-200" />
          <div>
            <div className="text-xs text-zinc-500">Tim</div>
            <div className="mt-2 flex items-center">
              {assignedUsers.length === 0 ? (
                <span className="text-sm text-zinc-500">-</span>
              ) : (
                <div className="flex -space-x-2">
                  {assignedUsers
                    .filter((user) => user.id !== project.owner?.id)
                    .slice(0, 5)
                    .map((user) => {
                    const name = user.full_name ?? user.name ?? user.username
                    return (
                      <div
                        key={user.id}
                        title={name}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white bg-zinc-100 text-[10px] font-semibold text-zinc-600 ring-2 ring-white"
                      >
                        {getInitials(name)}
                      </div>
                    )
                  })}
                  {assignedUsers.filter((user) => user.id !== project.owner?.id).length > 5 ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white bg-zinc-200 text-[10px] font-semibold text-zinc-600 ring-2 ring-white">
                      +{assignedUsers.filter((user) => user.id !== project.owner?.id).length - 5}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span className="text-sm font-semibold text-zinc-900">{progressPercent}%</span>
          <span>Napredak</span>
        </div>
        <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full transition-all duration-500 ease-out ${progressColor}`}
            style={{ width: `${progressPercent}%` }}
          />
          {showStripe ? (
            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.35)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.35)_50%,rgba(255,255,255,0.35)_75%,transparent_75%,transparent)] bg-[length:12px_12px] animate-pulse" />
          ) : null}
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          {totalTasks === 0 ? 'Još nema zadataka.' : `${completedTasks} od ${totalTasks} zadataka dovršeno`}
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Sekcije i zadaci</h2>
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={newSectionTitle}
                onChange={(event) => setNewSectionTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    const value = newSectionTitle.trim()
                    if (!value) return
                    createSectionMutation.mutate({ projectId: project.id, title: value })
                    setNewSectionTitle('')
                  }
                  if (event.key === 'Escape') {
                    setNewSectionTitle('')
                  }
                }}
                placeholder="Naziv sekcije..."
                className="h-9 w-48 rounded-lg border-zinc-200 focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const value = newSectionTitle.trim()
                  if (!value) return
                  createSectionMutation.mutate({ projectId: project.id, title: value })
                  setNewSectionTitle('')
                }}
                disabled={createSectionMutation.isPending}
              >
                {createSectionMutation.isPending ? 'Dodavanje...' : '+ Dodaj sekciju'}
              </Button>
            </div>
          ) : null}
        </div>

        {sections.length === 0 ? (
          <Card className="rounded-xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div className="mt-4 text-sm font-semibold text-zinc-900">Projekt još nema sekcija</div>
            <div className="mt-1 text-sm text-zinc-500">Dodaj prvu sekciju kako bi započeo rad.</div>
            {isAdmin ? (
              <Button
                type="button"
                size="sm"
                className="mt-4"
                onClick={() => createSectionMutation.mutate({ projectId: project.id, title: 'Nova sekcija' })}
                disabled={createSectionMutation.isPending}
              >
                + Dodaj prvu sekciju
              </Button>
            ) : null}
          </Card>
        ) : (
          sections.map((section) => (
            <Card
              key={section.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                {editingSectionId === section.id ? (
                  <input
                    type="text"
                    value={editingSectionTitle}
                    onChange={(event) => setEditingSectionTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        const value = editingSectionTitle.trim()
                        if (!value) return
                        updateSectionMutation.mutate({ sectionId: section.id, title: value })
                        setEditingSectionId(null)
                        setEditingSectionTitle('')
                      }
                      if (event.key === 'Escape') {
                        setEditingSectionId(null)
                        setEditingSectionTitle('')
                      }
                    }}
                    autoFocus
                    className="h-8 w-full max-w-xs rounded-md border border-blue-500 px-2 text-base font-semibold text-zinc-900 focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div
                    onDoubleClick={() => {
                      if (!isAdmin) return
                      setEditingSectionId(section.id)
                      setEditingSectionTitle(section.title)
                    }}
                    className={`text-base font-semibold text-zinc-900 ${isAdmin ? 'cursor-pointer' : ''}`}
                  >
                    {section.title}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={createTaskMutation.isPending}
                      onClick={(event) => {
                        event.preventDefault()
                        const value = (newTaskTextBySection[section.id] ?? '').trim()
                        if (!value) return
                        createTaskMutation.mutate({ sectionId: section.id, description: value })
                        setNewTaskTextBySection((prev) => ({ ...prev, [section.id]: '' }))
                      }}
                    >
                      + Dodaj zadatak
                    </Button>
                  ) : null}
                  {isAdmin ? (
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-red-500"
                      aria-label="Obriši sekciju"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        if (!window.confirm('Obrisati sekciju i sve zadatke?')) return
                        deleteSectionMutation.mutate(section.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 space-y-4">
                {(section.tasks ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-500">
                    Nema zadataka.
                  </div>
                ) : (
                  section.tasks?.map((task) => {
                    const assigned = task.assigned_users ?? []
                    const assignedIds = assigned.map((user) => user.id)
                    return (
                      <div key={task.id} className="rounded-lg px-2 py-2 transition-all duration-200 hover:bg-zinc-50">
                        <div className="flex items-start justify-between gap-4">
                          <button
                            type="button"
                            onClick={() => toggleTaskMutation.mutate(task.id)}
                            className="flex flex-1 items-start gap-3 text-left"
                          >
                            <div
                              className={`mt-1 flex h-5 w-5 items-center justify-center rounded border border-zinc-300 transition-all duration-200 ${
                                task.is_completed ? 'bg-blue-600 scale-100' : 'scale-90'
                              }`}
                            >
                              {task.is_completed ? (
                                <div className="h-2 w-2 rounded-sm bg-white" />
                              ) : null}
                            </div>
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editingText}
                                onChange={(event) => setEditingText(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') saveTask(task.id)
                                  if (event.key === 'Escape') cancelEdit()
                                }}
                                autoFocus
                                className="h-8 w-full rounded-md border border-blue-500 px-2 text-sm focus:ring-2 focus:ring-blue-500"
                              />
                            ) : (
                              <div
                                onDoubleClick={() => {
                                  if (!isAdmin) return
                                  setEditingTaskId(task.id)
                                  setEditingText(task.description ?? task.title ?? '')
                                }}
                                className={`text-sm font-medium transition-all duration-200 ${
                                  task.is_completed ? 'line-through text-zinc-400' : 'text-zinc-900'
                                } ${isAdmin ? 'cursor-pointer' : ''}`}
                              >
                                {task.description ?? task.title}
                              </div>
                            )}
                          </button>

                          <div className="flex items-center gap-3">
                            <AssignmentPopover
                              isOpen={openAssignTaskId === task.id && isAdmin}
                              assigned={assigned}
                              users={users}
                              onOpen={() => openAssignPopover(task.id)}
                              onClose={closeAssignPopover}
                              onChange={(userId, checked) =>
                                handleAssignChange(task.id, assignedIds, userId, checked)
                              }
                            />

                            <button
                              type="button"
                              onClick={() => {
                                const next = new Set(openComments)
                                if (next.has(task.id)) {
                                  next.delete(task.id)
                                } else {
                                  next.add(task.id)
                                }
                                setOpenComments(next)
                              }}
                              className="flex items-center gap-1 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-700"
                            >
                              <MessageCircle className="h-4 w-4 text-zinc-400" />
                              {task.comments?.length ?? 0}
                            </button>
                          </div>
                        </div>

                        {openComments.has(task.id) ? (
                          <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                            <div className="space-y-2">
                              {(task.comments ?? []).length === 0 ? (
                                <div className="text-xs text-zinc-500">Nema komentara.</div>
                              ) : (
                                task.comments?.map((comment) => (
                                  <div key={comment.id} className="text-xs text-zinc-600">
                                    <div className="font-semibold text-zinc-700">
                                      {comment.user?.name || comment.user?.full_name || comment.user?.username || '-'}
                                      <span className="ml-2 font-normal text-zinc-400">
                                        {formatCommentDate(comment.created_at)}
                                      </span>
                                    </div>
                                    <p className="text-sm text-zinc-800">{comment.comment}</p>
                                  </div>
                                ))
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="text"
                                value={newCommentByTask[task.id] ?? ''}
                                onChange={(event) =>
                                  setNewCommentByTask((prev) => ({ ...prev, [task.id]: event.target.value }))
                                }
                                onKeyDown={(event) => {
                                  if (event.key !== 'Enter') return
                                  const text = (newCommentByTask[task.id] ?? '').trim()
                                  if (!text) return
                                  commentMutation.mutate({ taskId: task.id, text })
                                  setNewCommentByTask((prev) => ({ ...prev, [task.id]: '' }))
                                }}
                                placeholder="Dodaj komentar..."
                                className="h-8 text-xs"
                              />
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  const text = (newCommentByTask[task.id] ?? '').trim()
                                  if (!text) return
                                  commentMutation.mutate({ taskId: task.id, text })
                                  setNewCommentByTask((prev) => ({ ...prev, [task.id]: '' }))
                                }}
                              >
                                Pošalji
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>

              {isAdmin ? (
                <div className="mt-4 flex items-center gap-2">
                  <Input
                    type="text"
                    value={newTaskTextBySection[section.id] ?? ''}
                    onChange={(event) =>
                      setNewTaskTextBySection((prev) => ({
                        ...prev,
                        [section.id]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setNewTaskTextBySection((prev) => ({ ...prev, [section.id]: '' }))
                        return
                      }
                      if (event.key === 'Enter' && !event.shiftKey) {
                        const value = (newTaskTextBySection[section.id] ?? '').trim()
                        if (!value) return
                        createTaskMutation.mutate({ sectionId: section.id, description: value })
                        setNewTaskTextBySection((prev) => ({ ...prev, [section.id]: '' }))
                      }
                    }}
                    placeholder="Naziv zadatka..."
                    className="h-9 max-w-sm rounded-lg border-zinc-200 focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={createTaskMutation.isPending}
                    onClick={() => {
                      const value = (newTaskTextBySection[section.id] ?? '').trim()
                      if (!value) return
                      createTaskMutation.mutate({ sectionId: section.id, description: value })
                      setNewTaskTextBySection((prev) => ({ ...prev, [section.id]: '' }))
                    }}
                  >
                    +
                  </Button>
                </div>
              ) : null}
            </Card>
          ))
        )}
      </div>

      <Card className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => setActivityOpen((prev) => !prev)}
          className="flex w-full items-center justify-between"
        >
          <span className="text-sm font-semibold text-zinc-900">Aktivnosti</span>
          <span
            className={`transition-transform duration-300 ${activityOpen ? 'rotate-180' : 'rotate-0'}`}
          >
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          </span>
        </button>
        <div
          className={`overflow-hidden transition-all duration-300 ${activityOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}
        >
          <div className="mt-4 space-y-4">
            {activityLoading ? (
              <div className="text-sm text-zinc-500">Učitavanje aktivnosti...</div>
            ) : activities && activities.length > 0 ? (
              activities.map((activity, index) => {
                const isLast = index === activities.length - 1
                const userName =
                  activity.user?.name ||
                  activity.user?.full_name ||
                  activity.user?.username ||
                  activity.user_name ||
                  '-'
                return (
                  <div key={activity.id} className="relative pl-6">
                    <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-zinc-300" />
                    {!isLast ? (
                      <span className="absolute left-[3px] top-4 h-full w-px bg-zinc-200" />
                    ) : null}
                    <div className="text-sm text-zinc-700">{userName}</div>
                    <div className="text-xs text-zinc-500">
                      {activityLabels[activity.action] ?? activity.action} · {formatDateTime(activity.created_at)}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-sm text-zinc-500">Nema aktivnosti.</div>
            )}
          </div>
        </div>
      </Card>

      {isAdmin ? <ProjectEditModal open={editOpen} onOpenChange={setEditOpen} project={project} /> : null}
    </div>
  )
}

export default ProjectDetailPage
