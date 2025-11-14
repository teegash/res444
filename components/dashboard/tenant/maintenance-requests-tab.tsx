'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wrench, Plus, Clock, CheckCircle2 } from 'lucide-react'

const maintenanceRequests = [
  { id: 'MR-001', title: 'Leaking faucet', description: 'Kitchen tap dripping water continuously', status: 'In Progress', priority: 'Medium', created: 'Dec 2, 2024', updated: '2 days ago' },
  { id: 'MR-002', title: 'Light bulb replacement', description: 'Hall light not working', status: 'Completed', priority: 'Low', created: 'Nov 28, 2024', updated: '1 day ago' },
]

export function MaintenanceRequestsTab() {
  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
            <Wrench className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Maintenance Requests</h3>
            <p className="text-sm text-muted-foreground">Your recent maintenance requests</p>
          </div>
        </div>
        <Button className="bg-primary hover:bg-primary/90 gap-2">
          <Plus className="h-4 w-4" />
          Report Issue
        </Button>
      </div>

      <div className="grid gap-4">
        {maintenanceRequests.map((request) => (
          <Card key={request.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-lg">{request.title}</h4>
                    <Badge 
                      variant={request.priority === 'High' ? 'destructive' : request.priority === 'Medium' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {request.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{request.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Created {request.created}
                    </span>
                    <span>•</span>
                    <span>Updated {request.updated}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  {request.status === 'Completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-blue-600" />
                  )}
                  <Badge 
                    variant={request.status === 'Completed' ? 'default' : 'secondary'}
                    className={request.status === 'Completed' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}
                  >
                    {request.status}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm">View Details</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {maintenanceRequests.length === 0 && (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Wrench className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No maintenance requests</h3>
            <p className="text-sm text-muted-foreground mb-4">You haven't submitted any maintenance requests yet.</p>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Report an Issue
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
