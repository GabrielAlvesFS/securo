import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed'

beforeEach(() => {
  localStorage.clear()
})

describe('useSidebarCollapsed', () => {
  it('starts expanded', () => {
    const { result } = renderHook(() => useSidebarCollapsed())

    expect(result.current.collapsed).toBe(false)
  })

  it('reads an already-persisted preference on mount', () => {
    localStorage.setItem('sidebarCollapsed', 'true')

    const { result } = renderHook(() => useSidebarCollapsed())

    expect(result.current.collapsed).toBe(true)
  })

  it('treats any other stored value as expanded', () => {
    localStorage.setItem('sidebarCollapsed', 'yes')

    const { result } = renderHook(() => useSidebarCollapsed())

    expect(result.current.collapsed).toBe(false)
  })

  it('toggles and persists', () => {
    const { result } = renderHook(() => useSidebarCollapsed())

    act(() => result.current.toggleCollapsed())

    expect(result.current.collapsed).toBe(true)
    expect(localStorage.getItem('sidebarCollapsed')).toBe('true')

    act(() => result.current.toggleCollapsed())

    expect(result.current.collapsed).toBe(false)
    expect(localStorage.getItem('sidebarCollapsed')).toBe('false')
  })

  it('survives a remount, which is the whole point of persisting it', () => {
    const first = renderHook(() => useSidebarCollapsed())
    act(() => first.result.current.toggleCollapsed())
    first.unmount()

    const second = renderHook(() => useSidebarCollapsed())

    expect(second.result.current.collapsed).toBe(true)
  })

  it('keeps every subscriber in step', () => {
    // The layout is not the only reader: anything sizing itself against the
    // sidebar subscribes too, and they must not disagree about its width.
    const first = renderHook(() => useSidebarCollapsed())
    const second = renderHook(() => useSidebarCollapsed())

    act(() => first.result.current.toggleCollapsed())

    expect(first.result.current.collapsed).toBe(true)
    expect(second.result.current.collapsed).toBe(true)
  })
})
