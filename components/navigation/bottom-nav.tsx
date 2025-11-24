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
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] pb-[max(env(safe-area-inset-bottom),12px)] md:hidden"
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
        'flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
        active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-300'
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
