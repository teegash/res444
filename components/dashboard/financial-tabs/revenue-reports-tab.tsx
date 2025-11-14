'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const revenueBreakdown = [
  { building: 'Alpha Complex', revenue: 450000, percentage: 36 },
  { building: 'Beta Towers', revenue: 320000, percentage: 26 },
  { building: 'Gamma Heights', revenue: 480000, percentage: 38 },
]

const chartData = revenueBreakdown.map((item) => ({
  name: item.building,
  value: item.revenue,
}))

const COLORS = ['var(--primary)', 'var(--accent)', 'var(--chart-1)']

export function RevenueReportsTab() {
  return (
    <div className="space-y-6">
      {/* Revenue Breakdown Table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Building</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>Percentage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {revenueBreakdown.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{row.building}</TableCell>
                <TableCell>KES {row.revenue.toLocaleString()}</TableCell>
                <TableCell>{row.percentage}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Revenue Distribution Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Distribution by Building</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: KES ${(value / 1000).toFixed(0)}k`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
                formatter={(value) => `KES ${(value as number).toLocaleString()}`}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
