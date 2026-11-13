import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 768 // md breakpoint in Tailwind

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false,
  )

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches)
    handler(mql)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isMobile
}

const DESKTOP_BREAKPOINT = 1024 // lg breakpoint in Tailwind

/**
 * True at the width where the sidebar stops being an off-canvas drawer.
 *
 * The collapsed rail is a desktop affordance: below `lg` the sidebar is a
 * full-width overlay that the user dismisses, so rendering it as a rail there
 * would hide the labels of a menu that has all the room in the world.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT : false,
  )

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsDesktop(e.matches)
    handler(mql)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isDesktop
}
