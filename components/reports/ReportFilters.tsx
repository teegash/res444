'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChronoSelect } from '@/components/ui/chrono-select'
import { cn } from '@/lib/utils'

export type ReportFilterState = {
  period: 'month' | 'quarter' | 'semi' | 'year' | 'all' | 'custom'
  propertyId: string
  groupBy: 'day' | 'week' | 'month'
  startDate?: string | null
  endDate?: string | null
}

export function ReportFilters(props: {
  value: ReportFilterState
  onChange: (next: ReportFilterState) => void
  properties: Array<{ id: string; name: string }>
  title?: string
}) {
  const { value, onChange, properties } = props
  const startDate = value.startDate ? new Date(`${value.startDate}T00:00:00`) : undefined
  const endDate = value.endDate ? new Date(`${value.endDate}T00:00:00`) : undefined
  const toIso = (date?: Date) => (date ? date.toISOString().slice(0, 10) : null)
  const isCustom = value.period === 'custom'

  return (
    <Card className="border bg-background">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[200px]">
            <Label className="text-xs text-muted-foreground">Time period</Label>
            <Select value={value.period} onValueChange={(v) => onChange({ ...value, period: v as any })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Last 30 days</SelectItem>
                <SelectItem value="quarter">Last 3 months</SelectItem>
                <SelectItem value="semi">Last 6 months</SelectItem>
                <SelectItem value="year">Last 12 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-[240px]">
            <Label className="text-xs text-muted-foreground">Property scope</Label>
            <Select value={value.propertyId} onValueChange={(v) => onChange({ ...value, propertyId: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="All properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All properties</SelectItem>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[180px]">
            <Label className="text-xs text-muted-foreground">Group by</Label>
            <Select value={value.groupBy} onValueChange={(v) => onChange({ ...value, groupBy: v as any })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={cn('w-[220px]', !isCustom && 'opacity-60')}>
            <Label className="text-xs text-muted-foreground">Start date</Label>
            <div className="mt-1">
              <ChronoSelect
                value={startDate}
                disabled={!isCustom}
                onChange={(date) => {
                  const nextStart = toIso(date)
                  const next = { ...value, startDate: nextStart }
                  if (nextStart && value.endDate && nextStart > value.endDate) {
                    next.endDate = nextStart
                  }
                  onChange(next)
                }}
                className="w-full"
              />
            </div>
          </div>
          <div className={cn('w-[220px]', !isCustom && 'opacity-60')}>
            <Label className="text-xs text-muted-foreground">End date</Label>
            <div className="mt-1">
              <ChronoSelect
                value={endDate}
                disabled={!isCustom}
                onChange={(date) => {
                  const nextEnd = toIso(date)
                  const next = { ...value, endDate: nextEnd }
                  if (nextEnd && value.startDate && nextEnd < value.startDate) {
                    next.startDate = nextEnd
                  }
                  onChange(next)
                }}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
