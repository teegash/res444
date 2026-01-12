'use client'

import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'

type SuccessDetail = {
  label: string
  value?: string | number | null
}

type SuccessAction = {
  label: string
  onClick: () => void
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  className?: string
}

type SuccessModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  details?: SuccessDetail[]
  primaryAction?: SuccessAction
  secondaryAction?: SuccessAction
  icon?: ReactNode
}

export function SuccessModal({
  open,
  onOpenChange,
  title,
  description,
  details = [],
  primaryAction,
  secondaryAction,
  icon,
}: SuccessModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-0 bg-transparent p-0 shadow-none">
        <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-5 text-white">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15">
                {icon || <CheckCircle2 className="h-5 w-5 text-white" />}
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
                {description ? (
                  <DialogDescription className="text-sm text-white/80">{description}</DialogDescription>
                ) : null}
              </div>
            </div>
          </div>

          {details.length > 0 ? (
            <div className="px-6 py-4">
              <div className="grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 text-sm">
                {details.map((detail) => (
                  <div key={detail.label} className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">{detail.label}</span>
                    <span className="font-semibold text-slate-900">{detail.value ?? '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 border-t border-slate-100 px-6 py-4 sm:justify-end">
            {secondaryAction ? (
              <Button
                type="button"
                variant={secondaryAction.variant || 'outline'}
                onClick={secondaryAction.onClick}
                className={secondaryAction.className}
              >
                {secondaryAction.label}
              </Button>
            ) : null}
            {primaryAction ? (
              <Button
                type="button"
                variant={primaryAction.variant || 'default'}
                onClick={primaryAction.onClick}
                className={primaryAction.className || 'bg-emerald-600 hover:bg-emerald-700'}
              >
                {primaryAction.label}
              </Button>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
