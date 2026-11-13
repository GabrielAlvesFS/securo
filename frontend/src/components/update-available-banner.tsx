import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { APP_VERSION } from '@/lib/build-info'
import { useLatestRelease } from '@/hooks/use-latest-release'
import { useAutoUpdateCheck } from '@/hooks/use-auto-update-check'
import { isUpdateAvailable } from '@/lib/semver'
import { cn } from '@/lib/utils'

interface UpdateAvailableBannerProps {
  onOpen: () => void
  /** Render as a single icon, for the collapsed sidebar rail. */
  collapsed?: boolean
}

export function UpdateAvailableBanner({ onOpen, collapsed = false }: UpdateAvailableBannerProps) {
  const { t } = useTranslation()
  const { enabled } = useAutoUpdateCheck()
  const { data } = useLatestRelease()

  if (!enabled) return null
  if (!data) return null
  if (!isUpdateAvailable(APP_VERSION, data.tagName)) return null

  return (
    <div className={cn('pb-1', collapsed ? 'px-2' : 'px-3')}>
      <button
        type="button"
        onClick={onOpen}
        title={t('app.updateAvailableHint', { version: data.tagName })}
        aria-label={t('app.updateAvailable')}
        className={cn(
          'relative flex items-center w-full rounded-lg border border-sidebar-border py-2 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-left',
          collapsed ? 'justify-center px-0' : 'gap-2 px-3',
        )}
      >
        <Download size={14} className="shrink-0 text-sidebar-muted" />
        {!collapsed && (
          <span className="flex-1 truncate">{t('app.updateAvailable')}</span>
        )}
        {/* Collapsed, the dot has no row to sit at the end of, so it rides
            the icon's corner instead of pushing the layout around. */}
        <span
          aria-hidden="true"
          className={cn(
            'h-2 w-2 shrink-0 rounded-full bg-emerald-500',
            collapsed && 'absolute right-1.5 top-1.5',
          )}
        />
      </button>
    </div>
  )
}
