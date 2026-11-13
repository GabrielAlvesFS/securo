import { useState, useCallback, useEffect, useMemo } from 'react'
import { getAccountName } from '@/lib/account-utils'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDisplayLocale } from '@/hooks/use-display-locale'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { useCollectionFilter } from '@/contexts/collection-filter-context'
import { useWorkspace } from '@/contexts/workspace-context'
import { CollectionSelector } from '@/components/collection-selector'
import { auth as authApi, admin as adminApi } from '@/lib/api'
import { resolveSupportedLang } from '@/lib/i18n'
import { OnboardingTour } from '@/components/onboarding-tour'
import { useTheme } from 'next-themes'
import { accounts as accountsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/build-info'
import { ShellLogo } from '@/components/shell-logo'
import { UpdateAvailableBanner } from '@/components/update-available-banner'
import { UpdateAvailableDialog } from '@/components/update-available-dialog'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import { navItems, visibleNavItems, type NavItem } from '@/lib/nav-items'
import {
  Menu,
  ChevronRight,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Languages,
  KeyRound,
  Check,
  HardDriveDownload,
  Shield,
  ShieldCheck,
  Fingerprint,
} from 'lucide-react'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed'
import { useIsDesktop } from '@/hooks/use-mobile'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChangePasswordDialog } from '@/components/change-password-dialog'
import { BackupDialog } from '@/components/backup-dialog'
import { TwoFactorSetup } from '@/components/two-factor-setup'
import { PasskeyManagementDialog } from '@/components/passkey-management-dialog'
import { CommandPalette } from '@/components/command-palette'
import { useCommandPaletteHotkey } from '@/hooks/use-command-palette-hotkey'
import { GlobalChatPanel } from '@/components/global-chat-panel'
import { useFeatureFlags } from '@/hooks/use-feature-flags'
import { Bot, PanelLeftClose, PanelLeftOpen, Search, Sparkles } from 'lucide-react'
import { setThemeBasedOnSystem } from '@/lib/theme-utils'
import { useLocalAuthEnabled } from '@/hooks/use-local-auth'
import { formatCurrency } from '@/lib/format'

/** Placeholder rows shown while the workspace's module list is in flight. */
function NavSkeleton() {
  return (
    <div className="flex flex-col gap-0.5" aria-hidden>
      {[3, 2, 7].map((count, section) => (
        <div key={section} className={cn('flex flex-col gap-0.5', section > 0 && 'pt-3')}>
          <div className="px-3 pt-1 pb-1">
            <div className="h-2 w-16 rounded bg-sidebar-accent/60 animate-pulse" />
          </div>
          {Array.from({ length: count }).map((_, row) => (
            <div key={row} className="flex items-center gap-3 px-3 py-2">
              <div className="h-4 w-4 rounded bg-sidebar-accent/60 animate-pulse" />
              <div className="h-3 flex-1 max-w-[7rem] rounded bg-sidebar-accent/40 animate-pulse" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Wraps a rail item so the label the collapsed sidebar hides is still
 * reachable. Expanded, it gets out of the way entirely — an always-mounted
 * tooltip on a link whose text is right there is noise.
 */
function RailTooltip({
  label,
  rail,
  children,
}: {
  label: string
  rail: boolean
  children: React.ReactElement
}) {
  if (!rail) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Classes for a label that collapses with the rail.
 *
 * The span stays mounted and animates its width and opacity instead of
 * unmounting: `display: none` does not interpolate, so removing it would pop
 * the text out on frame one while the sidebar is still 300ms from being
 * narrow. Keeping it also keeps the accessible name of whatever wraps it.
 *
 * The horizontal gap rides on the label's own margin rather than a `gap` on
 * the row, because a `gap` survives the label shrinking to zero and pushes
 * the icon off-centre in the rail.
 */
function railLabel(rail: boolean, maxWidth = 'max-w-[12rem]'): string {
  return cn(
    'overflow-hidden whitespace-nowrap transition-[opacity,max-width,margin] duration-300 ease-out motion-reduce:transition-none',
    rail ? 'opacity-0 max-w-0 ml-0' : cn('opacity-100 ml-3', maxWidth),
  )
}

export function AppLayout() {
  const { t } = useTranslation()
  const { user, logout, updateUser } = useAuth()
  const { activeAccountIds } = useCollectionFilter()
  const userCurrency = user?.preferences?.currency_display ?? 'USD'
  const locale = useDisplayLocale()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [accountsExpanded, setAccountsExpanded] = useState(true)
  const [accountsShowAll, setAccountsShowAll] = useState(false)
  const { privacyMode, togglePrivacyMode, mask } = usePrivacyMode()
  const { collapsed, toggleCollapsed } = useSidebarCollapsed()
  const isDesktop = useIsDesktop()
  // Collapsing is a desktop affordance. Below `lg` the sidebar is an
  // off-canvas drawer with the whole screen to itself, so the stored
  // preference is deliberately ignored there rather than turning the drawer
  // into a rail.
  const rail = collapsed && isDesktop
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [twoFactorOpen, setTwoFactorOpen] = useState(false)
  const [passkeysOpen, setPasskeysOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  useCommandPaletteHotkey(setPaletteOpen)
  const { agentsEnabled } = useFeatureFlags()
  const { hasModule, isLoading: workspaceLoading, canWrite } = useWorkspace()
  // The chat is offered only to members who can write. Sending a message
  // reaches a tool set that persists — `propose_create_transaction` and its
  // siblings — so the backend refuses it for a read-only role. Showing the
  // panel anyway would put a raw `403: {"detail":"Read-only role"}` in front
  // of the user, which is what happened before this guard.
  //
  // This costs a viewer the ability to *ask* questions, which is a real use
  // case. Restoring it means making the agent's tools role-aware so a
  // read-only session only exposes the reading ones; then this becomes
  // `agentsEnabled` again.
  const chatAvailable = agentsEnabled && canWrite
  const localAuthEnabled = useLocalAuthEnabled()

  // ⌘J / Ctrl+J toggles the global slide-over chat from anywhere.
  // Distinct from ⌘K (command palette) so users can have both open.
  // Gated on agentsEnabled so the hotkey is a no-op when the feature is
  // off — keeps ⌘J free for browsers/other tools.
  useEffect(() => {
    adminApi.defaultColors().then(({ light, dark }) => {
      setThemeBasedOnSystem(light, dark, resolvedTheme)
    }).catch(() => {})
    
    if (!chatAvailable) return
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault()
        setChatOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [chatAvailable, resolvedTheme])
  // ⌘B / Ctrl+B collapses and expands the sidebar, the shortcut every
  // editor with a side panel uses. Unlike ⌘J this is not feature-gated:
  // the sidebar is always there.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        toggleCollapsed()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toggleCollapsed])

  // The "Agents" management page used to live in the sidebar, but it's
  // a configuration surface (KB upload, providers, default selection),
  // not a daily destination. Moved to the user menu (Change password,
  // 2FA, Backups, AI agents).
  const finalNavItems: NavItem[] = useMemo(
    () => visibleNavItems(navItems, hasModule),
    [hasModule],
  )
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform)

  const showTour =
    user &&
    !user.preferences?.onboarding_completed &&
    !localStorage.getItem('onboarding_completed')

  const handleTourComplete = useCallback(async () => {
    localStorage.setItem('onboarding_completed', 'true')
    try {
      const prefs = {
        ...(user?.preferences || {}),
        onboarding_completed: true,
      }
      const updated = await authApi.updateMe({ preferences: prefs })
      updateUser(updated)
    } catch {
      // localStorage fallback is already set
    }
  }, [user, updateUser])

  const userInitial = user?.email?.charAt(0).toUpperCase() ?? '?'
  const resolvedThemeLocal = theme === 'system' ? undefined : theme
  const isDark = resolvedThemeLocal
    ? resolvedThemeLocal === 'dark'
    : typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')

  const { data: accountsList } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list(),
  })

  const allAccounts = accountsList ?? []
  // When a collection is active, the sidebar list + total reflect only its
  // accounts (issue #105). null = all accounts.
  const visibleAccounts = activeAccountIds
    ? allAccounts.filter((a) => activeAccountIds.includes(a.id))
    : allAccounts
  const totalBalance = visibleAccounts.reduce((sum, a) => {
    return sum + Number(a.balance_primary ?? a.current_balance)
  }, 0)
  const versionA11yLabel = t('app.versionAriaLabel', { version: APP_VERSION })

  // Privacy / chat / theme / collapse. A row in the header when the sidebar
  // is open, a column under the logo in the rail, where they would not fit
  // side by side. One definition so the two states cannot drift apart.
  const toggleSidebarLabel = rail
    ? t('nav.expandSidebar')
    : t('nav.collapseSidebar')
  const sidebarActions = (
    <>
      <button
        onClick={togglePrivacyMode}
        className="text-sidebar-muted hover:text-sidebar-foreground transition-colors p-1 rounded-md hover:bg-sidebar-accent"
        title={privacyMode ? t('privacy.show') : t('privacy.hide')}
        aria-label={privacyMode ? t('privacy.show') : t('privacy.hide')}
      >
        {privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
      {/* AI chat — same trigger as the mobile bar, ⌘J also works. Lives in
          the sidebar so the entry point is visible even on first load (no
          floating button). */}
      {chatAvailable && (
        <button
          onClick={() => setChatOpen(true)}
          className="text-sidebar-muted hover:text-sidebar-foreground transition-colors p-1 rounded-md hover:bg-sidebar-accent"
          title={`${t('agents.globalChat.title', 'Chat')} (${isMac ? '⌘J' : 'Ctrl+J'})`}
          aria-label={t('agents.globalChat.openHint', 'Open chat (⌘J)')}
        >
          <Bot size={16} />
        </button>
      )}
      <button
        onClick={toggleTheme}
        className="text-sidebar-muted hover:text-sidebar-foreground transition-colors p-1 rounded-md hover:bg-sidebar-accent"
        title={isDark ? t('settings.themeLight') : t('settings.themeDark')}
        aria-label={isDark ? t('settings.themeLight') : t('settings.themeDark')}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      {/* Collapse sits with the other sidebar controls rather than on a
          handle hanging off the border: same size, same hit area, same
          place the eye already goes for privacy and theme. Desktop only —
          below `lg` the sidebar is a drawer that closes by tapping away. */}
      <button
        onClick={toggleCollapsed}
        aria-expanded={!rail}
        aria-controls="app-sidebar"
        className="hidden lg:block text-sidebar-muted hover:text-sidebar-foreground transition-colors p-1 rounded-md hover:bg-sidebar-accent"
        title={`${toggleSidebarLabel} (${isMac ? '⌘B' : 'Ctrl+B'})`}
        aria-label={toggleSidebarLabel}
      >
        {rail ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
    </>
  )

  return (
    <div
      className="min-h-screen bg-background"
      data-sidebar-collapsed={String(collapsed)}
    >
      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-sidebar border-b border-sidebar-border px-4 lg:hidden">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-sidebar-muted hover:text-sidebar-foreground transition-colors"
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>
        <Link
          to="/"
          className="flex items-center gap-2 -mx-1 px-1 py-1 rounded-md hover:bg-sidebar-accent transition-colors"
          aria-label={t('app.name')}
          title={t('nav.dashboard')}
        >
          <ShellLogo size={22} className="text-primary shrink-0" />
          <span className="font-bold text-sidebar-foreground">
            {t('app.name')}
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setPaletteOpen(true)}
            className="text-sidebar-muted hover:text-sidebar-foreground transition-colors p-1"
            title={t('cmdk.triggerAria')}
            aria-label={t('cmdk.triggerAria')}
          >
            <Search size={18} />
          </button>
          <button
            onClick={togglePrivacyMode}
            className="text-sidebar-muted hover:text-sidebar-foreground transition-colors p-1"
            title={privacyMode ? t('privacy.show') : t('privacy.hide')}
          >
            {privacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <button
            onClick={toggleTheme}
            className="text-sidebar-muted hover:text-sidebar-foreground transition-colors p-1"
            title={isDark ? t('settings.themeLight') : t('settings.themeDark')}
            aria-label={
              isDark ? t('settings.themeLight') : t('settings.themeDark')
            }
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {/* AI chat — opens the global slide-over (also reachable via
              ⌘J). Sits next to the theme toggle so the icon is always
              within thumb reach on mobile too. */}
          {chatAvailable && (
            <button
              onClick={() => setChatOpen(true)}
              className="text-sidebar-muted hover:text-sidebar-foreground transition-colors p-1"
              title={`${t('agents.globalChat.title', 'Chat')} (${isMac ? '⌘J' : 'Ctrl+J'})`}
              aria-label={t('agents.globalChat.openHint', 'Open chat (⌘J)')}
            >
              <Bot size={18} />
            </button>
          )}
          <UserMenu
            userInitial={userInitial}
            logout={logout}
            onChangePassword={() => setChangePasswordOpen(true)}
            onTwoFactor={() => setTwoFactorOpen(true)}
            onPasskeys={() => setPasskeysOpen(true)}
            localAuthEnabled={localAuthEnabled}
            agentsEnabled={agentsEnabled}
            onBackup={() => setBackupOpen(true)}
            dark
            isAdmin={user?.is_superuser}
          />
        </div>
      </header>

      <div className="flex">
        {/* Sidebar overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          id="app-sidebar"
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-[var(--sidebar-w)] bg-sidebar border-r border-sidebar-border flex flex-col transform',
            // Width for the desktop rail, transform for the mobile drawer —
            // the same 300ms curve drives both, so the sidebar moves the
            // same way whichever one the viewport is using.
            'transition-[width,transform] duration-300 ease-out motion-reduce:transition-none',
            'lg:translate-x-0 shrink-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {/* Logo — clickable link to the dashboard. Replaces the
              dedicated 'Painel' nav item so the sidebar stays focused
              on the main destinations. */}
          <div
            className={cn(
              'flex h-16 min-h-16 items-center border-b border-sidebar-border shrink-0',
              rail ? 'justify-center px-2' : 'justify-between px-4',
            )}
          >
            <Link
              to="/"
              className="flex items-center -mx-1 px-1 py-1 rounded-md hover:bg-sidebar-accent transition-colors"
              onClick={() => setSidebarOpen(false)}
              aria-label={t('app.name')}
              title={t('nav.dashboard')}
            >
              <ShellLogo size={24} className="text-primary shrink-0" />
              <span
                className={cn(
                  'font-bold text-lg text-sidebar-foreground tracking-tight',
                  railLabel(rail, 'max-w-[8rem]'),
                )}
              >
                {t('app.name')}
              </span>
            </Link>
            {!rail && <div className="flex items-center gap-0.5">{sidebarActions}</div>}
          </div>

          {rail && (
            <div className="flex flex-col items-center gap-0.5 pt-2">
              {sidebarActions}
            </div>
          )}

          {/* Command palette trigger */}
          <div className={cn('pt-3', rail ? 'px-2' : 'px-3')}>
            <RailTooltip
              rail={rail}
              label={`${t('cmdk.triggerLabel')} (${isMac ? '⌘' : 'Ctrl'} K)`}
            >
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className={cn(
                  'group flex w-full items-center rounded-lg border border-sidebar-border/80 bg-sidebar-accent/40 py-2',
                  'text-[12.5px] text-sidebar-muted transition-all',
                  'hover:bg-sidebar-accent hover:text-sidebar-foreground hover:border-sidebar-border',
                  rail ? 'justify-center px-0' : 'px-3',
                )}
                aria-label={t('cmdk.triggerAria')}
              >
                <Search size={13} className="shrink-0" />
                <span className={cn('flex-1 text-left', railLabel(rail))}>
                  {t('cmdk.triggerLabel')}
                </span>
                <kbd
                  className={cn(
                    'h-[17px] items-center rounded border border-sidebar-border bg-sidebar px-1 font-mono text-[9.5px] font-semibold text-sidebar-muted/80',
                    rail ? 'hidden' : 'hidden lg:inline-flex',
                  )}
                >
                  {isMac ? '⌘' : 'Ctrl'}&nbsp;K
                </kbd>
              </button>
            </RailTooltip>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Nav */}
          <nav
            className={cn('flex flex-col gap-0.5 pt-1 pb-3', rail ? 'px-2' : 'px-3')}
            data-tour="sidebar"
          >
            {/* Which modules this workspace shows is resolved server-side,
                so until the workspace list lands there is no honest answer
                — a placeholder beats both an empty sidebar and a guess. */}
            {workspaceLoading && <NavSkeleton />}
            {!workspaceLoading && finalNavItems.map((item, idx) => {
              if (item.type === 'separator') {
                // The first separator sits right below the search bar
                // — without trimming the top padding it leaves a wide
                // gap that makes the section header feel disconnected
                // from the search trigger.
                const isFirstSep = idx === 0
                // The rail has no room for a section name, so the grouping
                // survives as a rule rather than disappearing entirely.
                if (rail) {
                  return (
                    <div
                      key={`sep-${idx}`}
                      className={cn('mx-2 h-px bg-sidebar-border', isFirstSep ? 'my-1' : 'mt-3 mb-1')}
                    />
                  )
                }
                return (
                  <div key={`sep-${idx}`} className={cn(isFirstSep ? 'pt-1 pb-1 px-3' : 'pt-3 pb-1 px-3')}>
                    <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-sidebar-muted/50">
                      {t(item.labelKey)}
                    </span>
                  </div>
                )
              }

              const isActive =
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path)
              const Icon = item.icon
              const label = t(`nav.${item.key}`)
              return (
                <RailTooltip key={item.key} rail={rail} label={label}>
                  <Link
                    to={item.path}
                    data-tour={`nav-${item.key}`}
                    aria-label={label}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center text-[13px] font-medium transition-all rounded-lg py-2',
                      rail ? 'justify-center px-0' : 'px-3',
                      isActive
                        ? rail
                          // The 3px rule that marks the active item reads as
                          // an off-centre icon once the label is gone; the
                          // tinted background carries it on its own.
                          ? 'bg-primary/[0.08] text-primary'
                          : 'bg-primary/[0.08] text-primary border-l-[3px] border-primary pl-[9px]'
                        : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    )}
                  >
                    <Icon
                      size={17}
                      className={cn(
                        'shrink-0',
                        isActive ? 'text-primary' : 'text-sidebar-muted',
                      )}
                    />
                    <span className={railLabel(rail)}>{label}</span>
                  </Link>
                </RailTooltip>
              )
            })}
          </nav>

          {/* Account list in sidebar */}
          {allAccounts.length > 0 && !rail && (
            <div className="px-3 pb-2 mt-2">
              <button
                onClick={() => setAccountsExpanded(!accountsExpanded)}
                className="flex items-center justify-between w-full px-3 py-2 hover:text-sidebar-foreground transition-colors"
              >
                <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-sidebar-muted">
                  {t('accounts.title')}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`tabular-nums font-medium text-xs ${totalBalance < 0 ? 'text-rose-400' : 'text-sidebar-muted'}`}
                  >
                    {mask(formatCurrency(totalBalance, userCurrency, locale))}
                  </span>
                  <ChevronRight
                    size={12}
                    className={cn(
                      'text-sidebar-muted transition-transform',
                      accountsExpanded && 'rotate-90',
                    )}
                  />
                </div>
              </button>
              {accountsExpanded && (
                <div className="mt-1 space-y-0.5">
                  {[...visibleAccounts].sort((a, b) => Math.abs(Number(b.current_balance)) - Math.abs(Number(a.current_balance))).slice(0, accountsShowAll ? visibleAccounts.length : 3).map((acc) => {
                    const balance = Number(acc.current_balance) || 0
                    const typeKey = acc.type.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()).replace(/^./, c => c.toUpperCase())

                    return (
                      <Link
                        key={acc.id}
                        to={`/accounts/${acc.id}`}
                        onClick={() => setSidebarOpen(false)}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
                      >
                        <div className="truncate min-w-0">
                          <span className="block truncate font-medium">{getAccountName(acc)}</span>
                          <span className="block text-[10px] text-sidebar-muted/60">
                            {t(`accounts.type${typeKey}`)}
                          </span>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span className={`block tabular-nums font-medium text-xs ${balance < 0 ? 'text-rose-400' : 'text-sidebar-foreground'}`}>
                            {mask(formatCurrency(balance, acc.currency, locale))}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                  {visibleAccounts.length > 3 && (
                    <button
                      onClick={() => setAccountsShowAll(!accountsShowAll)}
                      className="w-full px-3 py-1.5 text-[11px] font-medium text-sidebar-muted/70 hover:text-sidebar-foreground transition-colors text-center"
                    >
                      {accountsShowAll
                        ? t('common.showLess', { defaultValue: 'Show less' })
                        : t('common.showMore', {
                            count: visibleAccounts.length - 3,
                            defaultValue: `+${visibleAccounts.length - 3} more`,
                          })}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          </div>

          <UpdateAvailableBanner
            collapsed={rail}
            onOpen={() => setUpdateDialogOpen(true)}
          />

          {/* Merged account + workspace menu — one trigger at the
              bottom of the sidebar shows the active workspace as the
              primary identity, the user email + role as the secondary
              line, and combines workspace switching with all the
              account actions that used to live in a separate dropdown. */}
          <div className={cn('pt-1', rail ? 'px-2' : 'px-3')}>
            <WorkspaceSwitcher
              collapsed={rail}
              onChangePassword={() => setChangePasswordOpen(true)}
              onTwoFactor={() => setTwoFactorOpen(true)}
              onPasskeys={() => setPasskeysOpen(true)}
              localAuthEnabled={localAuthEnabled}
              onBackup={() => setBackupOpen(true)}
              onUpdateAvailable={() => setUpdateDialogOpen(true)}
              agentsEnabled={agentsEnabled}
            />
          </div>

          {!rail && (
            <div className="px-3 pb-3 pt-1">
              <div
                className="text-[11px] leading-4 text-sidebar-muted/70 text-center"
                role="note"
              >
                <span className="sr-only">{versionA11yLabel}</span>
                <span aria-hidden="true" className="block break-all line-clamp-2">
                  {t('app.versionLabel', { version: APP_VERSION })}
                </span>
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 min-h-screen overflow-x-hidden lg:ml-[var(--sidebar-w)] transition-[margin] duration-300 ease-out motion-reduce:transition-none">
          <div className="p-6 max-w-7xl mx-auto">
            {/* Active-collection filter (issue #105): sticky bar above the
                content so the scope is visible right where the data is. */}
            <CollectionSelector variant="header" />
            <Outlet />
          </div>
        </main>
      </div>

      {showTour && <OnboardingTour onComplete={handleTourComplete} />}
      {localAuthEnabled && (
        <>
          <ChangePasswordDialog
            open={changePasswordOpen}
            onClose={() => setChangePasswordOpen(false)}
          />
          <TwoFactorSetup
            open={twoFactorOpen}
            onClose={() => setTwoFactorOpen(false)}
          />
          <PasskeyManagementDialog
            open={passkeysOpen}
            onClose={() => setPasskeysOpen(false)}
          />
        </>
      )}
      <BackupDialog open={backupOpen} onClose={() => setBackupOpen(false)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      {/* Slide-over global chat — opened from the sidebar pill or via
          ⌘J. The previous floating bottom-right button was removed
          since the entry point now lives in the sidebar next to ⌘K. */}
      {chatAvailable && <GlobalChatPanel open={chatOpen} onOpenChange={setChatOpen} />}
      <UpdateAvailableDialog
        open={updateDialogOpen}
        onClose={() => setUpdateDialogOpen(false)}
      />
    </div>
  )
}

function UserMenu({
  userInitial,
  logout,
  onChangePassword,
  onTwoFactor,
  onPasskeys,
  localAuthEnabled,
  onBackup,
  dark,
  isAdmin,
  agentsEnabled,
}: {
  userInitial: string
  logout: () => void
  onChangePassword: () => void
  onTwoFactor: () => void
  onPasskeys: () => void
  localAuthEnabled: boolean
  onBackup: () => void
  dark?: boolean
  isAdmin?: boolean
  agentsEnabled?: boolean
}) {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const currentLang = resolveSupportedLang(i18n.resolvedLanguage ?? i18n.language)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0" aria-label={t('common.userMenu')}>
          <Avatar className="h-8 w-8">
            <AvatarFallback
              className={
                dark
                  ? 'bg-primary/20 text-primary text-xs font-semibold'
                  : 'bg-primary/10 text-primary text-xs font-semibold'
              }
            >
              {userInitial}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isAdmin && (
          <>
            <DropdownMenuItem
              onClick={() => nav('/admin')}
              className="flex items-center gap-2"
            >
              <Shield size={14} />
              {t('nav.groupAdmin')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {localAuthEnabled && (
          <>
            <DropdownMenuItem
              onClick={onChangePassword}
              className="flex items-center gap-2"
            >
              <KeyRound size={14} />
              {t('auth.changePassword')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onTwoFactor}
              className="flex items-center gap-2"
            >
              <ShieldCheck size={14} />
              {t('auth.twoFactorTitle')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onPasskeys}
              className="flex items-center gap-2"
            >
              <Fingerprint size={14} />
              {t('auth.passkeysTitle')}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem
          onClick={onBackup}
          className="flex items-center gap-2"
        >
          <HardDriveDownload size={14} />
          {t('backup.button')}
        </DropdownMenuItem>
        {agentsEnabled && (
          <DropdownMenuItem
            onClick={() => nav('/agents')}
            className="flex items-center gap-2"
          >
            <Sparkles size={14} />
            {t('nav.aiAgents')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center gap-2">
            <Languages size={14} />
            <span className="flex-1">{t('setup.language')}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {currentLang.split('-')[0]}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuLabel className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                {t('setup.language')}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('ru')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Русский</span>
                {currentLang === 'ru' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('de')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Deutsch</span>
                {currentLang === 'de' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('uk')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Українська</span>
                {currentLang === 'uk' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('pt-BR')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Português (BR)</span>
                {currentLang === 'pt-BR' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('pt-PT')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Português (PT)</span>
                {currentLang === 'pt-PT' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('en')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">English</span>
                {currentLang === 'en' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('es')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Español</span>
                {currentLang === 'es' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('hi')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">हिन्दी</span>
                {currentLang === 'hi' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('pl')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Polski</span>
                {currentLang === 'pl' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('it')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Italiano</span>
                {currentLang === 'it' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('fr')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Français</span>
                {currentLang === 'fr' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('nl')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Nederlands</span>
                {currentLang === 'nl' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('sk')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Slovenčina</span>
                {currentLang === 'sk' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('el')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Ελληνικά</span>
                {currentLang === 'el' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage('ja')}
                className="flex items-center gap-2"
              >
                <span className="flex-1">日本語</span>
                {currentLang === 'ja' && (
                  <Check size={13} className="text-primary" />
                )}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          className="text-rose-600 focus:text-rose-600"
        >
          {t('auth.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
