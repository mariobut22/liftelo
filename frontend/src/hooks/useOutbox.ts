import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import useAuthStore from '../store/authStore'
import { belongsTo, type OutboxItem } from '../lib/offline/outboxCore'
import { currentOwner } from '../lib/offline/enqueue'
import { prefetchOfflineData } from '../lib/offline/offlineData'
import { getSenderState, onItemSent, runOutbox, subscribeSenderState } from '../lib/offline/outboxSender'
import { listOutbox, outboxAvailable, subscribeOutbox } from '../lib/offline/outboxStore'

const subscribeOnline = (callback: () => void) => {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/** navigator.onLine, reactive. (false is reliable; true can still mean "no signal", which the sender handles by failing and retrying.) */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

export function useSenderState() {
  return useSyncExternalStore(subscribeSenderState, getSenderState, () => 'idle' as const)
}

/** The waiting items of the signed-in account (+ how many belong to another account on this device). */
export function useOutbox() {
  const user = useAuthStore((state) => state.user)
  const [all, setAll] = useState<OutboxItem[]>([])
  const reload = useCallback(async () => {
    if (!outboxAvailable()) return
    setAll(await listOutbox())
  }, [])

  useEffect(() => {
    // the first read must not run synchronously inside the effect body (react-hooks/set-state-in-effect)
    const first = window.setTimeout(() => void reload(), 0)
    const unsubscribe = subscribeOutbox(() => void reload())
    return () => {
      window.clearTimeout(first)
      unsubscribe()
    }
  }, [reload])

  return useMemo(() => {
    const owner = user ? { userId: user.id, companyId: user.company_id ?? null } : null
    const mine = all.filter((item) => belongsTo(item, owner))
    return {
      items: mine,
      count: mine.length,
      needsAttention: mine.filter((item) => item.status === 'needs_attention').length,
      otherAccountCount: all.length - mine.length,
      all,
      reload,
    }
  }, [all, user, reload])
}

const POLL_MS = 15_000

/**
 * Mounted once in AppLayout (signed-in area). Triggers the sender: on start / account change, `online`, tab visible,
 * and every 15 s while items exist. Also refreshes the offline read cache and invalidates the lists after a send.
 */
export function useOutboxRunner() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const userId = user?.id ?? null
  const companyId = user?.company_id ?? null

  useEffect(() => {
    return onItemSent((item) => {
      void queryClient.invalidateQueries()
      toast.success(t('offline:toast.sent', { label: item.label }))
    })
  }, [queryClient, t])

  useEffect(() => {
    if (userId == null || !outboxAvailable()) return
    const kick = (force: boolean) => {
      const owner = currentOwner()
      if (!owner || navigator.onLine === false) return
      void runOutbox(owner, { force })
      void prefetchOfflineData()
    }
    kick(true)
    const onOnline = () => kick(true)
    const onVisible = () => {
      if (document.visibilityState === 'visible') kick(true)
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(async () => {
      if (navigator.onLine === false) return
      const mine = (await listOutbox()).filter((item) => belongsTo(item, currentOwner()))
      if (mine.some((item) => item.status === 'pending')) kick(false)
    }, POLL_MS)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [userId, companyId])
}
