'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

export type NavBadge = { count?: number; dot?: boolean }

export type NavItem = {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
  onClick?: () => void
  badge?: NavBadge
}

type BottomNavProps = {
  items: NavItem[]
  activeKey: string
  onSelect?: (key: string) => void
  ariaLabel?: string
}

export function BottomNav({ items, activeKey, onSelect, ariaLabel = 'Navigation' }: BottomNavProps) {
  const cols = items.length || 1

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-white/90 via-white/70 to-blue-50/60 dark:from-slate-950/85 dark:via-slate-900/80 dark:to-slate-900/70 backdrop-blur-2xl border-t border-blue-100/60 dark:border-blue-900/40 shadow-[0_-12px_30px_rgba(30,64,175,0.18)] pb-[max(env(safe-area-inset-bottom),12px)] md:hidden"
      aria-label={ariaLabel}
    >
      <div
        className="grid max-w-xl mx-auto"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
        role="tablist"
      >
        {items.map((item) => (
          <NavButton key={item.key} item={item} active={item.key === activeKey} onSelect={onSelect} />
        ))}
      </div>
    </nav>
  )
}

type NavButtonProps = {
  item: NavItem
  active: boolean
  onSelect?: (key: string) => void
}

function NavButton({ item, active, onSelect }: NavButtonProps) {
  const Icon = item.icon
  const content = (
    <div
      role="tab"
      aria-current={active ? 'page' : undefined}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-center gap-1 px-2 py-2 text-xs font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded-2xl',
        active
          ? 'text-blue-700 dark:text-blue-300 bg-white/70 dark:bg-slate-900/60 shadow-[0_6px_16px_rgba(30,64,175,0.18)]'
          : 'text-slate-600 dark:text-slate-300'
      )}
      onClick={() => onSelect?.(item.key)}
    >
      <span className="relative inline-flex items-center justify-center">
        <Icon className={cn('h-5 w-5 transition-transform duration-150', active && 'scale-105')} />
        <Badge badge={item.badge} />
      </span>
      <span>{item.label}</span>
    </div>
  )

  if (item.href) {
    return (
      <Link href={item.href} className="flex-1 text-center">
        {content}
      </Link>
    )
  }

  return (
    <button className="flex-1" type="button" onClick={item.onClick}>
      {content}
    </button>
  )
}

function Badge({ badge }: { badge?: NavBadge }) {
  if (!badge) return null
  if (badge.count && badge.count > 0) {
    return (
      <span
        className="absolute -top-1.5 -right-2 min-w-[18px] px-1 rounded-full bg-red-500 text-[10px] text-white font-semibold leading-4 text-center animate-[pulse_1.2s_ease-in-out_infinite]"
        aria-label={`${badge.count} new`}
      >
        {badge.count > 99 ? '99+' : badge.count}
      </span>
    )
  }
  if (badge.dot) {
    return <span className="absolute -top-1.5 -right-2 w-2.5 h-2.5 rounded-full bg-red-500" aria-label="New" />
  }
  return null
}
