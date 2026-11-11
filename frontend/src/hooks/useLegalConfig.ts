import { useEffect, useState } from 'react'

import { getLegalConfig } from '../services/api'

// Looked up once per page load. Only a successful answer is cached; a failed lookup counts as "disabled" (nobody is ever
// locked out by it) but is retried the next time a page asks.
let cached: boolean | null = null
let inflight: Promise<boolean> | null = null

function loadAcceptanceEnabled(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached)
  if (!inflight) {
    inflight = getLegalConfig()
      .then((config) => {
        cached = config.acceptance_enabled === true
        return cached
      })
      .catch(() => false)
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/**
 * Is the mandatory Terms/Privacy acceptance switched on on the server (env LEGAL_ACCEPTANCE_ENABLED)?
 * `ready` is false only during the first (short) lookup. Used by the public pages: register, accept invite, set password.
 */
export function useLegalAcceptanceEnabled(): { enabled: boolean; ready: boolean } {
  const [state, setState] = useState<{ enabled: boolean; ready: boolean }>({ enabled: cached === true, ready: cached !== null })

  useEffect(() => {
    if (cached !== null) return undefined
    let active = true
    void loadAcceptanceEnabled().then((enabled) => {
      if (active) setState({ enabled, ready: true })
    })
    return () => {
      active = false
    }
  }, [])

  return state
}
