'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const maintenance = [
  { id: 1, title: 'Leaking Tap', unit: '12B', priority: 'Medium', status: 'In Progress', assigned: 'David K.' },
  { id: 2, title: 'Broken Door Lock', unit: '5A', priority: 'High', status: 'Pending', assigned: 'Unassigned' },
  { id: 3, title: 'AC Not Working', unit: '8C', priority: 'High', status: 'Completed', assigned: 'James M.' },
]

export function ManagerMaintenanceList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance Requests</CardTitle>
        <CardDescription>Track maintenance issues in your properties</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {maintenance.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.unit} • Assigned to: {item.assigned}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={item.priority === 'High' ? 'destructive' : 'secondary'}>
                  {item.priority}
                </Badge>
                <Badge variant="outline">{item.status}</Badge>
                <Button variant="ghost" size="sm">Details</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
