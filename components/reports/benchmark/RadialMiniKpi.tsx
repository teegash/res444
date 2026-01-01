'use client'

import * as React from 'react'
import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

type Props = {
  title: string
  subtitle?: string
  value: number
  max: number
  valueFormatter?: (n: number) => string
  ringLabel?: string
  valueColor?: string
  remainderColor?: string
  remainderLabel?: string
}

export function RadialMiniKpi({
  title,
  subtitle,
  value,
  max,
  valueFormatter,
  ringLabel,
  valueColor,
  remainderColor,
  remainderLabel,
}: Props) {
  const safeMax = Math.max(1, max)
  const clamped = Math.min(safeMax, Math.max(0, value))

  const chartData = [{ key: 'kpi', value: clamped, remainder: safeMax - clamped }]

  const chartConfig = {
    value: { label: ringLabel || title, color: valueColor || 'var(--chart-1)' },
    remainder: { label: remainderLabel || 'Remainder', color: remainderColor || 'hsl(270 85% 88%)' },
  } satisfies ChartConfig

  const display = valueFormatter ? valueFormatter(value) : String(value)

  return (
    <Card className="border bg-background">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">{title}</CardTitle>
        {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
      </CardHeader>

      <CardContent className="flex items-center justify-center pt-3">
        <ChartContainer config={chartConfig} className="aspect-square w-full max-w-[180px]">
          <RadialBarChart
            data={chartData}
            endAngle={-270}
            startAngle={90}
            innerRadius={66}
            outerRadius={92}
          >
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) - 4}
                        className="fill-foreground text-sm font-semibold"
                      >
                        {display}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 16}
                        className="fill-muted-foreground text-[10px]"
                      >
                        {ringLabel || 'KPI'}
                      </tspan>
                    </text>
                  )
                }}
              />
            </PolarRadiusAxis>

            <RadialBar
              dataKey="value"
              cornerRadius={8}
              fill="var(--color-value)"
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="remainder"
              cornerRadius={8}
              fill="var(--color-remainder)"
              className="stroke-transparent stroke-2"
            />
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
