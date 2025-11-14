import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'

const metrics = [
  {
    title: 'Total Properties',
    value: '45',
    change: '+2.5%',
    positive: true,
  },
  {
    title: 'Occupied Units',
    value: '38/45',
    subtitle: '84%',
    change: '+1.2%',
    positive: true,
  },
  {
    title: 'Active Tenants',
    value: '152',
    change: '+4.8%',
    positive: true,
  },
  {
    title: 'Total Revenue (This Month)',
    value: 'KES 1,250,000',
    change: '+12.3%',
    positive: true,
  },
]

export function MetricsCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric, index) => (
        <Card key={index} className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {metric.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold">{metric.value}</div>
              {metric.subtitle && (
                <div className="text-xs text-muted-foreground">{metric.subtitle}</div>
              )}
              <div className="flex items-center gap-1">
                {metric.positive ? (
                  <TrendingUp className="w-4 h-4 text-accent" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-destructive" />
                )}
                <span
                  className={`text-xs font-medium ${
                    metric.positive ? 'text-accent' : 'text-destructive'
                  }`}
                >
                  {metric.change}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
