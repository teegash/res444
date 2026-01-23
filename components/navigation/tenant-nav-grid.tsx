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
    <div className={cn('grid gap-2.5', columns, className)} role="list">
      {items.map((item) => {
        const Icon = item.icon
        const active = item.key === activeKey
        const isLogout = item.key === 'logout'
        const content = (
          <div
            className={cn(
              'flex flex-col items-center gap-1 rounded-2xl px-2.5 py-2 text-[10px] font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
              isLogout
                ? 'flex-row justify-center gap-2 rounded-xl bg-red-500 text-white shadow-[0_8px_20px_rgba(239,68,68,0.28)] hover:bg-red-600 w-full'
                : active
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
            <Link
              key={item.key}
              href={item.href}
              className={cn('text-center', isLogout && 'col-span-full w-full')}
            >
              {content}
            </Link>
          )
        }

        return (
          <button
            key={item.key}
            className={cn('text-center', isLogout && 'col-span-full w-full')}
            type="button"
            onClick={item.onClick}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
