'use client'

import { useMemo } from 'react'
import { Search, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'

type Row = { month: string; income: number; expenses: number }

const chartConfig = {
  income: {
    label: 'Rent Income',
    color: '#0066FF',
  },
  expenses: {
    label: 'Expenses',
    color: '#FF1A1A',
  },
} satisfies ChartConfig

function pctChange(prev: number, curr: number) {
  if (!prev) return null
  return ((curr - prev) / prev) * 100
}

export function PropertyIncomeVsExpensesChart({
  data,
  months,
  onToggleMonths,
}: {
  data: Row[]
  months: 6 | 12
  onToggleMonths: () => void
}) {
  const trend = useMemo(() => {
    if (!data?.length) return null
    const last = data[data.length - 1]?.income || 0
    const prev = data[data.length - 2]?.income || 0
    const pc = pctChange(prev, last)
    if (pc === null) return null
    return pc
  }, [data])

  return (
    <Card className="h-full">
      <CardHeader className="relative">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Rent Income vs Expenses</CardTitle>
            <CardDescription>
              Showing last {months} months (toggle to {months === 6 ? '12' : '6'} months)
            </CardDescription>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMonths}
            aria-label="Zoom range"
            title="Toggle 6 months / 12 months"
            className="shrink-0"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => String(value).slice(0, 3)}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
            <Bar dataKey="income" fill="var(--color-income)" radius={4} />
            <Bar dataKey="expenses" fill="var(--color-expenses)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>

      <CardFooter className="flex-col items-start gap-2 text-sm">
        {trend !== null ? (
          <div className="flex gap-2 leading-none font-medium">
            Income {trend >= 0 ? 'up' : 'down'} by {Math.abs(trend).toFixed(1)}% this month{' '}
            <TrendingUp className="h-4 w-4" />
          </div>
        ) : (
          <div className="text-muted-foreground leading-none">Trend not available yet.</div>
        )}
        <div className="text-muted-foreground leading-none">Blue = rent income, Red = expenses.</div>
      </CardFooter>
    </Card>
  )
}
