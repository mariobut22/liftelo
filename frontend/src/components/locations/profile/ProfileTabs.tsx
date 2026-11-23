import { useRef } from 'react'
import type { KeyboardEvent } from 'react'

import { cn } from '../../../lib/utils'
import { tabButtonId, tabPanelId, type TabId } from './profileUtils'

type TabDef = { id: TabId; label: string; count?: number }

/** Accessible tab bar (WAI-ARIA tabs pattern: roving tabindex, arrows/Home/End). Scrolls sideways on narrow screens. */
function ProfileTabs({ tabs, active, onChange, label }: { tabs: TabDef[]; active: TabId; onChange: (id: TabId) => void; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    if (next < 0) return
    event.preventDefault()
    onChange(tabs[next].id)
    refs.current[tabs[next].id]?.focus()
  }

  return (
    <div className="-mx-4 overflow-x-auto border-b border-zinc-200 px-4 sm:mx-0 sm:px-0" data-testid="location-tabs">
      <div role="tablist" aria-label={label} className="flex min-w-max justify-between gap-0 sm:justify-start sm:gap-1">
        {tabs.map((tab, index) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[tab.id] = node
              }}
              type="button"
              role="tab"
              id={tabButtonId(tab.id)}
              aria-selected={selected}
              aria-controls={tabPanelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              data-testid={`location-tab-${tab.id}`}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                '-mb-px inline-flex min-h-11 items-center gap-1 whitespace-nowrap border-b-2 px-2 text-[13px] sm:gap-1.5 sm:px-3 sm:text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset',
                selected ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800'
              )}
            >
              {tab.label}
              {typeof tab.count === 'number' ? (
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-600">{tab.count}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default ProfileTabs
