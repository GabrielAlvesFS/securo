import { useSyncExternalStore, useCallback } from 'react'

const STORAGE_KEY = 'sidebarCollapsed'

const listeners = new Set<() => void>()

function getSnapshot(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function notify() {
  listeners.forEach((cb) => cb())
}

/**
 * Whether the desktop sidebar is collapsed to its icon rail.
 *
 * An external store rather than `useState` for the same reason as
 * `usePrivacyMode`: the preference outlives a remount, and the layout is not
 * the only place that cares — anything that wants to know how wide the
 * sidebar currently is can subscribe without the state being threaded
 * through props.
 *
 * The width itself is *not* derived from this in JS. It lives in the
 * `--sidebar-w` custom property (see `index.css`) so the sidebar, the main
 * column and the transactions bulk bar all animate off one value.
 */
export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => false)

  const toggleCollapsed = useCallback(() => {
    const next = !getSnapshot()
    localStorage.setItem(STORAGE_KEY, String(next))
    notify()
  }, [])

  return { collapsed, toggleCollapsed } as const
}
