import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Wrench } from 'lucide-react'

const maintenance = [
  {
    issue: 'Broken Window - Unit 101',
    priority: 'High',
    date: '2024-02-10',
  },
  {
    issue: 'Leaking Tap - Unit 205',
    priority: 'Medium',
    date: '2024-02-12',
  },
  {
    issue: 'Door Lock Repair - Unit 312',
    priority: 'High',
    date: '2024-02-08',
  },
  {
    issue: 'Ceiling Repair - Unit 401',
    priority: 'Low',
    date: '2024-02-14',
  },
  {
    issue: 'Plumbing Issue - Unit 103',
    priority: 'Critical',
    date: '2024-02-15',
  },
]

export function PendingMaintenance() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
            <Wrench className="w-4 h-4 text-red-500" />
          </div>
          <CardTitle>Pending Maintenance</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {maintenance.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div>
                <p className="font-medium text-sm">{item.issue}</p>
                <p className="text-xs text-muted-foreground">{item.date}</p>
              </div>
              <Badge
                variant={
                  item.priority === 'Critical' || item.priority === 'High'
                    ? 'destructive'
                    : item.priority === 'Medium'
                    ? 'default'
                    : 'secondary'
                }
                className="text-xs"
              >
                {item.priority}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
