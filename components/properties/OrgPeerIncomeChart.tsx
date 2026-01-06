'use client'

import { TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

type Row = { property: string; income: number }

function formatCompact(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\\.0$/, '')}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\\.0$/, '')}K`
  return `${n}`
}

const chartConfig = {
  income: {
    label: 'Rent revenue',
    color: '#0066FF',
  },
  label: {
    color: 'var(--background)',
  },
} satisfies ChartConfig

export function OrgPeerIncomeChart({ data, monthLabel }: { data: Row[]; monthLabel?: string }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Apartment revenue comparison</CardTitle>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <BarChart accessibilityLayer data={data} layout="vertical" margin={{ right: 28 }}>
            <CartesianGrid horizontal={false} />
            <YAxis dataKey="property" type="category" tickLine={false} tickMargin={10} axisLine={false} hide />
            <XAxis dataKey="income" type="number" hide />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  formatter={(value) => formatCompact(Number(value || 0))}
                />
              }
            />
            <Bar dataKey="income" layout="vertical" fill="var(--color-income)" radius={4}>
              <LabelList
                dataKey="property"
                position="insideLeft"
                offset={8}
                className="fill-[var(--color-label)]"
                fontSize={12}
              />
              <LabelList
                dataKey="income"
                position="right"
                offset={8}
                className="fill-foreground"
                fontSize={12}
                formatter={(v: any) => formatCompact(Number(v || 0))}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>

      {monthLabel ? (
        <div className="px-6 pb-5 text-sm font-medium flex items-center gap-2">
          <span>{monthLabel}</span>
          <TrendingUp className="h-4 w-4" />
        </div>
      ) : null}
    </Card>
  )
}
