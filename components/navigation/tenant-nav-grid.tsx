'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { NavItem } from '@/components/navigation/bottom-nav'

type TenantNavGridProps = {
  items: NavItem[]
  activeKey?: string
  columns?: string
  className?: string
  onSelect?: (key: string) => void
}

export function TenantNavGrid({
  items,
  activeKey,
  columns = 'grid-cols-3',
  className,
  onSelect,
}: TenantNavGridProps) {
  return (
    <div className={cn('grid gap-3', columns, className)} role="list">
      {items.map((item) => {
        const Icon = item.icon
        const active = item.key === activeKey
        const content = (
          <div
            className={cn(
              'flex flex-col items-center gap-1 rounded-2xl px-3 py-3 text-[11px] font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
              active
                ? 'text-blue-700 bg-white/70 shadow-[0_6px_16px_rgba(30,64,175,0.18)]'
                : 'text-slate-600 bg-white/50 hover:bg-white/80'
            )}
            onClick={() => onSelect?.(item.key)}
          >
            <Icon className={cn('h-5 w-5 transition-transform duration-150', active && 'scale-105')} />
            <span>{item.label}</span>
          </div>
        )

        if (item.href) {
          return (
            <Link key={item.key} href={item.href} className="text-center">
              {content}
            </Link>
          )
        }

        return (
          <button key={item.key} className="text-center" type="button" onClick={item.onClick}>
            {content}
          </button>
        )
      })}
    </div>
  )
}
