'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { NavItem } from './bottom-nav'
import { cn } from '@/lib/utils'

type MoreMenuProps = {
  items: NavItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
}

export function MoreMenu({ items, open, onOpenChange, trigger }: MoreMenuProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>More</SheetTitle>
          <SheetDescription>Additional actions and links</SheetDescription>
        </SheetHeader>
        <div className="mt-4 grid gap-2">
          {items.map((item) => (
            <MoreRow key={item.key} item={item} onClose={() => onOpenChange(false)} />
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MoreRow({ item, onClose }: { item: NavItem; onClose: () => void }) {
  const content = (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
      <item.icon className="h-5 w-5 text-slate-500" />
      <div className="flex-1 flex items-center justify-between">
        <p className="text-sm font-medium">{item.label}</p>
        {item.badge?.count ? (
          <span className="ml-2 min-w-[18px] px-1 rounded-full bg-red-500 text-[10px] text-white font-semibold leading-4 text-center">
            {item.badge.count > 99 ? '99+' : item.badge.count}
          </span>
        ) : item.badge?.dot ? (
          <span className="ml-2 w-2.5 h-2.5 rounded-full bg-red-500" />
        ) : null}
      </div>
    </div>
  )

  if (item.href) {
    return (
      <Link href={item.href} onClick={onClose} className="block">
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      className={cn('w-full text-left')}
      onClick={() => {
        item.onClick?.()
        onClose()
      }}
    >
      {content}
    </button>
  )
}
