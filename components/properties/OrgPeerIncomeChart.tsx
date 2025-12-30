'use client'

import { TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
    label: 'Monthly rent income',
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
        <CardTitle>Apartment income comparison</CardTitle>
        <CardDescription>
          Monthly rent income across properties {monthLabel ? `(${monthLabel})` : ''}
        </CardDescription>
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

      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Comparing properties <TrendingUp className="h-4 w-4" />
        </div>
        <div className="text-muted-foreground leading-none">Values condensed using K/M for readability.</div>
      </CardFooter>
    </Card>
  )
}
