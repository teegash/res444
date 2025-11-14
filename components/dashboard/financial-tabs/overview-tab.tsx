'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const revenueData = [
  { month: 'Jan', revenue: 400000 },
  { month: 'Feb', revenue: 520000 },
  { month: 'Mar', revenue: 480000 },
  { month: 'Apr', revenue: 650000 },
  { month: 'May', revenue: 750000 },
  { month: 'Jun', revenue: 1250000 },
]

const paymentData = [
  { month: 'Jan', paid: 380000, unpaid: 20000, expenses: 100000 },
  { month: 'Feb', paid: 500000, unpaid: 20000, expenses: 120000 },
  { month: 'Mar', paid: 460000, unpaid: 20000, expenses: 115000 },
  { month: 'Apr', paid: 620000, unpaid: 30000, expenses: 140000 },
  { month: 'May', paid: 720000, unpaid: 30000, expenses: 155000 },
  { month: 'Jun', paid: 1200000, unpaid: 50000, expenses: 180000 },
]

export function OverviewTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">KES 666,667</p>
            <p className="text-xs text-green-600 mt-1">↑ 8.3% vs previous period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">KES 810,000</p>
            <p className="text-xs text-orange-600 mt-1">↑ 5.4% vs previous period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">KES 3.2M</p>
            <p className="text-xs text-muted-foreground mt-1">After all expenses</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Trend (12 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis stroke="var(--muted-foreground)" />
              <YAxis stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="var(--primary)"
                strokeWidth={2}
                name="Revenue (KES)"
                dot={{ fill: 'var(--primary)', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revenue & Expenses Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={paymentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis stroke="var(--muted-foreground)" />
              <YAxis stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="paid"
                stackId="1"
                fill="var(--accent)"
                name="Paid (KES)"
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stackId="1"
                fill="var(--destructive)"
                name="Expenses (KES)"
              />
              <Area
                type="monotone"
                dataKey="unpaid"
                stackId="1"
                fill="var(--muted)"
                name="Unpaid (KES)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Collection Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={paymentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis stroke="var(--muted-foreground)" />
              <YAxis stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              />
              <Legend />
              <Bar dataKey="paid" stackId="a" fill="var(--accent)" name="Paid (KES)" />
              <Bar
                dataKey="unpaid"
                stackId="a"
                fill="var(--destructive)"
                name="Unpaid (KES)"
              />
            </BarChart>
          </ResponsiveContainer>
          <Button className="mt-4">Generate Detailed Report</Button>
        </CardContent>
      </Card>
    </div>
  )
}
