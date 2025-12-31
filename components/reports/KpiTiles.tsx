'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

export type KpiItem = {
  label: string
  value: string
  valueClassName?: string
  subtext?: string
  trend?: {
    direction: 'up' | 'down' | 'flat'
    text: string
  }
}

export function KpiTiles(props: { items: KpiItem[]; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4', props.className)}>
      {props.items.map((kpi, idx) => (
        <Card
          key={idx}
          className="border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/80 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950"
        >
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
            <div
              className={cn(
                'mt-1 text-lg font-semibold tracking-tight leading-tight tabular-nums sm:text-xl',
                kpi.valueClassName
              )}
            >
              {kpi.value}
            </div>

            {(kpi.subtext || kpi.trend) && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <div className="text-muted-foreground">{kpi.subtext || ''}</div>
                {kpi.trend ? (
                  <div
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1',
                      kpi.trend.direction === 'up' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                      kpi.trend.direction === 'down' && 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
                      kpi.trend.direction === 'flat' && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {kpi.trend.direction === 'up' && <ArrowUpRight className="h-3.5 w-3.5" />}
                    {kpi.trend.direction === 'down' && <ArrowDownRight className="h-3.5 w-3.5" />}
                    <span className="font-medium">{kpi.trend.text}</span>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
