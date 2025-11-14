'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Calendar, MapPin, Paperclip } from 'lucide-react'

const maintenanceData = [
  { id: 'MR-001', tenant: 'John Doe', unit: '12B', title: 'Leaking Tap', priority: 'Medium', status: 'In Progress', assigned: 'David K.', created: '2024-02-01' },
  { id: 'MR-002', tenant: 'Jane Smith', unit: '5A', title: 'Broken Door Lock', priority: 'High', status: 'Pending', assigned: 'Unassigned', created: '2024-02-02' },
  { id: 'MR-003', tenant: 'Mike Johnson', unit: '8C', title: 'AC Not Working', priority: 'High', status: 'Completed', assigned: 'James M.', created: '2024-01-28' },
  { id: 'MR-004', tenant: 'Sarah Lee', unit: '3D', title: 'Window Broken', priority: 'Medium', status: 'In Progress', assigned: 'David K.', created: '2024-02-03' },
]

export function MaintenanceRequestsTab() {
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')

  const filteredData = maintenanceData.filter(item => {
    const statusMatch = filterStatus === 'all' || item.status === filterStatus
    const priorityMatch = filterPriority === 'all' || item.priority === filterPriority
    return statusMatch && priorityMatch
  })

  const openDetails = (request) => {
    setSelectedRequest(request)
    setIsDetailsOpen(true)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filter Requests</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="High">High</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maintenance Requests ({filteredData.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2">Request ID</th>
                  <th className="text-left py-3 px-2">Tenant</th>
                  <th className="text-left py-3 px-2">Unit</th>
                  <th className="text-left py-3 px-2">Title</th>
                  <th className="text-left py-3 px-2">Priority</th>
                  <th className="text-left py-3 px-2">Status</th>
                  <th className="text-left py-3 px-2">Assigned</th>
                  <th className="text-left py-3 px-2">Created</th>
                  <th className="text-left py-3 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2 font-mono text-xs">{item.id}</td>
                    <td className="py-3 px-2">{item.tenant}</td>
                    <td className="py-3 px-2">{item.unit}</td>
                    <td className="py-3 px-2">{item.title}</td>
                    <td className="py-3 px-2">
                      <Badge variant={item.priority === 'High' ? 'destructive' : item.priority === 'Medium' ? 'secondary' : 'outline'}>
                        {item.priority}
                      </Badge>
                    </td>
                    <td className="py-3 px-2">
                      <Badge variant={item.status === 'Completed' ? 'default' : item.status === 'In Progress' ? 'secondary' : 'outline'}>
                        {item.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-2">{item.assigned}</td>
                    <td className="py-3 px-2">{item.created}</td>
                    <td className="py-3 px-2">
                      <Button variant="ghost" size="sm" onClick={() => openDetails(item)}>
                        View Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedRequest && (
        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Request Details: {selectedRequest.id}</DialogTitle>
              <DialogDescription>Issue: {selectedRequest.title}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold">Tenant</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.tenant}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">Unit</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.unit}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold mb-2">Description</p>
                <p className="text-sm text-muted-foreground">Detailed issue description would appear here with photos and attachments.</p>
              </div>
              <div className="flex gap-4">
                <Button variant="outline" size="sm">
                  <Paperclip className="h-4 w-4 mr-2" />
                  View Attachments
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold block mb-2">Priority</label>
                  <Select defaultValue={selectedRequest.priority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-2">Status</label>
                  <Select defaultValue={selectedRequest.status}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold block mb-2">Assign To</label>
                <Select defaultValue={selectedRequest.assigned}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Unassigned">Unassigned</SelectItem>
                    <SelectItem value="David K.">David K.</SelectItem>
                    <SelectItem value="James M.">James M.</SelectItem>
                    <SelectItem value="Peter N.">Peter N.</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-semibold block mb-2">Activity Timeline</label>
                <div className="text-sm text-muted-foreground space-y-2 p-3 bg-muted rounded">
                  <p>Feb 1, 2024 - Request created by John Doe</p>
                  <p>Feb 1, 2024 - Assigned to David K.</p>
                  <p>Feb 2, 2024 - Status updated to In Progress</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold block mb-2">Comments</label>
                <Textarea placeholder="Add comment for updates..." rows={3} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                  Close
                </Button>
                <Button>Mark Complete</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
