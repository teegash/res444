'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, MessageCircle } from 'lucide-react'

const maintenanceRequests = [
  { id: 1, title: 'Leaking Tap', tenant: 'John Doe', unit: '12B', priority: 'Medium', status: 'Pending' },
  { id: 2, title: 'Broken Door Lock', tenant: 'Jane Smith', unit: '5A', priority: 'High', status: 'In Progress' },
  { id: 3, title: 'Window Broken', tenant: 'Sarah Lee', unit: '3D', priority: 'Medium', status: 'In Progress' },
]

export function MaintenanceRequestsCards() {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Maintenance Requests</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {maintenanceRequests.map((request) => (
          <Card key={request.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">{request.title}</CardTitle>
                <Badge variant={request.priority === 'High' ? 'destructive' : 'secondary'}>
                  {request.priority}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {request.tenant} • {request.unit}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select defaultValue={request.status}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="w-full text-xs">
                <MessageCircle className="h-3 w-3 mr-2" />
                Add Comment/Photo
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
