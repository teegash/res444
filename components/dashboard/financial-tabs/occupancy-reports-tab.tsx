'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const occupancyData = [
  { month: 'Jan', occupancy: 82, vacant: 8 },
  { month: 'Feb', occupancy: 84, vacant: 6 },
  { month: 'Mar', occupancy: 85, vacant: 5 },
  { month: 'Apr', occupancy: 86, vacant: 4 },
  { month: 'May', occupancy: 88, vacant: 2 },
  { month: 'Jun', occupancy: 89, vacant: 1 },
]

export function OccupancyReportsTab() {
  return (
    <div className="space-y-6">
      {/* Occupancy Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Occupancy Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={occupancyData}>
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
                dataKey="occupancy"
                stroke="var(--accent)"
                strokeWidth={2}
                name="Occupied Units"
              />
              <Line
                type="monotone"
                dataKey="vacant"
                stroke="var(--muted)"
                strokeWidth={2}
                name="Vacant Units"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Occupancy Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">89%</p>
            <p className="text-xs text-green-600 mt-1">+1% vs last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Vacant Units</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">5</p>
            <p className="text-xs text-muted-foreground mt-1">Units ready to lease</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
