import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './ui/dialog'
import { useTranslation } from 'react-i18next'

type CommandItem = {
  id: string
  labelKey: string
  values: Record<string, string | number>
  href: string
}

type CommandSection = {
  titleKey: string
  items: CommandItem[]
}

const sections: CommandSection[] = [
  {
    titleKey: 'common:labels.projects',
    items: [
      { id: 'project-1', labelKey: 'nav:commandPalette.project', values: { name: 'Aurora' }, href: '/dashboard/projects/1' },
      { id: 'project-2', labelKey: 'nav:commandPalette.project', values: { name: 'Helios' }, href: '/dashboard/projects/2' },
    ],
  },
  {
    titleKey: 'common:labels.workOrders',
    items: [
      { id: 'work-order-1', labelKey: 'nav:commandPalette.workOrder', values: { number: 1042 }, href: '/dashboard/work-orders/1042' },
      { id: 'work-order-2', labelKey: 'nav:commandPalette.workOrder', values: { number: 1124 }, href: '/dashboard/work-orders/1124' },
    ],
  },
  {
    titleKey: 'common:labels.locations',
    items: [
      { id: 'location-1', labelKey: 'nav:commandPalette.location', values: { name: 'Zagreb Tower' }, href: '/dashboard/locations' },
      { id: 'location-2', labelKey: 'nav:commandPalette.location', values: { name: 'Arena Center' }, href: '/dashboard/locations' },
    ],
  },
]

function CommandPalette() {
  const { t } = useTranslation()

  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // sample entries (placeholder content of the palette) translated for the active language
  const translatedSections = useMemo(
    () => sections.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, label: t(item.labelKey, item.values) })) })),
    [t]
  )

  const filteredSections = useMemo(() => {
    if (!query.trim()) {
      return translatedSections
    }

    const lowered = query.toLowerCase()

    return translatedSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.label.toLowerCase().includes(lowered)),
      }))
      .filter((section) => section.items.length > 0)
  }, [query, translatedSections])

  const handleSelect = (href: string) => {
    setOpen(false)
    setQuery('')
    navigate(href)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0">
        <div className="flex flex-col max-h-[90vh]">
          <div className="border-b border-zinc-200 px-4 py-3 shrink-0">
            <div className="flex items-center gap-3">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('nav:commandPalette.searchProjectsWorkOrdersLocations')}
                className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
            <DialogTitle className="sr-only">{t('nav:commandPalette.commandPalette')}</DialogTitle>
            <DialogDescription className="sr-only">
              {t('nav:commandPalette.quicklySearchAcrossApplication')}
            </DialogDescription>

            {filteredSections.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">
                {t('common:states.noResults')}
              </div>
            ) : (
              filteredSections.map((section) => (
                <div key={section.titleKey} className="mb-4 last:mb-0">
                  <p className="px-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {t(section.titleKey)}
                  </p>
                  <div className="mt-2 space-y-1">
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item.href)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-700 transition-colors duration-200 hover:bg-zinc-100"
                      >
                        <span>{item.label}</span>
                        <span className="text-xs text-zinc-400">↵</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CommandPalette
