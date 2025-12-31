'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type ReportFilterState = {
  period: 'month' | 'quarter' | 'semi' | 'year' | 'all'
  propertyId: string
  groupBy: 'day' | 'week' | 'month'
}

export function ReportFilters(props: {
  value: ReportFilterState
  onChange: (next: ReportFilterState) => void
  properties: Array<{ id: string; name: string }>
  title?: string
}) {
  const { value, onChange, properties } = props

  return (
    <Card className="border bg-background">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end justify-start gap-3">
          <div className="min-w-[180px] flex-1">
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
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[200px] flex-[1.2]">
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

          <div className="min-w-[160px] flex-1">
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
        </div>
      </CardContent>
    </Card>
  )
}
